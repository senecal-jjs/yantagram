import { useCredentials } from "@/contexts/credential-context";
import {
  MessagesRepositoryToken,
  OutgoingMessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import BleModule from "@/modules/ble/src/BleModule";
import MessagesRepository from "@/repos/specs/messages-repository";
import OutgoingMessagesRepository from "@/repos/specs/outgoing-messages-repository";
import { fragmentPayload } from "@/services/frag-service";
import { toBinaryPayload } from "@/services/message-protocol-service";
import { encode } from "@/services/packet-protocol-service";
import {
  serializeEncryptedMessage,
  serializeUpdateMessage,
  serializeWelcomeMessage,
} from "@/treekem/protocol";
import { UpdateMessage, WelcomeMessage } from "@/treekem/types";
import {
  BitchatPacket,
  FragmentType,
  Message,
  PacketType,
} from "@/types/global";
import { sleep } from "@/utils/sleep";
import Constants from "expo-constants";

export function useMessageSender() {
  const { member } = useCredentials();
  const { getRepo } = useRepos();
  const outgoingMessagesRepo = getRepo<OutgoingMessagesRepository>(
    OutgoingMessagesRepositoryToken,
  );
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);

  const sendMessage = async (message: Message) => {
    if (!member) {
      throw new Error("Member state missing");
    }

    const exists = await messagesRepo.exists(message.id);

    if (exists) return;

    // Store in both repositories
    await outgoingMessagesRepo.create(message);
    await messagesRepo.create(
      message.id,
      message.groupId,
      message.sender,
      message.contents,
      message.timestamp,
    );

    // Attempt immediate broadcast (foreground)
    const payload = toBinaryPayload(message);

    if (!payload) {
      throw new Error("Failed to encode message to binary payload");
    }

    const encryptedPayload = await member.encryptApplicationMessage(
      payload,
      message.groupId,
    );

    const encryptedBytes = serializeEncryptedMessage(encryptedPayload);

    if (payload) {
      buildPacketsAndSend(
        encryptedBytes,
        FragmentType.MESSAGE,
        PacketType.MESSAGE,
      );
    }
  };

  // TODO: save amigo messages to their own repository
  const sendAmigoWelcome = async (message: WelcomeMessage) => {
    console.log("Sending Amigo Welcome");
    const messageBytes = serializeWelcomeMessage(message);
    buildPacketsAndSend(
      messageBytes,
      FragmentType.AMIGO_WELCOME,
      PacketType.AMIGO_WELCOME,
    );
  };

  const sendAmigoPathUpdate = async (message: UpdateMessage) => {
    console.log("Sending Amigo Path Update");
    const messageBytes = serializeUpdateMessage(message);
    buildPacketsAndSend(
      messageBytes,
      FragmentType.AMIGO_PATH_UPDATE,
      PacketType.AMIGO_PATH_UPDATE,
    );
  };

  const buildPacketsAndSend = async (
    message: Uint8Array,
    fragmentType: FragmentType,
    packetType: PacketType,
    blackoutDeviceUUIDs: string[] = [],
  ) => {
    const packets = buildPackets(message, fragmentType, packetType);

    try {
      for (const packet of packets) {
        const encoded = encode(packet);

        if (!encoded) {
          throw new Error("Failed to encode packet");
        }

        await BleModule.broadcastPacketAsync(encoded, blackoutDeviceUUIDs);

        await sleep(100);
      }
    } catch (error) {
      console.error(
        "[Foreground] Immediate broadcast failed, will retry in background:",
        error,
      );
    }
  };

  const buildPackets = (
    data: Uint8Array,
    fragmentType: FragmentType,
    packetType: PacketType,
  ): BitchatPacket[] => {
    if (
      Constants.expoConfig?.extra &&
      data.length >= Constants.expoConfig?.extra.ble.mtuLimitBytes
    ) {
      console.log(
        `Message exceeds BLE MTU, fragmenting... [mtu: ${Constants.expoConfig.extra.ble.mtuLimitBytes}]`,
      );

      const { fragments } = fragmentPayload(data, fragmentType);
      return fragments;
    } else {
      return [
        {
          version: 1,
          type: packetType,
          timestamp: Date.now(),
          payload: data,
          allowedHops: 3,
        },
      ];
    }
  };

  return { sendMessage, sendAmigoWelcome, sendAmigoPathUpdate };
}
