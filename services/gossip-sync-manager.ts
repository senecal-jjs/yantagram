import BloomFilter, { ExportedBloomFilter } from "@/bloom/bloom-filter";
import { BitchatPacket, PacketType } from "@/types/global";
import * as PacketProtocolService from "./packet-protocol-service";

/**
 * Sync type flags for REQUEST_SYNC packets
 */
export enum SyncTypeFlags {
  ANNOUNCE = 1 << 0,
  MESSAGE = 1 << 1,
  FRAGMENT = 1 << 2,
  FILE_TRANSFER = 1 << 3,
}

/**
 * Configuration for the GossipSyncManager
 */
export interface GossipSyncConfig {
  /** Maximum packets to store for messages */
  seenCapacity: number;
  /** Maximum capacity for fragments */
  fragmentCapacity: number;
  /** Maximum capacity for file transfers */
  fileTransferCapacity: number;
  /** Bloom filter error rate (false positive rate) */
  bloomFilterErrorRate: number;
  /** Maximum age for messages in milliseconds */
  maxMessageAgeMs: number;
  /** Maintenance interval in milliseconds */
  maintenanceIntervalMs: number;
  /** Sync interval for messages in milliseconds */
  messageSyncIntervalMs: number;
  /** Sync interval for fragments in milliseconds */
  fragmentSyncIntervalMs: number;
  /** Sync interval for file transfers in milliseconds */
  fileTransferSyncIntervalMs: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_GOSSIP_SYNC_CONFIG: GossipSyncConfig = {
  seenCapacity: 1000,
  fragmentCapacity: 600,
  fileTransferCapacity: 200,
  bloomFilterErrorRate: 0.01,
  maxMessageAgeMs: 15 * 60 * 1000, // 15 minutes
  maintenanceIntervalMs: 30 * 1000, // 30 seconds
  messageSyncIntervalMs: 15 * 1000, // 15 seconds
  fragmentSyncIntervalMs: 30 * 1000, // 30 seconds
  fileTransferSyncIntervalMs: 60 * 1000, // 60 seconds
};

/**
 * Request sync packet payload structure
 */
export interface RequestSyncPayload {
  types: SyncTypeFlags;
  bloomFilter: ExportedBloomFilter;
}

/**
 * Delegate interface for sending packets
 */
export interface GossipSyncDelegate {
  /** Broadcast a packet to all connected devices */
  broadcastPacket(packet: BitchatPacket): void;
  /** Send a packet to a specific device by UUID */
  sendPacketToDevice(deviceUUID: string, packet: BitchatPacket): void;
}

/**
 * Internal packet store with FIFO eviction
 */
class PacketStore {
  private packets: Map<string, BitchatPacket> = new Map();
  private order: string[] = [];

  /**
   * Insert a packet with FIFO eviction when capacity is exceeded
   */
  insert(idHex: string, packet: BitchatPacket, capacity: number): void {
    if (capacity <= 0) return;

    if (this.packets.has(idHex)) {
      // Update existing packet
      this.packets.set(idHex, packet);
      return;
    }

    this.packets.set(idHex, packet);
    this.order.push(idHex);

    // Evict oldest entries if over capacity
    while (this.order.length > capacity) {
      const victim = this.order.shift();
      if (victim) {
        this.packets.delete(victim);
      }
    }
  }

  /**
   * Get a packet by ID
   */
  get(idHex: string): BitchatPacket | undefined {
    return this.packets.get(idHex);
  }

  /**
   * Check if a packet exists
   */
  has(idHex: string): boolean {
    return this.packets.has(idHex);
  }

  /**
   * Get all packets that pass the freshness check
   */
  allPackets(isFresh: (packet: BitchatPacket) => boolean): BitchatPacket[] {
    return this.order
      .map((key) => this.packets.get(key))
      .filter(
        (packet): packet is BitchatPacket =>
          packet !== undefined && isFresh(packet),
      );
  }

  /**
   * Get all packet IDs
   */
  allIds(): string[] {
    return [...this.order];
  }

  /**
   * Remove packets matching a predicate
   */
  remove(shouldRemove: (packet: BitchatPacket) => boolean): void {
    const nextOrder: string[] = [];
    for (const key of this.order) {
      const packet = this.packets.get(key);
      if (packet && shouldRemove(packet)) {
        this.packets.delete(key);
      } else {
        nextOrder.push(key);
      }
    }
    this.order = nextOrder;
  }

