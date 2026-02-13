import { PacketType } from "@/types/global";
import * as SQLite from "expo-sqlite";
import OutgoingAmigoMessagesRepository, {
  NewOutgoingAmigoMessage,
  OutgoingAmigoMessage,
} from "../specs/outgoing-amigo-messages-repository";
import Repository from "../specs/repository";

interface OutgoingAmigoMessageRow {
  id: string;
  packet_type: number;
  payload_base64: string;
  recipient_verification_key: string | null;
  retry_count: number;
  last_retry_at: number | null;
  created_at: number;
}

class SQOutgoingAmigoMessagesRepository
  implements OutgoingAmigoMessagesRepository, Repository
{
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(message: NewOutgoingAmigoMessage): Promise<void> {
    const statement = await this.db.prepareAsync(
      `INSERT OR IGNORE INTO outgoing_amigo_messages
        (id, packet_type, payload_base64, recipient_verification_key, retry_count, last_retry_at)
        VALUES ($id, $packetType, $payloadBase64, $recipientVerificationKey, 0, NULL)`,
    );

    try {
      await statement.executeAsync({
        $id: message.id,
        $packetType: message.packetType,
        $payloadBase64: message.payloadBase64,
        $recipientVerificationKey: message.recipientVerificationKey,
      });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async delete(messageId: string): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM outgoing_amigo_messages WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: messageId });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getById(messageId: string): Promise<OutgoingAmigoMessage | null> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM outgoing_amigo_messages WHERE id = $id LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<OutgoingAmigoMessageRow>({
        $id: messageId,
      });

      const row = await result.getFirstAsync();
      return row ? this.mapRowToOutgoingAmigoMessage(row) : null;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async exists(messageId: string): Promise<boolean> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM outgoing_amigo_messages WHERE id = $id",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>({
        $id: messageId,
      });

      const row = await result.getFirstAsync();
      return row ? row.count > 0 : false;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getMessagesForRetry(
    intervalMs: number,
    maxRetries: number,
  ): Promise<OutgoingAmigoMessage[]> {
    const now = Date.now();

    const statement = await this.db.prepareAsync(`
      SELECT * FROM outgoing_amigo_messages
      WHERE retry_count < $maxRetries
        AND (last_retry_at IS NULL OR ($now - last_retry_at) >= $intervalMs)
      ORDER BY created_at ASC
    `);

    try {
      const result = await statement.executeAsync<OutgoingAmigoMessageRow>({
        $maxRetries: maxRetries,
        $now: now,
        $intervalMs: intervalMs,
      });

      const rows = await result.getAllAsync();
      return rows.map((row) => this.mapRowToOutgoingAmigoMessage(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async updateRetryInfo(messageId: string): Promise<void> {
    const now = Date.now();
    const statement = await this.db.prepareAsync(
      "UPDATE outgoing_amigo_messages SET retry_count = retry_count + 1, last_retry_at = $now WHERE id = $id",
    );

    try {
      await statement.executeAsync({
        $id: messageId,
        $now: now,
      });
    } finally {
      await statement.finalizeAsync();
    }
  }

  private mapRowToOutgoingAmigoMessage(
    row: OutgoingAmigoMessageRow,
  ): OutgoingAmigoMessage {
    return {
      id: row.id,
      packetType: row.packet_type as PacketType,
      payloadBase64: row.payload_base64,
      recipientVerificationKey: row.recipient_verification_key,
      retryCount: row.retry_count,
      lastRetryAt: row.last_retry_at,
      createdAt: row.created_at,
    };
  }
}

export default SQOutgoingAmigoMessagesRepository;
