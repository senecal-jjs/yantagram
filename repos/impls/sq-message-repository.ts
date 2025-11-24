import { DeliveryStatus, Message } from "@/types/global";
import { UUID } from "@/types/utility";
import * as SQLite from "expo-sqlite";
import MessageRepository from "../specs/message-repository";

class SQMessageRepository implements MessageRepository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(message: Message): Promise<Message> {
    const statement = await this.db.prepareAsync(
      "INSERT INTO messages (id, sender, contents, timestamp, is_relay, original_sender, is_private, recipient_nickname, sender_peer_id, delivery_status) VALUES ($id, $sender, $contents, $timestamp, $isRelay, $originalSender, $isPrivate, $recipientNickname, $senderPeerId, $deliveryStatus)",
    );

    try {
      await statement.executeAsync({
        $id: message.id,
        $sender: message.sender,
        $contents: message.contents,
        $timestamp: message.timestamp,
        $isRelay: message.isRelay ? 1 : 0,
        $originalSender: message.originalSender,
        $isPrivate: message.isPrivate ? 1 : 0,
        $recipientNickname: message.recipientNickname,
        $senderPeerId: message.senderPeerId,
        $deliveryStatus: message.deliveryStatus,
      });

      return message;
    } finally {
      await statement.finalizeAsync();
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
        isRelay: number;
        originalSender: string | null;
        isPrivate: number;
        recipientNickname: string | null;
        senderPeerId: string | null;
        deliveryStatus: DeliveryStatus | null;
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
        isRelay: number;
        originalSender: string | null;
        isPrivate: number;
        recipientNickname: string | null;
        senderPeerId: string | null;
        deliveryStatus: DeliveryStatus | null;
      }>({ $limit: limit });

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToMessage(row));
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

  /**
   * Convert database row to Message object
   * Handles type conversions for boolean fields stored as integers
   */
  private mapRowToMessage(row: {
    id: string;
    sender: string;
    contents: string;
    timestamp: number;
    isRelay: number;
    originalSender: string | null;
    isPrivate: number;
    recipientNickname: string | null;
    senderPeerId: string | null;
    deliveryStatus: DeliveryStatus | null;
  }): Message {
    return {
      id: row.id,
      sender: row.sender,
      contents: row.contents,
      timestamp: row.timestamp,
      isRelay: Boolean(row.isRelay),
      originalSender: row.originalSender,
      isPrivate: Boolean(row.isPrivate),
      recipientNickname: row.recipientNickname,
      senderPeerId: row.senderPeerId,
      deliveryStatus: row.deliveryStatus,
    };
  }
}

export default SQMessageRepository;
