import { BitchatPacket } from "@/types/global";
import * as SQLite from "expo-sqlite";
import RelayPacketsRepository from "../specs/relay-packets-repository";
import Repository from "../specs/repository";

class SQRelayPacketsRepository implements RelayPacketsRepository, Repository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(packet: BitchatPacket): Promise<BitchatPacket> {
    const statement = await this.db.prepareAsync(
      `INSERT INTO relay_packets (version, type, timestamp, payload, allowed_hops) 
       VALUES ($version, $type, $timestamp, $payload, $allowedHops)`,
    );

    try {
      await statement.executeAsync({
        $version: packet.version,
        $type: packet.type,
        $timestamp: packet.timestamp,
        $payload: packet.payload,
        $allowedHops: packet.allowedHops,
      });

      return packet;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAll(): Promise<BitchatPacket[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM relay_packets ORDER BY created_at ASC",
    );

    try {
      const result = await statement.executeAsync<{
        version: number;
        type: number;
        timestamp: number;
        payload: Uint8Array;
        allowed_hops: number;
      }>();

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToPacket(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async delete(id: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM relay_packets WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: id });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getEarliest(): Promise<BitchatPacket | null> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM relay_packets ORDER BY created_at ASC LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        version: number;
        type: number;
        timestamp: number;
        payload: Uint8Array;
        allowed_hops: number;
      }>();

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      return this.mapRowToPacket(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  private mapRowToPacket(row: {
    version: number;
    type: number;
    timestamp: number;
    payload: Uint8Array;
    allowed_hops: number;
  }): BitchatPacket {
    return {
      version: row.version,
      type: row.type,
      timestamp: row.timestamp,
      payload: row.payload,
      allowedHops: row.allowed_hops,
    };
  }
}

export default SQRelayPacketsRepository;
