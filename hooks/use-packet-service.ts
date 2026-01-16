import {
    deserializeAnnouncePayload,
    deserializeEncryptedMessage,
    deserializeUpdateMessage,
    deserializeWelcomeMessage,
} from "@/amigo/protocol";
import { verifyAnnouncePayload } from "@/amigo/upke";
import { useCredentials } from "@/contexts/credential-context";
import {
    ContactsRepositoryToken,
    FragmentsRepositoryToken,
    GroupMembersRepositoryToken,
    GroupsRepositoryToken,
    IncomingPacketsRepositoryToken,
    MessagesRepositoryToken,
    RelayPacketsRepositoryToken,
    useRepos,
} from "@/contexts/repository-context";
import { dbListener } from "@/repos/db-listener";
import ContactsRepository from "@/repos/specs/contacts-repository";
import FragmentsRepository from "@/repos/specs/fragments-repository";
import { GroupMembersRepository } from "@/repos/specs/group-members-repository";
import GroupsRepository from "@/repos/specs/groups-repository";
import IncomingPacketsRepository from "@/repos/specs/incoming-packets-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import RelayPacketsRepository from "@/repos/specs/relay-packets-repository";
import {
    AssembledData,
    extractFragmentMetadata,
    reassembleFragments,
} from "@/services/frag-service";
import { fromBinaryPayload } from "@/services/message-protocol-service";
import { packetQueue } from "@/services/packet-processor-queue";
import { decode } from "@/services/packet-protocol-service";
import { BitchatPacket, FragmentType, PacketType } from "@/types/global";
import { Mutex } from "@/utils/mutex";
import { useEffect } from "react";
import { useMessageSender } from "./use-message-sender";
import { useTTLBloomFilter } from "./use-ttl-bloom-filter";

const MAX_RELAY_PACKETS = 500; // Maximum packets to retain in FIFO relay queue

