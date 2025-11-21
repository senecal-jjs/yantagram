import { useBluetooth } from "@/components/bluetooth-context";
import { encode } from "@/services/packet-service";
import { toBinaryPayload } from "@/services/protocol-service";
import { BitchatPacket, Message, PacketType, Result } from "@/types/global";
import { MessageService } from "@/types/interface";
import base64 from "react-native-base64";

function useBleMessaging(
  serviceUUID: string,
  characteristicUUID: string,
): MessageService {
  const { connectedDevices } = useBluetooth();

  const sendMessage = (message: Message, from: string, to: string): Result => {
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

    connectedDevices.forEach((device) => {
      console.log(`broadcasting to device ${device.id}`);
      device.writeCharacteristicWithoutResponseForService(
        serviceUUID,
        characteristicUUID,
        base64.encodeFromByteArray(encodedPacket),
      );
    });

    return Result.SUCCESS;
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
    encodeMessage,
  };
}

export default useBleMessaging;
