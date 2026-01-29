import { Message } from "@/types/global";
import * as SQLite from "expo-sqlite";
import OutgoingMessagesRepository, {
  OutgoingMessage,
} from "../specs/outgoing-messages-repository";
import Repository from "../specs/repository";

interface OutgoingMessageRow {
  id: string;
  sender: string;
  contents: string;
  timestamp: number;
  group_id: string;
  retry_count: number;
  last_retry_at: number | null;
  created_at: number;
}

class SQOutgoingMessagesRepository
  implements OutgoingMessagesRepository, Repository
{
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(message: Message): Promise<Message> {
    const statement = await this.db.prepareAsync(
      "INSERT INTO outgoing_messages (id, sender, contents, timestamp, group_id, retry_count, last_retry_at) VALUES ($id, $sender, $contents, $timestamp, $groupId, 0, NULL)",
    );

    try {
      await statement.executeAsync({
        $id: message.id,
        $sender: message.sender,
        $contents: message.contents,
        $timestamp: message.timestamp,
        $groupId: message.groupId,
      });

      return message;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async delete(messageId: string): Promise<Message | null> {
    // First, get the message before deleting
    const getStatement = await this.db.prepareAsync(
      "SELECT * FROM outgoing_messages WHERE id = $id LIMIT 1",
    );

    try {
      const result = await getStatement.executeAsync<OutgoingMessageRow>({
        $id: messageId,
      });

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      const message = this.mapRowToMessage(row);

      // Now delete the message
      const deleteStatement = await this.db.prepareAsync(
        "DELETE FROM outgoing_messages WHERE id = $id",
      );

      try {
        await deleteStatement.executeAsync({ $id: messageId });
        console.log(
          `[OutgoingMessages] Deleted message ${messageId} from outgoing queue`,
        );
      } finally {
        await deleteStatement.finalizeAsync();
      }

      return message;
    } finally {
      await getStatement.finalizeAsync();
    }
  }

  async getAll(limit?: number): Promise<OutgoingMessage[]> {
    const query = limit
      ? "SELECT * FROM outgoing_messages ORDER BY timestamp ASC LIMIT $limit"
      : "SELECT * FROM outgoing_messages ORDER BY timestamp ASC";

    const statement = await this.db.prepareAsync(query);

    try {
      const result = limit
        ? await statement.executeAsync<OutgoingMessageRow>({ $limit: limit })
        : await statement.executeAsync<OutgoingMessageRow>();

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToOutgoingMessage(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getMessagesForRetry(
    intervalMs: number,
    maxRetries: number,
  ): Promise<OutgoingMessage[]> {
    const now = Date.now();

    // Get messages where:
    // 1. retry_count < maxRetries
    // 2. Either never retried (last_retry_at is NULL) OR enough time has passed since last retry
    const statement = await this.db.prepareAsync(`
      SELECT * FROM outgoing_messages 
      WHERE retry_count < $maxRetries 
        AND (last_retry_at IS NULL OR ($now - last_retry_at) >= $intervalMs)
      ORDER BY timestamp ASC
    `);

    try {
      const result = await statement.executeAsync<OutgoingMessageRow>({
        $maxRetries: maxRetries,
        $now: now,
        $intervalMs: intervalMs,
      });

      const rows = await result.getAllAsync();
      return rows.map((row) => this.mapRowToOutgoingMessage(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async updateRetryInfo(messageId: string): Promise<void> {
    const now = Date.now();
    const statement = await this.db.prepareAsync(
      "UPDATE outgoing_messages SET retry_count = retry_count + 1, last_retry_at = $now WHERE id = $id",
    );

    try {
      await statement.executeAsync({
        $id: messageId,
        $now: now,
      });
      console.log(
        `[OutgoingMessages] Updated retry info for message ${messageId}`,
      );
    } finally {
      await statement.finalizeAsync();
    }
  }

  async exists(messageId: string): Promise<boolean> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM outgoing_messages WHERE id = $id",
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

  /**
   * Convert database row to Message object (for backward compatibility)
   */
  private mapRowToMessage(row: OutgoingMessageRow): Message {
    return {
      id: row.id,
      groupId: row.group_id,
      sender: row.sender,
      contents: row.contents,
      timestamp: row.timestamp,
    };
  }

  /**
   * Convert database row to OutgoingMessage object (includes retry metadata)
   */
  private mapRowToOutgoingMessage(row: OutgoingMessageRow): OutgoingMessage {
    return {
      id: row.id,
      groupId: row.group_id,
      sender: row.sender,
      contents: row.contents,
      timestamp: row.timestamp,
      retryCount: row.retry_count,
      lastRetryAt: row.last_retry_at,
      createdAt: row.created_at,
    };
  }
}

export default SQOutgoingMessagesRepository;