export function usePacketService() {
  const { add, has } = useTTLBloomFilter();
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
  const groupsRepository = getRepo<GroupsRepository>(GroupsRepositoryToken);
  const groupMembersRepository = getRepo<GroupMembersRepository>(
    GroupMembersRepositoryToken,
  );
  const contactsRepository = getRepo<ContactsRepository>(
    ContactsRepositoryToken,
  );
  const relayPacketsRepository = getRepo<RelayPacketsRepository>(
    RelayPacketsRepositoryToken,
  );
  const { member, saveMember } = useCredentials();
  const { sendAmigoPathUpdate } = useMessageSender();
  const mutex = new Mutex();

  // Set up queue processor
  useEffect(() => {
    packetQueue.setProcessor(processPacket);
  });

  /**
   * Persists the raw packet of bytes for further processing. The packet will either be relayed on to
   * other nodes in the mesh, or if the packet is intended for the user's device it will be decrypted and
   * stored in the [messages] table.
   *
   * @param packet A raw packet of bytes received over the mesh network.
   * @param deviceUUID The bluetooth identifier of the device that send the packet
   */
  const handleIncomingPacket = (packet: Uint8Array, deviceUUID: string) => {
    // check bloom filter to determine if packet has already been seen
    if (has(packet)) {
      return;
    }

    // add to bloom filter
    add(packet);

    const decodedPacket = decode(packet);

    if (!decodedPacket) throw new Error("Failed to deserialize packet bytes");

    // Store immediately
    incomingPacketsRepository.create(decodedPacket);

    // Queue for async processing
    packetQueue.enqueue(decodedPacket);

    // add to relay repository, packets are always added to the relay repository and re-broadcast
    // this prevents an observer from determining that a packet arrived at its intended recipient
    if (decodedPacket.allowedHops > 0) {
      // FIFO eviction: check capacity and evict oldest packets before adding new one
      // Prioritizes retaining Amigo/CGKA packets over regular messages
      relayPacketsRepository.count().then(async (currentCount) => {
        if (currentCount >= MAX_RELAY_PACKETS) {
          const toEvict = currentCount - MAX_RELAY_PACKETS + 1; // +1 to make room for new packet
          const evicted = await relayPacketsRepository.deleteOldest(toEvict);
          console.log(
            `[PacketService] FIFO eviction: removed ${evicted} oldest non-CGKA packets first (was ${currentCount}, max ${MAX_RELAY_PACKETS})`,
          );
        }
        relayPacketsRepository.create(decodedPacket, deviceUUID);
      });
    }
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
        await handleAmigoMessage(packet.payload);
        break;

      case PacketType.AMIGO_WELCOME:
        await handleAmigoWelcome(packet.payload);
        break;

      case PacketType.AMIGO_PATH_UPDATE:
        await handleAmigoPathUpdate(packet.payload);
        break;

      case PacketType.ANNOUNCE:
        await handleAnnounce(packet.payload);
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

    console.log("Received Amigo Welcome");

    const welcome = deserializeWelcomeMessage(welcomeBytes);

    try {
      // Attempt decryption of the welcome message, if successful
      // the message has reached its intended recipient.
      // try {
      const pathUpdate = await member.joinGroup(welcome);

      const groupName = await member.getGroupPseudonym(welcome);

      // group name off of tree info is an immutable unique uuid identifier for the group
      // the local group name variable can be changed at will by the user to identify the group on their device
      const group = await groupsRepository.create(
        pathUpdate.treeInfo.groupName,
        groupName,
        false,
        pathUpdate.treeInfo.expandable ?? true,
      );

      for (const credential of pathUpdate.treeInfo.credentials) {
        const verificationKeyBytes = Buffer.from(
          credential[1].verificationKey,
          "base64",
        );

        const contact =
          await contactsRepository.getByVerificationKey(verificationKeyBytes);

        if (contact) {
          groupMembersRepository.add(group.id, contact.id);
        } else {
          // create a new unknown contact (verified out of band == false)
          const newContact = await contactsRepository.create(
            {
              verificationKey: Buffer.from(
                credential[1].verificationKey,
                "base64",
              ),
              pseudonym: credential[1].pseudonym,
              signature: Buffer.from(credential[1].signature, "base64"),
              ecdhPublicKey: Buffer.from(credential[1].ecdhPublicKey, "base64"),
            },
            false,
          );

          groupMembersRepository.add(group.id, newContact.id);
        }
      }

      sendAmigoPathUpdate(pathUpdate.updateMessage);
      saveMember();
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

    console.log(`${member.pseudonym} received amigo message`);

    const encryptedMessage = deserializeEncryptedMessage(encryptedBytes);

    // it's possible the member's async cryptographic state isn't up to date.
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
      await mutex.runExclusive(async () => {
        const messageExists = await messagesRepository.exists(message.id);
        if (!messageExists) {
          await messagesRepository.create(
            message.id,
            message.groupId,
            message.sender,
            message.contents,
            message.timestamp,
          );
        }
      });
    } else {
      console.warn("Failed to decrypt message, save for future attempt");
    }
  };

  /**
   * Handle announce packets containing updated credentials from contacts.
   * Verifies the announce signature to ensure the pseudonym wasn't tampered with.
   * Also updates the group name for 1:1 chats with this contact.
   */
  const handleAnnounce = async (announceBytes: Uint8Array) => {
    try {
      const announcePayload = deserializeAnnouncePayload(announceBytes);

      // Verify the announce signature - this proves the pseudonym + timestamp
      // were signed by the holder of the private key for this verificationKey
      if (!verifyAnnouncePayload(announcePayload)) {
        console.warn("Received announce with invalid signature, ignoring");
        return;
      }

      const { credentials } = announcePayload;

      // Look up contact by verification key
      const contact = await contactsRepository.getByVerificationKey(
        credentials.verificationKey,
      );

      if (contact) {
        // Update contact with new pseudonym from announce
        if (contact.pseudonym !== credentials.pseudonym) {
          await contactsRepository.update(contact.id, {
            pseudonym: credentials.pseudonym,
          });

          // Also update the group name for any 1:1 chat with this contact
          const singleContactGroupId =
            await groupsRepository.getSingleContactGroup(contact.id);
          if (singleContactGroupId) {
            await groupsRepository.update(singleContactGroupId, {
              name: credentials.pseudonym,
            });
          }

          // Notify listeners that contact/group data has changed
          dbListener.notifyContactUpdate();

          console.log(
            `Updated contact pseudonym: ${contact.pseudonym} -> ${credentials.pseudonym}`,
          );
        }
      } else {
        // Unknown sender - could optionally create a new unverified contact
        console.log(
          `Received announce from unknown contact: ${credentials.pseudonym}`,
        );
      }
    } catch (error) {
      console.error("Failed to handle announce packet:", error);
    }
  };

  return { handleIncomingPacket, processPacket };
}
