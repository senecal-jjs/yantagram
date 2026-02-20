import * as SQLite from "expo-sqlite";
import PendingDeliveryAcksRepository, {
  PendingDeliveryAck,
} from "../specs/pending-delivery-acks-repository";
import Repository from "../specs/repository";

interface PendingDeliveryAckRow {
  message_id: string;
  recipient_verification_key: string;
  first_sent_at: number;
  last_sent_at: number | null;
  retry_count: number;
}

class SQPendingDeliveryAcksRepository
  implements PendingDeliveryAcksRepository, Repository
{
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async recordSent(
    messageId: string,
    recipientVerificationKey: string,
    sentAt: number,
  ): Promise<void> {
    const insertStatement = await this.db.prepareAsync(
      `INSERT OR IGNORE INTO pending_delivery_acks
        (message_id, recipient_verification_key, first_sent_at, last_sent_at, retry_count)
        VALUES ($messageId, $recipientVerificationKey, $sentAt, $sentAt, 0)`,
    );

    try {
      await insertStatement.executeAsync({
        $messageId: messageId,
        $recipientVerificationKey: recipientVerificationKey,
        $sentAt: sentAt,
      });
    } finally {
      await insertStatement.finalizeAsync();
    }

    const updateStatement = await this.db.prepareAsync(
      `UPDATE pending_delivery_acks
       SET last_sent_at = $sentAt
       WHERE message_id = $messageId`,
    );

    try {
      await updateStatement.executeAsync({
        $messageId: messageId,
        $sentAt: sentAt,
      });
    } finally {
      await updateStatement.finalizeAsync();
    }
  }

  async getForRetry(
    intervalMs: number,
    maxAgeMs: number,
  ): Promise<PendingDeliveryAck[]> {
    const now = Date.now();

    const statement = await this.db.prepareAsync(`
      SELECT * FROM pending_delivery_acks
      WHERE ($now - first_sent_at) <= $maxAgeMs
        AND (last_sent_at IS NULL OR ($now - last_sent_at) >= $intervalMs)
      ORDER BY first_sent_at ASC
    `);

    try {
      const result = await statement.executeAsync<PendingDeliveryAckRow>({
        $now: now,
        $intervalMs: intervalMs,
        $maxAgeMs: maxAgeMs,
      });

      const rows = await result.getAllAsync();
      return rows.map((row) => this.mapRowToPendingAck(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async updateRetryInfo(messageId: string): Promise<void> {
    const now = Date.now();
    const statement = await this.db.prepareAsync(
      `UPDATE pending_delivery_acks
       SET retry_count = retry_count + 1, last_sent_at = $now
       WHERE message_id = $messageId`,
    );

    try {
      await statement.executeAsync({
        $messageId: messageId,
        $now: now,
      });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async delete(messageId: string): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM pending_delivery_acks WHERE message_id = $messageId",
    );

    try {
      await statement.executeAsync({ $messageId: messageId });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async deleteExpired(maxAgeMs: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeMs;
    const statement = await this.db.prepareAsync(
      "DELETE FROM pending_delivery_acks WHERE first_sent_at < $cutoffTime",
    );

    try {
      const result = await statement.executeAsync({
        $cutoffTime: cutoffTime,
      });
      return result.changes;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async exists(messageId: string): Promise<boolean> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM pending_delivery_acks WHERE message_id = $messageId",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>({
        $messageId: messageId,
      });

      const row = await result.getFirstAsync();
      return row ? row.count > 0 : false;
    } finally {
      await statement.finalizeAsync();
    }
  }

  private mapRowToPendingAck(row: PendingDeliveryAckRow): PendingDeliveryAck {
    return {
      messageId: row.message_id,
      recipientVerificationKey: row.recipient_verification_key,
      firstSentAt: row.first_sent_at,
      lastSentAt: row.last_sent_at,
      retryCount: row.retry_count,
    };
  }
}

export default SQPendingDeliveryAcksRepository;
