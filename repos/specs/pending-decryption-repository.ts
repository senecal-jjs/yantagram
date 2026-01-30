import Repository from "./repository";

export interface PendingDecryptionMessage {
  id: number;
  encryptedPayload: Uint8Array;
  createdAt: number;
}

export default interface PendingDecryptionRepository extends Repository {
  /**
   * Store a message that failed decryption for later retry.
   */
  create(encryptedPayload: Uint8Array): Promise<PendingDecryptionMessage>;

  /**
   * Get all pending messages for decryption retry.
   */
  getAll(): Promise<PendingDecryptionMessage[]>;

  /**
   * Delete a pending message after successful decryption.
   */
  delete(id: number): Promise<void>;

  /**
   * Delete all messages older than the specified age in seconds.
   */
  deleteOlderThan(maxAgeSeconds: number): Promise<number>;

  /**
   * Check if a message payload already exists (to avoid duplicates).
   */
  exists(payloadHash: number): Promise<boolean>;
}
