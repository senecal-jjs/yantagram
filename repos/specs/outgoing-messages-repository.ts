import { Message } from "@/types/global";

/**
 * Represents a message awaiting delivery confirmation with retry metadata.
 */
export interface OutgoingMessage extends Message {
  retryCount: number;
  lastRetryAt: number | null;
  createdAt: number;
}

/**
 * Holds messages awaiting broadcast, that originated on this device.
 */
export default interface OutgoingMessagesRepository {
  create(message: Message): Promise<Message>;
  delete(messageId: string): Promise<Message | null>;
  getAll(limit?: number): Promise<OutgoingMessage[]>;
  exists(messageId: string): Promise<boolean>;
  deleteByGroupId(groupId: string): Promise<void>;
  /**
   * Get messages that are due for retry based on the interval.
   * @param intervalMs - Minimum time (in ms) that must have passed since last retry
   * @param maxRetries - Maximum number of retry attempts before giving up
   */
  getMessagesForRetry(
    intervalMs: number,
    maxRetries: number,
  ): Promise<OutgoingMessage[]>;
  /**
   * Update the retry metadata for a message after a retry attempt.
   */
  updateRetryInfo(messageId: string): Promise<void>;
}