  /**
   * Remove expired packets
   */
  removeExpired(isFresh: (packet: BitchatPacket) => boolean): void {
    this.remove((packet) => !isFresh(packet));
  }

  /**
   * Get current count
   */
  get size(): number {
    return this.packets.size;
  }

  /**
   * Clear all packets
   */
  clear(): void {
    this.packets.clear();
    this.order = [];
  }
}

/**
 * Sync schedule entry
 */
interface SyncSchedule {
  types: SyncTypeFlags;
  intervalMs: number;
  lastSent: number;
}

/**
 * Gossip-based sync manager using Bloom filters for set reconciliation.
 *
 * This manager handles synchronization of packets between devices in a mesh network.
 * It uses Bloom filters to efficiently communicate which packets a device has,
 * allowing other devices to send only the packets that are missing.
 *
 * Key features:
 * - Periodic broadcast of SYNC_REQUEST packets with Bloom filter of known packets
 * - Response to sync requests by sending packets not in the requester's filter
 * - Automatic cleanup of expired packets
 * - Support for MESSAGE, FRAGMENT, ANNOUNCE, and FILE_TRANSFER packet types
 *
 * Note: This implementation has no concept of peer IDs. Devices are identified
 * only by their BLE device UUID for direct packet transmission.
 */
export class GossipSyncManager {
  private readonly config: GossipSyncConfig;
  private delegate: GossipSyncDelegate | null = null;

  // Packet stores by type
  private messages = new PacketStore();
  private fragments = new PacketStore();
  private fileTransfers = new PacketStore();
  private announcements = new PacketStore();

  // Timers
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private syncSchedules: SyncSchedule[] = [];

  constructor(config: Partial<GossipSyncConfig> = {}) {
    this.config = { ...DEFAULT_GOSSIP_SYNC_CONFIG, ...config };

    // Initialize sync schedules
    if (this.config.seenCapacity > 0 && this.config.messageSyncIntervalMs > 0) {
      this.syncSchedules.push({
        types: SyncTypeFlags.MESSAGE,
        intervalMs: this.config.messageSyncIntervalMs,
        lastSent: 0,
      });
    }
    if (
      this.config.fragmentCapacity > 0 &&
      this.config.fragmentSyncIntervalMs > 0
    ) {
      this.syncSchedules.push({
        types: SyncTypeFlags.FRAGMENT,
        intervalMs: this.config.fragmentSyncIntervalMs,
        lastSent: 0,
      });
    }
    if (
      this.config.fileTransferCapacity > 0 &&
      this.config.fileTransferSyncIntervalMs > 0
    ) {
      this.syncSchedules.push({
        types: SyncTypeFlags.FILE_TRANSFER,
        intervalMs: this.config.fileTransferSyncIntervalMs,
        lastSent: 0,
      });
    }
  }

  /**
   * Set the delegate for sending packets
   */
  setDelegate(delegate: GossipSyncDelegate): void {
    this.delegate = delegate;
  }

  /**
   * Start the sync manager
   */
  start(): void {
    this.stop();

    console.log(
      "[GossipSync] Starting sync manager with config:",
      JSON.stringify({
        seenCapacity: this.config.seenCapacity,
        fragmentCapacity: this.config.fragmentCapacity,
        fileTransferCapacity: this.config.fileTransferCapacity,
        maintenanceIntervalMs: this.config.maintenanceIntervalMs,
      }),
    );

    this.maintenanceTimer = setInterval(
      () => this.performPeriodicMaintenance(),
      this.config.maintenanceIntervalMs,
    );
  }

