import { Message } from "@/types/global";
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
  ): Promise<Message[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM messages WHERE group_id = $groupId ORDER BY timestamp DESC LIMIT $limit OFFSET $offset",
    );

    try {
      const result = await statement.executeAsync<{
        id: string;
        sender: string;
        contents: string;
        timestamp: number;
        group_id: string;
      }>({ $groupId: groupId, $limit: limit, $offset: offset });

      const rows = await result.getAllAsync();

      // Reverse to get chronological order (oldest first)
      return rows.reverse().map((row) => this.mapRowToMessage(row));
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

  async markAsRead(id: UUID): Promise<void> {
    const statement = await this.db.prepareAsync(
      "UPDATE messages SET was_read = 1 WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: id });
    } finally {
      await statement.finalizeAsync();
      dbListener.notifyMessageChange();
    }
  }

  async markGroupAsRead(groupId: UUID): Promise<void> {
    const statement = await this.db.prepareAsync(
      "UPDATE messages SET was_read = 1 WHERE group_id = $groupId AND was_read = 0",
    );

    try {
      await statement.executeAsync({ $groupId: groupId });
    } finally {
      await statement.finalizeAsync();
      dbListener.notifyMessageChange();
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

  /**
   * Convert database row to Message object
   */
  private mapRowToMessage(row: {
    id: string;
    sender: string;
    contents: string;
    timestamp: number;
    group_id: string;
  }): Message {
    return {
      id: row.id,
      groupId: row.group_id,
      sender: row.sender,
      contents: row.contents,
      timestamp: row.timestamp,
    };
  }
}

export default SQMessagesRepository;
