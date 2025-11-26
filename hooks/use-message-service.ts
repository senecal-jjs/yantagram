import Constants from "expo-constants";
import { useEffect, useRef } from "react";

import { useMessageProvider } from "@/contexts/message-context";
import {
  FragmentsRepositoryToken,
  MessagesRepositoryToken,
  OutgoingMessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import BleModule from "@/modules/ble/src/BleModule";
import FragmentsRepository from "@/repos/specs/fragments-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import OutgoingMessagesRepository from "@/repos/specs/outgoing-messages-repository";
import {
  extractFragmentMetadata,
  fragmentMessage,
  reassembleFragments,
} from "@/services/frag-service";
import {
  fromBinaryPayload,
  toBinaryPayload,
} from "@/services/message-protocol-service";
import { decode, encode } from "@/services/packet-protocol-service";
import {
  BitchatPacket,
  DeliveryStatus,
  Message,
  PacketType,
} from "@/types/global";
import { MessageService } from "@/types/interface";
import { Mutex } from "@/utils/mutex";
import { sleep } from "@/utils/sleep";

export function useMessageService(): MessageService {
  const mutex = new Mutex();
  const { getRepo } = useRepos();
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const fragmentsRepo = getRepo<FragmentsRepository>(FragmentsRepositoryToken);
  const outgoingMessagesRepo = getRepo<OutgoingMessagesRepository>(
    OutgoingMessagesRepositoryToken,
  );
  const { setMessages } = useMessageProvider();

  // Track if initial resend has occurred to prevent double execution in Strict Mode
  const hasInitialResendRef = useRef(false);

  // Resend outgoing messages every minute until acknowledged
  useEffect(() => {
    const resendOutgoingMessages = async () => {
      const outgoingMessages = await outgoingMessagesRepo.getAll();

      for (const message of outgoingMessages) {
        try {
          console.log(`Resending outgoing message: ${message.id}`);
          const packet = buildPacket(
            message,
            message.sender,
            message.recipientNickname || "",
          );

          if (
            Constants.expoConfig?.extra &&
            packet.length >= Constants.expoConfig?.extra.ble.mtuLimitBytes
          ) {
            const { fragments } = fragmentMessage(
              message,
              message.sender,
              message.recipientNickname || "",
            );
            await sendFragments(fragments);
          } else {
            await BleModule.broadcastPacketAsync(packet);
          }
        } catch (error) {
          console.error(`Failed to resend message ${message.id}:`, error);
        }
      }
    };

    // Run immediately on mount (only once, even in Strict Mode)
    // if (!hasInitialResendRef.current) {
    //   hasInitialResendRef.current = true;
    //   resendOutgoingMessages();
    // }

    // Get retry interval from config (default to 60 seconds if not configured)
    const retryIntervalSeconds =
      Constants.expoConfig?.extra?.ble?.outgoingMessageRetryIntervalSeconds ||
      60;
    const intervalMs = retryIntervalSeconds * 1000;

    // Set up interval to resend
    const intervalId = setInterval(resendOutgoingMessages, intervalMs);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [outgoingMessagesRepo]);

  const sendMessage = async (message: Message, from: string, to: string) => {
    messagesRepo.create(message);
    setMessages((prev) => [...prev, message]);

    // Fragment the message into multiple packets if required due to maximum transmission limits (MTU)
    // of bluetooth
    const packet = buildPacket(message, from, to);

    if (
      Constants.expoConfig?.extra &&
      packet.length >= Constants.expoConfig?.extra.ble.mtuLimitBytes
    ) {
      console.log(
        `Message exceeds BLE MTU, fragmenting... [mtu: ${Constants.expoConfig.extra.ble.mtuLimitBytes}]`,
      );
      const { fragments } = fragmentMessage(message, from, to);
      sendFragments(fragments);
    } else {
      console.log("broacasting packet");
      await BleModule.broadcastPacketAsync(packet);
    }

    // create an outgoing message record to track when a delivery acknowledgement is received
    outgoingMessagesRepo.create(message);
  };

  const sendFragments = async (fragments: BitchatPacket[]) => {
    for (const fragment of fragments) {
      const encodedPacket = encode(fragment);

      if (!encodedPacket) {
        throw new Error(`Failed to encode fragment`);
      }

      const metadata = extractFragmentMetadata(fragment);

      console.log(`broadcasting fragment index: ${metadata?.index}`);
      await BleModule.broadcastPacketAsync(encodedPacket);

      // Wait 1 second before next iteration
      await sleep(1000);
    }
  };

  const handlePacket = async (packet: Uint8Array) => {
    mutex.runExclusive(async () => {
      const decodedPacket = decode(packet);

      if (!decodedPacket) throw new Error("Failed to deserialize packet bytes");

      switch (decodedPacket.type) {
        case PacketType.ANNOUNCE:
          console.log("Received ANNOUNCE packet");
          // Handle peer announcement
          break;

        case PacketType.MESSAGE:
          console.log("Received MESSAGE packet");
          // Handle public chat message
          const payload = fromBinaryPayload(decodedPacket.payload);
          if (await messagesRepo.exists(payload.id)) return;
          messagesRepo.create(payload);
          setMessages((prev) => [...prev, payload]);
          sendDeliveryAck(
            payload.id,
            decodedPacket.recipientId,
            decodedPacket.senderId,
          );
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
          // Handle message fragment
          const metadata = extractFragmentMetadata(decodedPacket);

          console.log("Received FRAGMENT packet");

          if (!metadata) {
            throw new Error("Failed to extract metadata from fragment!");
          }

          const fragmentExists = await fragmentsRepo.exists(
            metadata.fragmentId,
            metadata.index,
          );

          if (!fragmentExists) {
            await fragmentsRepo.create(
              metadata.fragmentId,
              metadata.index,
              decodedPacket,
            );
          }

          const count = await fragmentsRepo.getFragmentCount(
            metadata.fragmentId,
          );

          console.log(`Fragment count: ${count}, total: ${metadata.total}`);

          if (count === metadata.total) {
            console.log("re-assembling fragment");

            const fragments = await fragmentsRepo.getByFragmentId(
              metadata.fragmentId,
            );

            const assembledMessage = reassembleFragments(fragments);

            if (!assembledMessage) {
              throw new Error("Failed to construct message from fragments");
            }

            if (await messagesRepo.exists(assembledMessage.id)) {
              return;
            }

            messagesRepo.create(assembledMessage);
            setMessages((prev) => [...prev, assembledMessage]);
            fragmentsRepo.deleteByFragmentId(metadata.fragmentId);

            sendDeliveryAck(
              assembledMessage.id,
              decodedPacket.recipientId,
              decodedPacket.senderId,
            );
          }
          break;

        case PacketType.FILE_TRANSFER:
          console.log("Received FILE_TRANSFER packet");
          // Handle file transfer
          break;

        case PacketType.DELIVERY_ACK:
          console.log("Received DELIVERY_ACK packet");
          const deliveryAckMsg = fromBinaryPayload(decodedPacket.payload);
          if (await outgoingMessagesRepo.exists(deliveryAckMsg.id)) {
            outgoingMessagesRepo.delete(deliveryAckMsg.id);
          }
          break;

        case PacketType.READ_RECEIPT:
          break;

        default:
          console.warn("Unknown packet type:", decodedPacket.type);
      }
    });
  };

  const sendDeliveryAck = (messageId: string, from: string, to: string) => {
    const ack = buildDeliveryAck(messageId, from, to);
    const encodedAck = encode(ack);
    if (!encodedAck) throw new Error("Failed to encode delivery ack packet");
    BleModule.broadcastPacketAsync(encodedAck);
  };

  const buildDeliveryAck = (
    messageId: string,
    from: string,
    to: string,
  ): BitchatPacket => {
    const message = {
      id: messageId,
      sender: from,
      contents: "",
      timestamp: Date.now(),
      isRelay: false,
      originalSender: from,
      isPrivate: true,
      recipientNickname: null,
      senderPeerId: from,
      deliveryStatus: DeliveryStatus.SENDING,
    };

    const payload = toBinaryPayload(message);

    if (!payload) throw new Error("Failed to encode delivery ack message");

    return {
      version: 1,
      type: PacketType.DELIVERY_ACK,
      senderId: from,
      recipientId: to,
      timestamp: Date.now(),
      payload: payload,
      signature: null,
      allowedHops: 8,
      route: new Uint8Array(),
    };
  };

  const buildPacket = (
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
      throw new Error(`Failed to encode packet [messageId: ${message.id}]`);
    }

    return encodedPacket;
  };

  return {
    sendMessage,
    handlePacket,
  };
}
