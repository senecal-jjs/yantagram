import * as SQLite from "expo-sqlite";
import { dbListener } from "../db-listener";
import MessageDeliveryRepository, {
  DeliveryStats,
  MessageDeliveryReceipt,
  RecipientWithPseudonym,
} from "../specs/message-delivery-repository";
import Repository from "../specs/repository";

class SQMessageDeliveryRepository
  implements MessageDeliveryRepository, Repository
{
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async createReceiptsForMessage(
    messageId: string,
    recipientVerificationKeys: string[],
  ): Promise<void> {
    if (recipientVerificationKeys.length === 0) return;

    // Use a transaction for batch insert
    await this.db.withTransactionAsync(async () => {
      const statement = await this.db.prepareAsync(
        `INSERT OR IGNORE INTO message_delivery_receipts 
         (message_id, recipient_verification_key) 
         VALUES ($messageId, $recipientKey)`,
      );

      try {
        for (const recipientKey of recipientVerificationKeys) {
          await statement.executeAsync({
            $messageId: messageId,
            $recipientKey: recipientKey,
          });
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
  }

  async markDelivered(
    messageId: string,
    recipientVerificationKey: string,
  ): Promise<void> {
    // Use LOWER() for case-insensitive comparison of hex strings
    const statement = await this.db.prepareAsync(
      `UPDATE message_delivery_receipts 
       SET delivered_at = $deliveredAt 
       WHERE message_id = $messageId 
         AND LOWER(recipient_verification_key) = LOWER($recipientKey)
         AND delivered_at IS NULL`,
    );

    try {
      const result = await statement.executeAsync({
        $messageId: messageId,
        $recipientKey: recipientVerificationKey,
        $deliveredAt: Date.now(),
      });

      console.log(
        `[MessageDelivery] markDelivered for ${messageId} / ${recipientVerificationKey.substring(0, 16)}... - ${result.changes} rows updated`,
      );

      if (result.changes > 0) {
        dbListener.notifyMessageChange();
      }
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getDeliveryStats(messageId: string): Promise<DeliveryStats> {
    const statement = await this.db.prepareAsync(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) as delivered
       FROM message_delivery_receipts 
       WHERE message_id = $messageId`,
    );

    try {
      const result = await statement.executeAsync<{
        total: number;
        delivered: number;
      }>({ $messageId: messageId });

      const row = await result.getFirstAsync();

      return {
        total: row?.total ?? 0,
        delivered: row?.delivered ?? 0,
      };
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getReceipts(messageId: string): Promise<MessageDeliveryReceipt[]> {
    const statement = await this.db.prepareAsync(
      `SELECT id, message_id, recipient_verification_key, delivered_at, read_at, created_at
       FROM message_delivery_receipts 
       WHERE message_id = $messageId`,
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        message_id: string;
        recipient_verification_key: string;
        delivered_at: number | null;
        read_at: number | null;
        created_at: number;
      }>({ $messageId: messageId });

      const rows = await result.getAllAsync();

      return rows.map((row) => ({
        id: row.id,
        messageId: row.message_id,
        recipientVerificationKey: row.recipient_verification_key,
        deliveredAt: row.delivered_at,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getReceiptsWithPseudonyms(
    messageId: string,
  ): Promise<RecipientWithPseudonym[]> {
    const statement = await this.db.prepareAsync(
      `SELECT 
         r.recipient_verification_key,
         COALESCE(c.pseudonym, 'Unknown') as pseudonym,
         r.delivered_at
       FROM message_delivery_receipts r
       LEFT JOIN contacts c ON r.recipient_verification_key = hex(c.verification_key)
       WHERE r.message_id = $messageId
       ORDER BY r.delivered_at DESC NULLS LAST`,
    );

    try {
      const result = await statement.executeAsync<{
        recipient_verification_key: string;
        pseudonym: string;
        delivered_at: number | null;
      }>({ $messageId: messageId });

      const rows = await result.getAllAsync();

      return rows.map((row) => ({
        verificationKey: row.recipient_verification_key,
        pseudonym: row.pseudonym,
        deliveredAt: row.delivered_at,
      }));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async deleteByMessageId(messageId: string): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM message_delivery_receipts WHERE message_id = $messageId",
    );

    try {
      await statement.executeAsync({ $messageId: messageId });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async deleteAll(): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM message_delivery_receipts",
    );

    try {
      await statement.executeAsync();
    } finally {
      await statement.finalizeAsync();
    }
  }
}

export default SQMessageDeliveryRepository;
