import { BitchatPacket } from "@/types/global";
import * as SQLite from "expo-sqlite";
import RelayPacketsRepository, {
  RelayPacket,
} from "../specs/relay-packets-repository";
import Repository from "../specs/repository";

class SQRelayPacketsRepository implements RelayPacketsRepository, Repository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(
    packet: BitchatPacket,
    deviceUUID: string,
  ): Promise<BitchatPacket> {
    const statement = await this.db.prepareAsync(
      `INSERT INTO relay_packets (version, type, timestamp, payload, allowed_hops, device_id) 
       VALUES ($version, $type, $timestamp, $payload, $allowedHops, $deviceId)`,
    );

    try {
      await statement.executeAsync({
        $version: packet.version,
        $type: packet.type,
        $timestamp: packet.timestamp,
        $payload: packet.payload,
        $allowedHops: packet.allowedHops,
        $deviceId: deviceUUID,
      });

      return packet;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAll(): Promise<RelayPacket[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM relay_packets ORDER BY created_at ASC",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        version: number;
        type: number;
        timestamp: number;
        payload: Uint8Array;
        allowed_hops: number;
        device_id: string;
      }>();

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToRelayPacket(row));
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

  async deleteAll(): Promise<void> {
    const statement = await this.db.prepareAsync("DELETE FROM relay_packets");

    try {
      await statement.executeAsync();
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getEarliest(): Promise<RelayPacket | null> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM relay_packets ORDER BY created_at ASC LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        version: number;
        type: number;
        timestamp: number;
        payload: Uint8Array;
        allowed_hops: number;
        device_id: string;
      }>();

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      return this.mapRowToRelayPacket(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  async updateAllowedHops(id: number, hops: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      "UPDATE relay_packets SET allowed_hops = $hops WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $hops: hops, $id: id });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async count(): Promise<number> {
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM relay_packets",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>();
      const row = await result.getFirstAsync();
      return row?.count ?? 0;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async deleteOldest(n: number): Promise<number> {
    if (n <= 0) return 0;

    // Prioritize retaining Amigo/CGKA packets (types 0 = AMIGO_WELCOME, 1 = AMIGO_PATH_UPDATE)
    // First delete non-Amigo packets, then Amigo packets only if needed
    const statement = await this.db.prepareAsync(
      `DELETE FROM relay_packets WHERE id IN (
        SELECT id FROM relay_packets 
        ORDER BY 
          CASE WHEN type IN (0, 1) THEN 1 ELSE 0 END ASC,
          created_at ASC 
        LIMIT $n
      )`,
    );

    try {
      const result = await statement.executeAsync({ $n: n });
      return result.changes;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async markRelayed(id: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      "UPDATE relay_packets SET relayed = 1 WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: id });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getEarliestUnrelayed(): Promise<RelayPacket | null> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM relay_packets WHERE relayed = 0 ORDER BY created_at ASC LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        version: number;
        type: number;
        timestamp: number;
        payload: Uint8Array;
        allowed_hops: number;
        device_id: string;
        relayed: number;
      }>();

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      return this.mapRowToRelayPacket(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  private mapRowToRelayPacket(row: {
    id: number;
    version: number;
    type: number;
    timestamp: number;
    payload: Uint8Array;
    allowed_hops: number;
    device_id: string;
    relayed?: number;
  }): RelayPacket {
    return {
      id: row.id,
      packet: {
        version: row.version,
        type: row.type,
        timestamp: row.timestamp,
        payload: row.payload,
        allowedHops: row.allowed_hops,
      },
      deviceUUID: row.device_id,
      relayed: row.relayed === 1,
    };
  }
}

export default SQRelayPacketsRepository;
