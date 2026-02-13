import { PacketType } from "@/types/global";
import Repository from "./repository";

export interface OutgoingAmigoMessage {
  id: string;
  packetType: PacketType;
  payloadBase64: string;
  recipientVerificationKey: string | null;
  retryCount: number;
  lastRetryAt: number | null;
  createdAt: number;
}

export interface NewOutgoingAmigoMessage {
  id: string;
  packetType: PacketType;
  payloadBase64: string;
  recipientVerificationKey: string | null;
}

export default interface OutgoingAmigoMessagesRepository extends Repository {
  create(message: NewOutgoingAmigoMessage): Promise<void>;
  delete(messageId: string): Promise<void>;
  getById(messageId: string): Promise<OutgoingAmigoMessage | null>;
  exists(messageId: string): Promise<boolean>;
  getMessagesForRetry(
    intervalMs: number,
    maxRetries: number,
  ): Promise<OutgoingAmigoMessage[]>;
  updateRetryInfo(messageId: string): Promise<void>;
}
