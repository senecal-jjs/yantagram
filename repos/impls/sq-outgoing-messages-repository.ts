import { DeliveryStatus, Message } from "@/types/global";
import * as SQLite from "expo-sqlite";
import OutgoingMessagesRepository from "../specs/outgoing-messages-repository";
import Repository from "../specs/repository";

class SQOutgoingMessagesRepository
  implements OutgoingMessagesRepository, Repository
{
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(message: Message): Promise<Message> {
    const statement = await this.db.prepareAsync(
      "INSERT INTO outgoing_messages (id, sender, contents, timestamp, is_relay, original_sender, is_private, recipient_nickname, sender_peer_id, delivery_status) VALUES ($id, $sender, $contents, $timestamp, $isRelay, $originalSender, $isPrivate, $recipientNickname, $senderPeerId, $deliveryStatus)",
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

  async delete(messageId: string): Promise<Message | null> {
    // First, get the message before deleting
    const getStatement = await this.db.prepareAsync(
      "SELECT * FROM outgoing_messages WHERE id = $id LIMIT 1",
    );

    try {
      const result = await getStatement.executeAsync<{
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
      }>({ $id: messageId });

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
      } finally {
        await deleteStatement.finalizeAsync();
      }

      return message;
    } finally {
      await getStatement.finalizeAsync();
    }
  }

  async getAll(): Promise<Message[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM outgoing_messages ORDER BY timestamp ASC",
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
      }>();

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToMessage(row));
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

export default SQOutgoingMessagesRepository;
