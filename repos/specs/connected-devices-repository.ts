export interface ConnectedDevice {
  id: number;
  deviceUUID: string;
  lastSeenRSSI: number | null;
  isConnected: boolean;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
}

export default interface ConnectedDevicesRepository {
  upsert(
    deviceUUID: string,
    rssi: number | null,
    isConnected: boolean,
  ): Promise<ConnectedDevice>;
  get(deviceUUID: string): Promise<ConnectedDevice | null>;
  getAll(): Promise<ConnectedDevice[]>;
  getAllConnected(): Promise<ConnectedDevice[]>;
  updateRSSI(deviceUUID: string, rssi: number): Promise<void>;
  updateConnectionStatus(
    deviceUUID: string,
    isConnected: boolean,
  ): Promise<void>;
  delete(deviceUUID: string): Promise<void>;
  deleteAll(): Promise<void>;
  /** Delete devices not seen since the given timestamp */
  deleteStale(olderThanMs: number): Promise<number>;
}
