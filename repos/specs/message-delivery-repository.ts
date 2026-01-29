import Repository from "./repository";

export interface MessageDeliveryReceipt {
  id: number;
  messageId: string;
  recipientVerificationKey: string;
  deliveredAt: number | null;
  readAt: number | null;
  createdAt: number;
}

export interface DeliveryStats {
  total: number;
  delivered: number;
}

export interface RecipientWithPseudonym {
  verificationKey: string;
  pseudonym: string;
  deliveredAt: number | null;
}

export default interface MessageDeliveryRepository extends Repository {
  /**
   * Create delivery receipts for all recipients when sending a message.
   */
  createReceiptsForMessage(
    messageId: string,
    recipientVerificationKeys: string[],
  ): Promise<void>;

  /**
   * Mark a specific recipient as having received the message.
   */
  markDelivered(
    messageId: string,
    recipientVerificationKey: string,
  ): Promise<void>;

  /**
   * Get delivery statistics for a message.
   */
  getDeliveryStats(messageId: string): Promise<DeliveryStats>;

  /**
   * Get all receipts for a message (for detailed view).
   */
  getReceipts(messageId: string): Promise<MessageDeliveryReceipt[]>;

  /**
   * Get receipts with pseudonyms for UI display.
   */
  getReceiptsWithPseudonyms(
    messageId: string,
  ): Promise<RecipientWithPseudonym[]>;

  /**
   * Delete all receipts for a message.
   */
  deleteByMessageId(messageId: string): Promise<void>;

  /**
   * Delete all receipts.
   */
  deleteAll(): Promise<void>;
}
