import { quickHash } from "@/utils/hash";
import * as SQLite from "expo-sqlite";
import PendingDecryptionRepository, {
  PendingDecryptionMessage,
} from "../specs/pending-decryption-repository";
import Repository from "../specs/repository";

export default class SQPendingDecryptionRepository
  implements PendingDecryptionRepository, Repository
{
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(
    encryptedPayload: Uint8Array,
  ): Promise<PendingDecryptionMessage> {
    const payloadHash = quickHash(encryptedPayload);

    // Check if already exists to avoid duplicates
    if (await this.exists(payloadHash)) {
      throw new Error("Pending message already exists");
    }

    const statement = await this.db.prepareAsync(
      `INSERT INTO pending_decryption_messages (encrypted_payload, payload_hash) 
       VALUES ($encryptedPayload, $payloadHash)`,
    );

    try {
      const result = await statement.executeAsync({
        $encryptedPayload: encryptedPayload,
        $payloadHash: payloadHash,
      });

      return {
        id: result.lastInsertRowId,
        encryptedPayload,
        createdAt: Date.now(),
      };
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAll(): Promise<PendingDecryptionMessage[]> {
    const statement = await this.db.prepareAsync(
      "SELECT id, encrypted_payload, created_at FROM pending_decryption_messages ORDER BY created_at ASC",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        encrypted_payload: Uint8Array;
        created_at: number;
      }>();

      const rows = await result.getAllAsync();

      return rows.map((row) => ({
        id: row.id,
        encryptedPayload: row.encrypted_payload,
        createdAt: row.created_at,
      }));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async delete(id: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM pending_decryption_messages WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: id });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async deleteOlderThan(maxAgeSeconds: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeSeconds * 1000;

    const statement = await this.db.prepareAsync(
      "DELETE FROM pending_decryption_messages WHERE created_at < $cutoffTime",
    );

    try {
      const result = await statement.executeAsync({ $cutoffTime: cutoffTime });
      return result.changes;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async exists(payloadHash: number): Promise<boolean> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM pending_decryption_messages WHERE payload_hash = $payloadHash",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>({
        $payloadHash: payloadHash,
      });

      const row = await result.getFirstAsync();
      return row ? row.count > 0 : false;
    } finally {
      await statement.finalizeAsync();
    }
  }
}
