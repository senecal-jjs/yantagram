import { useCredentials } from "@/contexts/credential-context";
import {
  FragmentsRepositoryToken,
  IncomingPacketsRepositoryToken,
  MessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import FragmentsRepository from "@/repos/specs/fragments-repository";
import IncomingPacketsRepository from "@/repos/specs/incoming-packets-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import {
  AssembledData,
  extractFragmentMetadata,
  reassembleFragments,
} from "@/services/frag-service";
import { fromBinaryPayload } from "@/services/message-protocol-service";
import { decode } from "@/services/packet-protocol-service";
import {
  deserializeEncryptedMessage,
  deserializeUpdateMessage,
  deserializeWelcomeMessage,
} from "@/treekem/protocol";
import { BitchatPacket, FragmentType, PacketType } from "@/types/global";
import { useMessageSender } from "./use-message-sender";

export function usePacketService() {
  const { getRepo } = useRepos();
  const incomingPacketsRepository = getRepo<IncomingPacketsRepository>(
    IncomingPacketsRepositoryToken,
  );
  const fragmentsRepository = getRepo<FragmentsRepository>(
    FragmentsRepositoryToken,
  );
  const messagesRepository = getRepo<MessagesRepository>(
    MessagesRepositoryToken,
  );
  const { member, saveMember } = useCredentials();
  const { sendAmigoPathUpdate } = useMessageSender();

  /**
   * Persists the raw packet of bytes for further processing. The packet will either be relayed on to
   * other nodes in the mesh, or if the packet is intended for the user's device it will be decrypted and
   * stored in the [messages] table.
   *
   * @param packet A raw packet of bytes received over the mesh network.
   */
  const handleIncomingPacket = (packet: Uint8Array) => {
    const decodedPacket = decode(packet);

    if (!decodedPacket) throw new Error("Failed to deserialize packet bytes");

    incomingPacketsRepository.create(decodedPacket);
  };

  /**
   * Takes further action on packet depending on type. If a MESSAGE packet can be
   * decrypted it is added to the messages table, if not it is added to the relay packets
   * table to be forwarded on the mesh network.
   *
   * @param packet A raw packet of bytes received over the mesh network
   */
  const processPacket = async (packet: BitchatPacket) => {
    // if no member state, do nothing
    if (!member) return;

    switch (packet.type) {
      case PacketType.FRAGMENT:
        const result = await handleFragment(packet);

        // If we were able re-assemble a message from the fragments, process further
        if (result) {
          switch (result.fragmentType) {
            case FragmentType.AMIGO_WELCOME:
              handleAmigoWelcome(result.data);
              break;
            case FragmentType.AMIGO_PATH_UPDATE:
              handleAmigoPathUpdate(result.data);
              break;
            case FragmentType.MESSAGE:
              handleAmigoMessage(result.data);
              break;
          }

          fragmentsRepository.deleteByFragmentId(result.fragmentId);
        }
        break;
      case PacketType.MESSAGE:
        handleAmigoMessage(packet.payload);
        break;

      case PacketType.AMIGO_WELCOME:
        handleAmigoWelcome(packet.payload);
        break;

      case PacketType.AMIGO_PATH_UPDATE:
        handleAmigoPathUpdate(packet.payload);
        break;

      default:
        console.warn("Unknown packet type:", packet.type);
    }
  };

  const handleFragment = async (
    packet: BitchatPacket,
  ): Promise<AssembledData | null> => {
    if (packet.type !== PacketType.FRAGMENT) {
      throw new Error(`Packet is not a fragment [packetType: ${packet.type}]`);
    }

    const metadata = extractFragmentMetadata(packet);

    if (!metadata) {
      throw new Error("Failed to extract metadata from fragment!");
    }

    const fragmentExists = await fragmentsRepository.exists(
      metadata.fragmentId,
      metadata.index,
    );

    if (!fragmentExists) {
      await fragmentsRepository.create(
        metadata.fragmentId,
        metadata.index,
        packet,
      );
    }

    const count = await fragmentsRepository.getFragmentCount(
      metadata.fragmentId,
    );

    if (count === metadata.total) {
      console.log("Assembling fragment");

      const fragments = await fragmentsRepository.getByFragmentId(
        metadata.fragmentId,
      );

      const assembledData = reassembleFragments(fragments);

      if (!assembledData) {
        throw new Error("Failed to construct message from fragments");
      }

      return assembledData;
    }

    return null;
  };

  const handleAmigoWelcome = async (welcomeBytes: Uint8Array) => {
    if (!member) {
      throw new Error("Member state missing");
    }

    const welcome = deserializeWelcomeMessage(welcomeBytes);

    // Attempt decryption of the welcome message, if successful
    // the message has reached its intended recipient.
    try {
      const pathUpdate = await member.joinGroup(welcome);
      sendAmigoPathUpdate(pathUpdate.updateMessage);
      saveMember();
      // TODO(broadcast path update)
    } catch (error) {
      console.log(error);
    }
  };

  const handleAmigoPathUpdate = async (pathUpdateBytes: Uint8Array) => {
    if (!member) {
      throw new Error("Member state missing");
    }

    const pathUpdate = deserializeUpdateMessage(pathUpdateBytes);

    for (const groupName of member.getGroupNames()) {
      try {
        await member.applyUpdatePath(
          pathUpdate.ciphertext,
          pathUpdate.nonce,
          groupName,
        );
        saveMember();
      } catch (error) {
        console.log(error);
      }
    }
  };

  const handleAmigoMessage = async (encryptedBytes: Uint8Array) => {
    if (!member) {
      throw new Error("Member state missing");
    }

    const encryptedMessage = deserializeEncryptedMessage(encryptedBytes);

    // it's possible the member's casync ryptographic state isn't up to date.
    // if decryption is unsuccessful, the message should be saved and decryption attempted
    // at a later date
    let messageBytes: Uint8Array | null = null;

    for (const groupName of member.getGroupNames()) {
      try {
        messageBytes = await member.decryptApplicationMessage(
          encryptedMessage.ciphertext,
          groupName,
          encryptedMessage.nonce,
          encryptedMessage.messageCounter,
        );
        saveMember();
      } catch (error) {
        console.log(error);
      }
    }

    if (messageBytes) {
      const message = fromBinaryPayload(messageBytes);
      messagesRepository.create(message);
    } else {
      console.warn("Failed to decrypt message, save for future attempt");
    }
  };

  return { handleIncomingPacket, processPacket };
}
