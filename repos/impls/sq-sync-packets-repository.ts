import { BitchatPacket } from "@/types/global";
import * as SQLite from "expo-sqlite";
import Repository from "../specs/repository";
import SyncPacketsRepository, {
  SyncPacket,
  SyncPacketCategory,
} from "../specs/sync-packets-repository";

class SQSyncPacketsRepository implements SyncPacketsRepository, Repository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async upsert(
    packetIdHex: string,
    category: SyncPacketCategory,
    packet: BitchatPacket,
    capacity: number,
  ): Promise<void> {
    if (capacity <= 0) return;

    // Check if packet already exists
    const existing = await this.has(packetIdHex, category);
    if (existing) {
      // Update existing packet
      const updateStmt = await this.db.prepareAsync(
        `UPDATE sync_packets 
         SET version = $version, type = $type, timestamp = $timestamp, 
             payload = $payload, allowed_hops = $allowedHops
         WHERE packet_id_hex = $packetIdHex AND category = $category`,
      );
      try {
        await updateStmt.executeAsync({
          $packetIdHex: packetIdHex,
          $category: category,
          $version: packet.version,
          $type: packet.type,
          $timestamp: packet.timestamp,
          $payload: packet.payload,
          $allowedHops: packet.allowedHops,
        });
      } finally {
        await updateStmt.finalizeAsync();
      }
      return;
    }

    // Insert new packet
    const insertStmt = await this.db.prepareAsync(
      `INSERT INTO sync_packets (packet_id_hex, category, version, type, timestamp, payload, allowed_hops) 
       VALUES ($packetIdHex, $category, $version, $type, $timestamp, $payload, $allowedHops)`,
    );
    try {
      await insertStmt.executeAsync({
        $packetIdHex: packetIdHex,
        $category: category,
        $version: packet.version,
        $type: packet.type,
        $timestamp: packet.timestamp,
        $payload: packet.payload,
        $allowedHops: packet.allowedHops,
      });
    } finally {
      await insertStmt.finalizeAsync();
    }

    // FIFO eviction: delete oldest packets if over capacity
    const count = await this.countByCategory(category);
    if (count > capacity) {
      const toDelete = count - capacity;
      const deleteStmt = await this.db.prepareAsync(
        `DELETE FROM sync_packets WHERE id IN (
          SELECT id FROM sync_packets 
          WHERE category = $category 
          ORDER BY created_at ASC 
          LIMIT $limit
        )`,
      );
      try {
        await deleteStmt.executeAsync({
          $category: category,
          $limit: toDelete,
        });
      } finally {
        await deleteStmt.finalizeAsync();
      }
    }
  }

  async has(
    packetIdHex: string,
    category: SyncPacketCategory,
  ): Promise<boolean> {
    const stmt = await this.db.prepareAsync(
      `SELECT 1 FROM sync_packets WHERE packet_id_hex = $packetIdHex AND category = $category LIMIT 1`,
    );
    try {
      const result = await stmt.executeAsync<{ "1": number }>({
        $packetIdHex: packetIdHex,
        $category: category,
      });
      const row = await result.getFirstAsync();
      return row !== null;
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async get(
    packetIdHex: string,
    category: SyncPacketCategory,
  ): Promise<SyncPacket | null> {
    const stmt = await this.db.prepareAsync(
      `SELECT * FROM sync_packets WHERE packet_id_hex = $packetIdHex AND category = $category`,
    );
    try {
      const result = await stmt.executeAsync<{
        id: number;
        packet_id_hex: string;
        category: string;
        version: number;
        type: number;
        timestamp: number;
        payload: Uint8Array;
        allowed_hops: number;
        created_at: number;
      }>({
        $packetIdHex: packetIdHex,
        $category: category,
      });
      const row = await result.getFirstAsync();
      if (!row) return null;
      return this.mapRowToSyncPacket(row);
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async getAllFresh(
    category: SyncPacketCategory,
    minTimestamp: number,
  ): Promise<SyncPacket[]> {
    const stmt = await this.db.prepareAsync(
      `SELECT * FROM sync_packets 
       WHERE category = $category AND timestamp >= $minTimestamp 
       ORDER BY created_at ASC`,
    );
    try {
      const result = await stmt.executeAsync<{
        id: number;
        packet_id_hex: string;
        category: string;
        version: number;
        type: number;
        timestamp: number;
        payload: Uint8Array;
        allowed_hops: number;
        created_at: number;
      }>({
        $category: category,
        $minTimestamp: minTimestamp,
      });
      const rows = await result.getAllAsync();
      return rows.map((row) => this.mapRowToSyncPacket(row));
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async getAllIds(category: SyncPacketCategory): Promise<string[]> {
    const stmt = await this.db.prepareAsync(
      `SELECT packet_id_hex FROM sync_packets WHERE category = $category ORDER BY created_at ASC`,
    );
    try {
      const result = await stmt.executeAsync<{ packet_id_hex: string }>({
        $category: category,
      });
      const rows = await result.getAllAsync();
      return rows.map((row) => row.packet_id_hex);
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async deleteExpired(minTimestamp: number): Promise<number> {
    const stmt = await this.db.prepareAsync(
      `DELETE FROM sync_packets WHERE timestamp < $minTimestamp`,
    );
    try {
      const result = await stmt.executeAsync({
        $minTimestamp: minTimestamp,
      });
      return result.changes;
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async deleteByCategory(category: SyncPacketCategory): Promise<void> {
    const stmt = await this.db.prepareAsync(
      `DELETE FROM sync_packets WHERE category = $category`,
    );
    try {
      await stmt.executeAsync({ $category: category });
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async deleteAll(): Promise<void> {
    const stmt = await this.db.prepareAsync(`DELETE FROM sync_packets`);
    try {
      await stmt.executeAsync();
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async countByCategory(category: SyncPacketCategory): Promise<number> {
    const stmt = await this.db.prepareAsync(
      `SELECT COUNT(*) as count FROM sync_packets WHERE category = $category`,
    );
    try {
      const result = await stmt.executeAsync<{ count: number }>({
        $category: category,
      });
      const row = await result.getFirstAsync();
      return row?.count ?? 0;
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async getStats(): Promise<{
    messageCount: number;
    fragmentCount: number;
    fileTransferCount: number;
    announcementCount: number;
  }> {
    const stmt = await this.db.prepareAsync(
      `SELECT category, COUNT(*) as count FROM sync_packets GROUP BY category`,
    );
    try {
      const result = await stmt.executeAsync<{
        category: string;
        count: number;
      }>();
      const rows = await result.getAllAsync();

      const stats = {
        messageCount: 0,
        fragmentCount: 0,
        fileTransferCount: 0,
        announcementCount: 0,
      };

      for (const row of rows) {
        switch (row.category) {
          case SyncPacketCategory.MESSAGE:
            stats.messageCount = row.count;
            break;
          case SyncPacketCategory.FRAGMENT:
            stats.fragmentCount = row.count;
            break;
          case SyncPacketCategory.FILE_TRANSFER:
            stats.fileTransferCount = row.count;
            break;
          case SyncPacketCategory.ANNOUNCEMENT:
            stats.announcementCount = row.count;
            break;
        }
      }

      return stats;
    } finally {
      await stmt.finalizeAsync();
    }
  }

  private mapRowToSyncPacket(row: {
    id: number;
    packet_id_hex: string;
    category: string;
    version: number;
    type: number;
    timestamp: number;
    payload: Uint8Array;
    allowed_hops: number;
    created_at: number;
  }): SyncPacket {
    return {
      id: row.id,
      packetIdHex: row.packet_id_hex,
      category: row.category as SyncPacketCategory,
      packet: {
        version: row.version,
        type: row.type,
        timestamp: row.timestamp,
        payload: row.payload,
        allowedHops: row.allowed_hops,
      },
      createdAt: row.created_at,
    };
  }
}

export default SQSyncPacketsRepository;
