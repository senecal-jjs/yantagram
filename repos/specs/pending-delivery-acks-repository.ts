import Repository from "./repository";

export interface PendingDeliveryAck {
  messageId: string;
  recipientVerificationKey: string;
  firstSentAt: number;
  lastSentAt: number | null;
  retryCount: number;
}

export default interface PendingDeliveryAcksRepository extends Repository {
  /**
   * Record a delivery ACK send attempt. Creates the record if missing,
   * and always updates the last sent timestamp.
   */
  recordSent(
    messageId: string,
    recipientVerificationKey: string,
    sentAt: number,
  ): Promise<void>;

  /**
   * Get pending ACKs due for retry.
   * @param intervalMs - Minimum time (ms) between retries
   * @param maxAgeMs - Maximum age (ms) before expiring
   */
  getForRetry(
    intervalMs: number,
    maxAgeMs: number,
  ): Promise<PendingDeliveryAck[]>;

  /**
   * Update retry metadata after a retry attempt.
   */
  updateRetryInfo(messageId: string): Promise<void>;

  /**
   * Remove a pending ACK after receiving confirmation.
   */
  delete(messageId: string): Promise<void>;

  /**
   * Delete ACKs older than maxAgeMs.
   */
  deleteExpired(maxAgeMs: number): Promise<number>;

  /**
   * Check if a pending ACK exists.
   */
  exists(messageId: string): Promise<boolean>;
}
