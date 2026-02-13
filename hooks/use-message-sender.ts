import {
  serializeEncryptedMessage,
  serializeUpdateMessage,
  serializeWelcomeMessage,
} from "@/amigo/protocol";
import { UpdateMessage, WelcomeMessage } from "@/amigo/types";
import { useCredentials } from "@/contexts/credential-context";
import {
  ContactsRepositoryToken,
  GroupMembersRepositoryToken,
  MessageDeliveryRepositoryToken,
  MessagesRepositoryToken,
  OutgoingAmigoMessagesRepositoryToken,
  OutgoingMessagesRepositoryToken,
  useRepos,
} from "@/contexts/repository-context";
import BleModule from "@/modules/ble/src/BleModule";
import ContactsRepository from "@/repos/specs/contacts-repository";
import { GroupMembersRepository } from "@/repos/specs/group-members-repository";
import MessageDeliveryRepository from "@/repos/specs/message-delivery-repository";
import MessagesRepository from "@/repos/specs/messages-repository";
import OutgoingAmigoMessagesRepository from "@/repos/specs/outgoing-amigo-messages-repository";
import OutgoingMessagesRepository from "@/repos/specs/outgoing-messages-repository";
import { fragmentPayload } from "@/services/frag-service";
import { toBinaryPayload } from "@/services/message-protocol-service";
import {
  encode,
  serializeDeliveryAck,
} from "@/services/packet-protocol-service";
import {
  BitchatPacket,
  FragmentType,
  Message,
  PacketType,
} from "@/types/global";
import { quickHashHex } from "@/utils/hash";
import { sleep } from "@/utils/sleep";
import { uint8ArrayToHexString } from "@/utils/string";
import Constants from "expo-constants";

export function useMessageSender() {
  const { member } = useCredentials();
  const { getRepo } = useRepos();
  const outgoingMessagesRepo = getRepo<OutgoingMessagesRepository>(
    OutgoingMessagesRepositoryToken,
  );
  const outgoingAmigoMessagesRepo = getRepo<OutgoingAmigoMessagesRepository>(
    OutgoingAmigoMessagesRepositoryToken,
  );
  const messagesRepo = getRepo<MessagesRepository>(MessagesRepositoryToken);
  const groupMembersRepo = getRepo<GroupMembersRepository>(
    GroupMembersRepositoryToken,
  );
  const contactsRepo = getRepo<ContactsRepository>(ContactsRepositoryToken);
  const messageDeliveryRepo = getRepo<MessageDeliveryRepository>(
    MessageDeliveryRepositoryToken,
  );

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

    // Create delivery receipts for all group members (excluding self)
    const myVerificationKey = uint8ArrayToHexString(
      member.credential.verificationKey,
    );
    const groupMembers = await groupMembersRepo.getByGroup(message.groupId);
    const recipientKeys: string[] = [];

    for (const gm of groupMembers) {
      const contact = await contactsRepo.get(gm.contactId);
      if (contact) {
        const contactKey = uint8ArrayToHexString(contact.verificationKey);
        if (contactKey !== myVerificationKey) {
          recipientKeys.push(contactKey);
        }
      }
    }

    if (recipientKeys.length > 0) {
      await messageDeliveryRepo.createReceiptsForMessage(
        message.id,
        recipientKeys,
      );
    }

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

  const sendAmigoWelcome = async (
    message: WelcomeMessage,
    recipientVerificationKey?: Uint8Array,
  ) => {
    console.log("Sending Amigo Welcome");
    const messageBytes = serializeWelcomeMessage(message);
    const messageId = quickHashHex(messageBytes);
    const recipientHex = recipientVerificationKey
      ? uint8ArrayToHexString(recipientVerificationKey)
      : null;

    const exists = await outgoingAmigoMessagesRepo.exists(messageId);
    if (!exists) {
      await outgoingAmigoMessagesRepo.create({
        id: messageId,
        packetType: PacketType.AMIGO_WELCOME,
        payloadBase64: Buffer.from(messageBytes).toString("base64"),
        recipientVerificationKey: recipientHex,
      });
    }

    buildPacketsAndSend(
      messageBytes,
      FragmentType.AMIGO_WELCOME,
      PacketType.AMIGO_WELCOME,
    );
  };

  const sendAmigoPathUpdate = async (message: UpdateMessage) => {
    console.log("Sending Amigo Path Update");
    const messageBytes = serializeUpdateMessage(message);
    const messageId = quickHashHex(messageBytes);

    const exists = await outgoingAmigoMessagesRepo.exists(messageId);
    if (!exists) {
      await outgoingAmigoMessagesRepo.create({
        id: messageId,
        packetType: PacketType.AMIGO_PATH_UPDATE,
        payloadBase64: Buffer.from(messageBytes).toString("base64"),
        recipientVerificationKey: null,
      });
    }

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

  return {
    sendMessage,
    sendAmigoWelcome,
    sendAmigoPathUpdate,
    sendDeliveryAck,
    sendAmigoAck,
  };

  /**
   * Broadcast a delivery acknowledgement for a received message.
   * This notifies the sender that the message was successfully delivered.
   */
  async function sendDeliveryAck(messageId: string): Promise<void> {
    if (!member) {
      throw new Error("Member state missing for sending delivery ACK");
    }

    const myVerificationKey = uint8ArrayToHexString(
      member.credential.verificationKey,
    );

    const ackPayload = serializeDeliveryAck({
      messageId,
      senderVerificationKey: myVerificationKey,
      timestamp: Date.now(),
    });

    const packet: BitchatPacket = {
      version: 1,
      type: PacketType.DELIVERY_ACK,
      timestamp: Date.now(),
      payload: ackPayload,
      allowedHops: 3,
    };

    const encoded = encode(packet);

    if (!encoded) {
      throw new Error("Failed to encode delivery ACK packet");
    }

    try {
      await BleModule.broadcastPacketAsync(encoded, []);
    } catch (error) {
      console.error("[DeliveryAck] Failed to broadcast:", error);
    }
  }

  /**
   * Broadcast an acknowledgement for a received amigo message.
   */
  async function sendAmigoAck(messageId: string): Promise<void> {
    if (!member) {
      throw new Error("Member state missing for sending amigo ACK");
    }

    const myVerificationKey = uint8ArrayToHexString(
      member.credential.verificationKey,
    );

    const ackPayload = serializeDeliveryAck({
      messageId,
      senderVerificationKey: myVerificationKey,
      timestamp: Date.now(),
    });

    const packet: BitchatPacket = {
      version: 1,
      type: PacketType.AMIGO_ACK,
      timestamp: Date.now(),
      payload: ackPayload,
      allowedHops: 3,
    };

    const encoded = encode(packet);

    if (!encoded) {
      throw new Error("Failed to encode amigo ACK packet");
    }

    try {
      await BleModule.broadcastPacketAsync(encoded, []);
    } catch (error) {
      console.error("[AmigoAck] Failed to broadcast:", error);
    }
  }
}
