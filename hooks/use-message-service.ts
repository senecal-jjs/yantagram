import { useMessageProvider } from "@/contexts/message-context";
import { useRepos } from "@/contexts/repository-context";
import BleModule from "@/modules/ble/src/BleModule";
import {
  fromBinaryPayload,
  toBinaryPayload,
} from "@/services/message-protocol-service";
import { decode, encode } from "@/services/packet-protocol-service";
import { BitchatPacket, Message, PacketType } from "@/types/global";
import { MessageService } from "@/types/interface";
import { Mutex } from "@/utils/mutex";

export function useMessageService(): MessageService {
  const mutex = new Mutex();
  const { getRepo } = useRepos();
  const messagesRepo = getRepo("messagesRepo");
  const { setMessages } = useMessageProvider();

  const sendMessage = (message: Message, from: string, to: string) => {
    const encoded = encodeMessage(message, from, to);
    messagesRepo.create(message);
    setMessages((prev) => [...prev, message]);
    BleModule.broadcastPacketAsync(encoded);
  };

  const handlePacket = async (packet: Uint8Array) => {
    mutex.runExclusive(async () => {
      const decodedPacket = decode(packet);

      if (!decodedPacket) throw Error("Failed to deserialize packet bytes");

      const payload = fromBinaryPayload(decodedPacket.payload);

      if (await messagesRepo.exists(payload.id)) return;

      switch (decodedPacket.type) {
        case PacketType.ANNOUNCE:
          console.log("Received ANNOUNCE packet");
          // Handle peer announcement
          break;

        case PacketType.MESSAGE:
          console.log("Received MESSAGE packet");
          // Handle public chat message
          messagesRepo.create(payload);
          setMessages((prev) => [...prev, payload]);
          break;

        case PacketType.LEAVE:
          console.log("Received LEAVE packet");
          // Handle peer leaving
          break;

        case PacketType.NOISE_HANDSHAKE:
          console.log("Received NOISE_HANDSHAKE packet");
          // Handle noise protocol handshake
          break;

        case PacketType.NOISE_ENCRYPTED:
          console.log("Received NOISE_ENCRYPTED packet");
          // Handle encrypted payload
          break;

        case PacketType.FRAGMENT:
          console.log("Received FRAGMENT packet");
          // Handle message fragment
          break;

        case PacketType.FILE_TRANSFER:
          console.log("Received FILE_TRANSFER packet");
          // Handle file transfer
          break;

        default:
          console.warn("Unknown packet type:", decodedPacket.type);
      }
    });
  };

  const encodeMessage = (
    message: Message,
    from: string,
    to: string,
  ): Uint8Array => {
    const encodedMessage = toBinaryPayload(message);

    if (!encodedMessage) {
      throw Error(`Failed to encode message [messageId: ${message.id}]`);
    }

    const packet: BitchatPacket = {
      version: 1,
      type: PacketType.MESSAGE,
      senderId: from,
      recipientId: to,
      timestamp: Date.now(),
      payload: encodedMessage,
      signature: null,
      allowedHops: 3,
      route: new Uint8Array(),
    };

    const encodedPacket = encode(packet);

    if (!encodedPacket) {
      throw Error(`Failed to encode packet [messageId: ${message.id}]`);
    }

    return encodedPacket;
  };

  return {
    sendMessage,
    handlePacket,
  };
}