  /**
   * Stop the sync manager
   */
  stop(): void {
    if (this.maintenanceTimer) {
      console.log("[GossipSync] Stopping sync manager");
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
  }

  /**
   * Schedule an initial sync to a newly connected device
   * @param deviceUUID - The BLE device UUID to sync with
   * @param delayMs - Delay before sending the sync request
   */
  scheduleInitialSyncToDevice(
    deviceUUID: string,
    delayMs: number = 5000,
  ): void {
    console.log(
      `[GossipSync] Scheduling initial sync to device ${deviceUUID} in ${delayMs}ms`,
    );
    setTimeout(() => {
      this.sendRequestSyncToDevice(deviceUUID, SyncTypeFlags.MESSAGE);

      if (
        this.config.fragmentCapacity > 0 &&
        this.config.fragmentSyncIntervalMs > 0
      ) {
        setTimeout(() => {
          this.sendRequestSyncToDevice(deviceUUID, SyncTypeFlags.FRAGMENT);
        }, 500);
      }

      if (
        this.config.fileTransferCapacity > 0 &&
        this.config.fileTransferSyncIntervalMs > 0
      ) {
        setTimeout(() => {
          this.sendRequestSyncToDevice(deviceUUID, SyncTypeFlags.FILE_TRANSFER);
        }, 1000);
      }
    }, delayMs);
  }

  /**
   * Called when a packet is received. Tracks the packet for sync purposes.
   * @param packet - The received packet
   */
  onPacketReceived(packet: BitchatPacket): void {
    // Skip if packet is too old
    if (!this.isPacketFresh(packet)) {
      console.log(
        `[GossipSync] Ignoring stale packet type=${packet.type} timestamp=${packet.timestamp}`,
      );
      return;
    }

    const idHex = this.computePacketId(packet);
    console.log(
      `[GossipSync] Tracking packet type=${packet.type} id=${idHex.slice(0, 16)}...`,
    );

    switch (packet.type) {
      case PacketType.ANNOUNCE:
        this.announcements.insert(
          idHex,
          packet,
          Math.max(100, this.config.seenCapacity / 10),
        );
        break;

      case PacketType.MESSAGE:
        this.messages.insert(idHex, packet, this.config.seenCapacity);
        break;

      case PacketType.FRAGMENT:
        this.fragments.insert(idHex, packet, this.config.fragmentCapacity);
        break;

      case PacketType.FILE_TRANSFER:
        this.fileTransfers.insert(
          idHex,
          packet,
          this.config.fileTransferCapacity,
        );
        break;

      case PacketType.SYNC_REQUEST:
        // SYNC_REQUEST packets are handled separately via handleSyncRequest
        break;

      default:
        // Other packet types are not tracked for sync
        break;
    }
  }

  /**
   * Handle a SYNC_REQUEST packet from another device
   * @param fromDeviceUUID - The BLE device UUID that sent the request
   * @param packet - The sync request packet
   */
  handleSyncRequest(fromDeviceUUID: string, packet: BitchatPacket): void {
    console.log(
      `[GossipSync] Received SYNC_REQUEST from device ${fromDeviceUUID}`,
    );
    try {
      const payload = this.decodeRequestSyncPayload(packet.payload);
      if (!payload) {
        console.error("[GossipSync] Failed to decode sync request payload");
        return;
      }

      console.log(
        `[GossipSync] Sync request types=${payload.types} (${this.syncTypesToString(payload.types)})`,
      );
      this.respondToSyncRequest(fromDeviceUUID, payload);
    } catch (error) {
      console.error("[GossipSync] Failed to handle sync request:", error);
    }
  }

  /**
   * Respond to a sync request by sending packets the requester doesn't have
   */
  private respondToSyncRequest(
    deviceUUID: string,
    request: RequestSyncPayload,
  ): void {
    const requestedTypes = request.types;
    const theirFilter = BloomFilter.fromJSON(request.bloomFilter);
    let sentCount = 0;

    // Send announcements they don't have
    if (requestedTypes & SyncTypeFlags.ANNOUNCE) {
      for (const packet of this.announcements.allPackets((p) =>
        this.isPacketFresh(p),
      )) {
        const idHex = this.computePacketId(packet);
        if (!theirFilter.has(idHex)) {
          this.sendPacketToDevice(deviceUUID, { ...packet, allowedHops: 0 });
          sentCount++;
        }
      }
    }

    // Send messages they don't have
    if (requestedTypes & SyncTypeFlags.MESSAGE) {
      for (const packet of this.messages.allPackets((p) =>
        this.isPacketFresh(p),
      )) {
        const idHex = this.computePacketId(packet);
        if (!theirFilter.has(idHex)) {
          this.sendPacketToDevice(deviceUUID, { ...packet, allowedHops: 0 });
          sentCount++;
        }
      }
    }

    // Send fragments they don't have
    if (requestedTypes & SyncTypeFlags.FRAGMENT) {
      for (const packet of this.fragments.allPackets((p) =>
        this.isPacketFresh(p),
      )) {
        const idHex = this.computePacketId(packet);
        if (!theirFilter.has(idHex)) {
          this.sendPacketToDevice(deviceUUID, { ...packet, allowedHops: 0 });
          sentCount++;
        }
      }
    }

    // Send file transfers they don't have
    if (requestedTypes & SyncTypeFlags.FILE_TRANSFER) {
      for (const packet of this.fileTransfers.allPackets((p) =>
        this.isPacketFresh(p),
      )) {
        const idHex = this.computePacketId(packet);
        if (!theirFilter.has(idHex)) {
          this.sendPacketToDevice(deviceUUID, { ...packet, allowedHops: 0 });
          sentCount++;
        }
      }
    }

    console.log(
      `[GossipSync] Sent ${sentCount} missing packets to device ${deviceUUID}`,
    );
  }

  /**
   * Check if we already have a packet (for deduplication)
   */
  hasPacket(packet: BitchatPacket): boolean {
    const idHex = this.computePacketId(packet);

    switch (packet.type) {
      case PacketType.ANNOUNCE:
        return this.announcements.has(idHex);
      case PacketType.MESSAGE:
        return this.messages.has(idHex);
      case PacketType.FRAGMENT:
        return this.fragments.has(idHex);
      case PacketType.FILE_TRANSFER:
        return this.fileTransfers.has(idHex);
      default:
        return false;
    }
  }

  /**
   * Get current statistics
   */
  getStats(): {
    messageCount: number;
    fragmentCount: number;
    fileTransferCount: number;
    announcementCount: number;
  } {
    return {
      messageCount: this.messages.size,
      fragmentCount: this.fragments.size,
      fileTransferCount: this.fileTransfers.size,
      announcementCount: this.announcements.size,
    };
  }

  /**
   * Clear all stored packets
   */
  clear(): void {
    this.messages.clear();
    this.fragments.clear();
    this.fileTransfers.clear();
    this.announcements.clear();
  }

  // ============ Private Methods ============

  /**
   * Broadcast a sync request to all connected devices
   */
  private sendRequestSyncBroadcast(types: SyncTypeFlags): void {
    const payload = this.buildBloomFilterPayload(types);
    const packet: BitchatPacket = {
      version: 1,
      type: PacketType.SYNC_REQUEST,
      timestamp: Date.now(),
      payload: this.encodeRequestSyncPayload(payload),
      allowedHops: 0, // Local only, don't relay
    };

    console.log(
      `[GossipSync] Broadcasting SYNC_REQUEST for ${this.syncTypesToString(types)}`,
    );
    this.delegate?.broadcastPacket(packet);
  }

  /**
   * Send a sync request to a specific device
   */
  private sendRequestSyncToDevice(
    deviceUUID: string,
    types: SyncTypeFlags,
  ): void {
    const payload = this.buildBloomFilterPayload(types);
    const packet: BitchatPacket = {
      version: 1,
      type: PacketType.SYNC_REQUEST,
      timestamp: Date.now(),
      payload: this.encodeRequestSyncPayload(payload),
      allowedHops: 0, // Local only
    };

    console.log(
      `[GossipSync] Sending SYNC_REQUEST to ${deviceUUID} for ${this.syncTypesToString(types)}`,
    );
    this.sendPacketToDevice(deviceUUID, packet);
  }

  private sendPacketToDevice(deviceUUID: string, packet: BitchatPacket): void {
    this.delegate?.sendPacketToDevice(deviceUUID, packet);
  }

  /**
   * Build a bloom filter payload containing IDs of packets we have
   */
  private buildBloomFilterPayload(types: SyncTypeFlags): RequestSyncPayload {
    const packets: BitchatPacket[] = [];

    if (types & SyncTypeFlags.ANNOUNCE) {
      packets.push(
        ...this.announcements.allPackets((p) => this.isPacketFresh(p)),
      );
    }

    if (types & SyncTypeFlags.MESSAGE) {
      packets.push(...this.messages.allPackets((p) => this.isPacketFresh(p)));
    }

    if (types & SyncTypeFlags.FRAGMENT) {
      packets.push(...this.fragments.allPackets((p) => this.isPacketFresh(p)));
    }

    if (types & SyncTypeFlags.FILE_TRANSFER) {
      packets.push(
        ...this.fileTransfers.allPackets((p) => this.isPacketFresh(p)),
      );
    }

    // Sort by timestamp descending (newest first)
    packets.sort((a, b) => b.timestamp - a.timestamp);

    // Determine capacity based on type
    let capacity: number;
    if (types === SyncTypeFlags.FRAGMENT) {
      capacity = this.config.fragmentCapacity;
    } else if (types === SyncTypeFlags.FILE_TRANSFER) {
      capacity = this.config.fileTransferCapacity;
    } else {
      capacity = this.config.seenCapacity;
    }

    // Limit to capacity
    const limitedPackets = packets.slice(0, capacity);

    // Build bloom filter from packet IDs
    const bloomFilter =
      limitedPackets.length > 0
        ? BloomFilter.create(
            Math.max(limitedPackets.length, 10),
            this.config.bloomFilterErrorRate,
          )
        : BloomFilter.create(10, this.config.bloomFilterErrorRate);

    for (const packet of limitedPackets) {
      const idHex = this.computePacketId(packet);
      bloomFilter.add(idHex);
    }

    return {
      types,
      bloomFilter: bloomFilter.saveAsJSON(),
    };
  }

  /**
   * Periodic maintenance: cleanup expired packets and send sync requests
   */
  private performPeriodicMaintenance(): void {
    const now = Date.now();
    const stats = this.getStats();

    console.log(
      `[GossipSync] Maintenance: messages=${stats.messageCount} fragments=${stats.fragmentCount} files=${stats.fileTransferCount} announces=${stats.announcementCount}`,
    );

    // Cleanup expired packets
    this.cleanupExpiredPackets();

    // Send scheduled sync requests
    for (const schedule of this.syncSchedules) {
      if (schedule.intervalMs <= 0) continue;
      if (
        schedule.lastSent === 0 ||
        now - schedule.lastSent >= schedule.intervalMs
      ) {
        schedule.lastSent = now;
        this.sendRequestSyncBroadcast(schedule.types);
      }
    }
  }

  /**
   * Remove expired packets from all stores
   */
  private cleanupExpiredPackets(): void {
    this.announcements.removeExpired((p) => this.isPacketFresh(p));
    this.messages.removeExpired((p) => this.isPacketFresh(p));
    this.fragments.removeExpired((p) => this.isPacketFresh(p));
    this.fileTransfers.removeExpired((p) => this.isPacketFresh(p));
  }

  /**
   * Check if a packet is within the age threshold
   */
  private isPacketFresh(packet: BitchatPacket): boolean {
    const now = Date.now();
    if (now < this.config.maxMessageAgeMs) return true;
    const cutoff = now - this.config.maxMessageAgeMs;
    return packet.timestamp >= cutoff;
  }

  /**
   * Compute a unique ID for a packet by encoding it to binary and converting to hex
   */
  private computePacketId(packet: BitchatPacket): string {
    const binary = PacketProtocolService.encode(packet, false);
    if (!binary) {
      // Fallback: use timestamp + type as minimal ID
      return `${packet.timestamp.toString(16)}-${packet.type.toString(16)}`;
    }
    return Array.from(binary)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Encode a sync request payload to binary
   */
  private encodeRequestSyncPayload(payload: RequestSyncPayload): Uint8Array {
    const json = JSON.stringify(payload);
    return new TextEncoder().encode(json);
  }

  /**
   * Decode a sync request payload from binary
   */
  private decodeRequestSyncPayload(
    data: Uint8Array,
  ): RequestSyncPayload | null {
    try {
      const json = new TextDecoder().decode(data);
      return JSON.parse(json) as RequestSyncPayload;
    } catch {
      return null;
    }
  }

  /**
   * Convert sync type flags to a readable string
   */
  private syncTypesToString(types: SyncTypeFlags): string {
    const parts: string[] = [];
    if (types & SyncTypeFlags.ANNOUNCE) parts.push("ANNOUNCE");
    if (types & SyncTypeFlags.MESSAGE) parts.push("MESSAGE");
    if (types & SyncTypeFlags.FRAGMENT) parts.push("FRAGMENT");
    if (types & SyncTypeFlags.FILE_TRANSFER) parts.push("FILE_TRANSFER");
    return parts.join("|") || "NONE";
  }
}

// ============ Singleton Instance ============

let instance: GossipSyncManager | null = null;

/**
 * Get or create the GossipSyncManager singleton
 */
export function getGossipSyncManager(
  config?: Partial<GossipSyncConfig>,
): GossipSyncManager {
  if (!instance) {
    instance = new GossipSyncManager(config);
  }
  return instance;
}

/**
 * Reset the GossipSyncManager singleton
 */
export function resetGossipSyncManager(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
