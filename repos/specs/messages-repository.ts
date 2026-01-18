import { DeliveryStatus, Message, MessageWithPseudonym } from "@/types/global";
import { UUID } from "@/types/utility";

/**
 * Holds complete, decrypted messages, where the intended final recipient was this device.
 * Also holds messages that originated from this device.
 * Group conversations are constructed from this repository.
 */
export default interface MessagesRepository {
  create(
    id: string,
    groupId: string,
    sender: string,
    contents: string,
    timestamp: number,
  ): Promise<Message>;
  get(id: UUID): Promise<Message>;
  getAll(limit: number): Promise<Message[]>;
  getByGroupId(
    groupId: string,
    limit: number,
    offset?: number,
  ): Promise<MessageWithPseudonym[]>;
  exists(id: UUID): Promise<boolean>;
  markGroupAsRead(groupId: UUID, notifyListener: boolean): Promise<void>;
  markAsRead(id: UUID, notifyListener: boolean): Promise<void>;
  hasUnreadInGroup(groupId: UUID): Promise<boolean>;
  updateDeliveryStatus(id: string, status: DeliveryStatus): Promise<void>;
  deleteOlderThan(timestampMs: number): Promise<number>;
  deleteAll(): Promise<void>;
}
