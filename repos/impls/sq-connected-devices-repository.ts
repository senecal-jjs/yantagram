import * as SQLite from "expo-sqlite";
import ConnectedDevicesRepository, {
  ConnectedDevice,
} from "../specs/connected-devices-repository";
import Repository from "../specs/repository";

class SQConnectedDevicesRepository
  implements ConnectedDevicesRepository, Repository
{
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async upsert(
    deviceUUID: string,
    rssi: number | null,
    isConnected: boolean,
  ): Promise<ConnectedDevice> {
    const statement = await this.db.prepareAsync(
      `INSERT INTO connected_devices (device_uuid, last_seen_rssi, is_connected, last_seen_at, updated_at) 
       VALUES ($deviceUUID, $rssi, $isConnected, $lastSeenAt, $updatedAt)
       ON CONFLICT(device_uuid) DO UPDATE SET
         last_seen_rssi = $rssi,
         is_connected = $isConnected,
         last_seen_at = $lastSeenAt,
         updated_at = $updatedAt`,
    );

    const now = Date.now();

    try {
      await statement.executeAsync({
        $deviceUUID: deviceUUID,
        $rssi: rssi,
        $isConnected: isConnected ? 1 : 0,
        $lastSeenAt: now,
        $updatedAt: now,
      });

      const device = await this.get(deviceUUID);
      if (!device) {
        throw new Error("Failed to retrieve upserted device");
      }

      return device;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async get(deviceUUID: string): Promise<ConnectedDevice | null> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM connected_devices WHERE device_uuid = $deviceUUID LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        device_uuid: string;
        last_seen_rssi: number | null;
        is_connected: number;
        last_seen_at: number;
        created_at: number;
        updated_at: number;
      }>({ $deviceUUID: deviceUUID });

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      return this.mapRowToDevice(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAll(): Promise<ConnectedDevice[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM connected_devices ORDER BY last_seen_at DESC",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        device_uuid: string;
        last_seen_rssi: number | null;
        is_connected: number;
        last_seen_at: number;
        created_at: number;
        updated_at: number;
      }>();

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToDevice(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAllConnected(): Promise<ConnectedDevice[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM connected_devices WHERE is_connected = 1 ORDER BY last_seen_at DESC",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        device_uuid: string;
        last_seen_rssi: number | null;
        is_connected: number;
        last_seen_at: number;
        created_at: number;
        updated_at: number;
      }>();

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToDevice(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async updateRSSI(deviceUUID: string, rssi: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      `UPDATE connected_devices 
       SET last_seen_rssi = $rssi, last_seen_at = $lastSeenAt, updated_at = $updatedAt
       WHERE device_uuid = $deviceUUID`,
    );

    const now = Date.now();

    try {
      await statement.executeAsync({
        $deviceUUID: deviceUUID,
        $rssi: rssi,
        $lastSeenAt: now,
        $updatedAt: now,
      });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async updateConnectionStatus(
    deviceUUID: string,
    isConnected: boolean,
  ): Promise<void> {
    const statement = await this.db.prepareAsync(
      `UPDATE connected_devices 
       SET is_connected = $isConnected, updated_at = $updatedAt
       WHERE device_uuid = $deviceUUID`,
    );

    try {
      await statement.executeAsync({
        $deviceUUID: deviceUUID,
        $isConnected: isConnected ? 1 : 0,
        $updatedAt: Date.now(),
      });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async touch(deviceUUID: string): Promise<void> {
    const statement = await this.db.prepareAsync(
      `UPDATE connected_devices 
       SET last_seen_at = $lastSeenAt, updated_at = $updatedAt
       WHERE device_uuid = $deviceUUID`,
    );

    const now = Date.now();

    try {
      await statement.executeAsync({
        $deviceUUID: deviceUUID,
        $lastSeenAt: now,
        $updatedAt: now,
      });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async delete(deviceUUID: string): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM connected_devices WHERE device_uuid = $deviceUUID",
    );

    try {
      await statement.executeAsync({ $deviceUUID: deviceUUID });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async deleteAll(): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM connected_devices",
    );

    try {
      await statement.executeAsync();
    } finally {
      await statement.finalizeAsync();
    }
  }

  private mapRowToDevice(row: {
    id: number;
    device_uuid: string;
    last_seen_rssi: number | null;
    is_connected: number;
    last_seen_at: number;
    created_at: number;
    updated_at: number;
  }): ConnectedDevice {
    return {
      id: row.id,
      deviceUUID: row.device_uuid,
      lastSeenRSSI: row.last_seen_rssi,
      isConnected: row.is_connected === 1,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default SQConnectedDevicesRepository;
