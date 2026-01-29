import { DeliveryStatus, Message, MessageWithPseudonym } from "@/types/global";
import { UUID } from "@/types/utility";
import * as SQLite from "expo-sqlite";
import { dbListener } from "../db-listener";
import MessagesRepository from "../specs/messages-repository";
import Repository from "../specs/repository";

class SQMessagesRepository implements MessagesRepository, Repository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async deleteAll(): Promise<void> {
    const statement = await this.db.prepareAsync("DELETE FROM messages");

    try {
      await statement.executeAsync();
    } finally {
      await statement.finalizeAsync();

      // Notify listeners of the change
      dbListener.notifyMessageChange();
    }
  }

  async deleteOlderThan(timestampMs: number): Promise<number> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM messages WHERE timestamp < $timestamp",
    );

    try {
      const result = await statement.executeAsync({
        $timestamp: timestampMs,
      });
      const deletedCount = result.changes;

      if (deletedCount > 0) {
        dbListener.notifyMessageChange();
      }

      return deletedCount;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async create(
    id: string,
    groupId: string,
    sender: string,
    contents: string,
    timestamp: number,
  ): Promise<Message> {
    const statement = await this.db.prepareAsync(
      "INSERT INTO messages (id, sender, contents, timestamp, group_id) VALUES ($id, $sender, $contents, $timestamp, $groupId)",
    );

    try {
      await statement.executeAsync({
        $id: id,
        $sender: sender,
        $contents: contents,
        $timestamp: timestamp,
        $groupId: groupId,
      });
      return await this.get(id);
    } finally {
      await statement.finalizeAsync();

      // Notify listeners of the change
      dbListener.notifyMessageChange();
    }
  }

  async get(id: UUID): Promise<Message> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM messages WHERE id = $id LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        id: string;
        sender: string;
        contents: string;
        timestamp: number;
        group_id: string;
        delivery_status: number;
      }>({ $id: id });

      const row = await result.getFirstAsync();

      if (!row) {
        throw new Error(`Message with id ${id} not found`);
      }

      return this.mapRowToMessage(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAll(limit: number): Promise<Message[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM messages ORDER BY timestamp ASC LIMIT $limit",
    );

    try {
      const result = await statement.executeAsync<{
        id: string;
        sender: string;
        contents: string;
        timestamp: number;
        group_id: string;
        delivery_status: number;
      }>({ $limit: limit });

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToMessage(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getByGroupId(
    groupId: string,
    limit: number,
    offset: number = 0,
  ): Promise<MessageWithPseudonym[]> {
    const statement = await this.db.prepareAsync(
      "SELECT messages.*, contacts.pseudonym FROM messages LEFT JOIN contacts ON messages.sender = contacts.verification_key WHERE messages.group_id = $groupId ORDER BY messages.timestamp DESC LIMIT $limit OFFSET $offset",
    );

    try {
      const result = await statement.executeAsync<{
        id: string;
        sender: string;
        contents: string;
        timestamp: number;
        group_id: string;
        delivery_status: number;
        pseudonym: string | null;
      }>({ $groupId: groupId, $limit: limit, $offset: offset });

      const rows = await result.getAllAsync();

      // Reverse to get chronological order (oldest first)
      return rows.reverse().map((row) => ({
        message: this.mapRowToMessage(row),
        pseudonym: row.pseudonym || "Unknown",
      }));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async exists(id: UUID): Promise<boolean> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM messages WHERE id = $id",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>({
        $id: id,
      });

      const row = await result.getFirstAsync();

      return row ? row.count > 0 : false;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async markAsRead(id: UUID, notifyListener: boolean): Promise<void> {
    const statement = await this.db.prepareAsync(
      "UPDATE messages SET was_read = 1 WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: id });
    } finally {
      await statement.finalizeAsync();
      if (notifyListener) {
        dbListener.notifyMessageChange();
      }
    }
  }

  async markGroupAsRead(groupId: UUID, notifyListener: boolean): Promise<void> {
    const statement = await this.db.prepareAsync(
      "UPDATE messages SET was_read = 1 WHERE group_id = $groupId AND was_read = 0",
    );

    try {
      await statement.executeAsync({ $groupId: groupId });
    } finally {
      await statement.finalizeAsync();
      if (notifyListener) {
        dbListener.notifyMessageChange();
      }
    }
  }

  async hasUnreadInGroup(groupId: UUID): Promise<boolean> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM messages WHERE group_id = $groupId AND was_read = 0",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>({
        $groupId: groupId,
      });

      const row = await result.getFirstAsync();

      return row ? row.count > 0 : false;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async updateDeliveryStatus(
    id: string,
    status: DeliveryStatus,
  ): Promise<void> {
    const statement = await this.db.prepareAsync(
      "UPDATE messages SET delivery_status = $status WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: id, $status: status });
    } finally {
      await statement.finalizeAsync();
      dbListener.notifyMessageChange();
    }
  }

  /**
   * Convert database row to Message object
   */
  private mapRowToMessage(row: {
    id: string;
    sender: string;
    contents: string;
    timestamp: number;
    group_id: string;
    delivery_status?: number;
  }): Message {
    return {
      id: row.id,
      groupId: row.group_id,
      sender: row.sender,
      contents: row.contents,
      timestamp: row.timestamp,
      deliveryStatus: row.delivery_status as DeliveryStatus | undefined,
    };
  }
}

export default SQMessagesRepository;
