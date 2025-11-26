import { BitchatPacket } from "@/types/global";
import { Base64String } from "@/utils/Base64String";
import * as SQLite from "expo-sqlite";
import FragmentsRepository from "../specs/fragments-repository";
import Repository from "../specs/repository";

class SQFragmentsRepository implements FragmentsRepository, Repository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(
    fragmentId: Base64String,
    position: number,
    packet: BitchatPacket,
  ): Promise<BitchatPacket> {
    const statement = await this.db.prepareAsync(
      "INSERT INTO fragments (fragment_id, position, version, type, sender_id, recipient_id, timestamp, payload, signature, allowed_hops, route) VALUES ($fragment_id, $position, $version, $type, $sender_id, $recipient_id, $timestamp, $payload, $signature, $allowed_hops, $route)",
    );

    try {
      await statement.executeAsync({
        $fragment_id: fragmentId.getValue(),
        $position: position,
        $version: packet.version,
        $type: packet.type,
        $sender_id: packet.senderId,
        $recipient_id: packet.recipientId,
        $timestamp: packet.timestamp,
        $payload: packet.payload,
        $signature: packet.signature,
        $allowed_hops: packet.allowedHops,
        $route: packet.route,
      });

      return packet;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getByFragmentId(fragmentId: Base64String): Promise<BitchatPacket[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM fragments WHERE fragment_id = $fragment_id ORDER BY position ASC",
    );

    try {
      const result = await statement.executeAsync<{
        version: number;
        type: number;
        sender_id: string;
        recipient_id: string;
        timestamp: number;
        payload: Uint8Array;
        signature: string | null;
        allowed_hops: number;
        route: Uint8Array;
      }>({ $fragment_id: fragmentId.getValue() });

      const rows = await result.getAllAsync();

      return rows.map((row) => ({
        version: row.version,
        type: row.type,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        timestamp: row.timestamp,
        payload: row.payload,
        signature: row.signature,
        allowedHops: row.allowed_hops,
        route: row.route,
      }));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getFragmentCount(fragmentId: Base64String): Promise<number> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM fragments WHERE fragment_id = $fragment_id",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>({
        $fragment_id: fragmentId.getValue(),
      });

      const row = await result.getFirstAsync();

      return row ? row.count : 0;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async deleteByFragmentId(fragmentId: Base64String): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM fragments WHERE fragment_id = $fragment_id",
    );

    try {
      await statement.executeAsync({ $fragment_id: fragmentId.getValue() });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async exists(fragmentId: Base64String, position: number): Promise<boolean> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM fragments WHERE fragment_id = $fragment_id AND position = $position",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>({
        $fragment_id: fragmentId.getValue(),
        $position: position,
      });

      const row = await result.getFirstAsync();

      return row ? row.count > 0 : false;
    } finally {
      await statement.finalizeAsync();
    }
  }
}

export default SQFragmentsRepository;
