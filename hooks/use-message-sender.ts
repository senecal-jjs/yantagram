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
import Constants from "expo-constants";

export function useMessageSender() {
  const { getRepo } = useRepos();
  const outgoingMessagesRepo = getRepo<OutgoingMessagesRepository>(
    OutgoingMessagesRepositoryToken,
  );
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);

  const sendMessage = async (message: Message) => {
    // Store in both repositories
    await outgoingMessagesRepo.create(message);
    await messagesRepo.create(message);

    // Attempt immediate broadcast (foreground)
    const payload = toBinaryPayload(message);

    if (payload) {
      buildPacketsAndSend(payload, FragmentType.MESSAGE, PacketType.MESSAGE);
    }
  };

  // TODO: save amigo messages to their own repository
  const sendAmigoWelcome = async (message: WelcomeMessage) => {
    const messageBytes = serializeWelcomeMessage(message);
    buildPacketsAndSend(
      messageBytes,
      FragmentType.AMIGO_WELCOME,
      PacketType.AMIGO_WELCOME,
    );
  };

  const sendAmigoPathUpdate = async (message: UpdateMessage) => {
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
  ) => {
    const packets = buildPackets(message, fragmentType, packetType);

    try {
      for (const packet of packets) {
        const encoded = encode(packet);

        if (!encoded) {
          throw new Error("Failed to encode packet");
        }

        await BleModule.broadcastPacketAsync(encoded);
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
