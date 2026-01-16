import BloomFilter, { ExportedBloomFilter } from "@/bloom/bloom-filter";
import { BitchatPacket, PacketType } from "@/types/global";

/**
 * Sync type flags for REQUEST_SYNC packets
 */
export enum SyncTypeFlags {
  ANNOUNCE = 1 << 0,
  MESSAGE = 1 << 1,
  FRAGMENT = 1 << 2,
}

/**
 * Configuration for the GossipSyncManager
 */
export interface GossipSyncConfig {
  /** Maximum packets to store per type */
  seenCapacity: number;
  /** Maximum capacity for fragments */
  fragmentCapacity: number;
  /** Bloom filter error rate (false positive rate) */
  bloomFilterErrorRate: number;
  /** Maximum age for messages in milliseconds */
  maxMessageAgeMs: number;
  /** Maintenance interval in milliseconds */
  maintenanceIntervalMs: number;
  /** Stale peer cleanup interval in milliseconds */
  stalePeerCleanupIntervalMs: number;
  /** Stale peer timeout in milliseconds */
  stalePeerTimeoutMs: number;
  /** Sync interval for messages in milliseconds */
  messageSyncIntervalMs: number;
  /** Sync interval for fragments in milliseconds */
  fragmentSyncIntervalMs: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_GOSSIP_SYNC_CONFIG: GossipSyncConfig = {
  seenCapacity: 1000,
  fragmentCapacity: 600,
  bloomFilterErrorRate: 0.01,
  maxMessageAgeMs: 15 * 60 * 1000, // 15 minutes
  maintenanceIntervalMs: 30 * 1000, // 30 seconds
  stalePeerCleanupIntervalMs: 60 * 1000, // 60 seconds
  stalePeerTimeoutMs: 60 * 1000, // 60 seconds
  messageSyncIntervalMs: 15 * 1000, // 15 seconds
  fragmentSyncIntervalMs: 30 * 1000, // 30 seconds
};

/**
 * Delegate interface for sending packets
 */
export interface GossipSyncDelegate {
  /** Send a packet to all connected peers */
  sendPacket(packet: BitchatPacket): void;
  /** Send a packet to a specific peer */
  sendPacketToPeer(peerId: string, packet: BitchatPacket): void;
  /** Sign a packet for broadcast */
  signPacketForBroadcast(packet: BitchatPacket): BitchatPacket;
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
   * Get all packets that pass the freshness check
   */
  allPackets(isFresh: (packet: BitchatPacket) => boolean): BitchatPacket[] {
    return this.order
      .map((key) => this.packets.get(key))
      .filter(
        (packet): packet is BitchatPacket =>
          packet !== undefined && isFresh(packet)
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
 * Request sync packet payload structure
 */
export interface RequestSyncPayload {
  types: SyncTypeFlags;
  bloomFilter: ExportedBloomFilter;
}

/**
 * Gossip-based sync manager using Bloom filters for set reconciliation.
 *
 * This manager handles synchronization of packets between peers in a mesh network.
 * It uses Bloom filters to efficiently communicate which packets a peer has,
 * allowing other peers to send only the packets that are missing.
 *
 * Key features:
 * - Periodic broadcast of REQUEST_SYNC packets with Bloom filter of known packets
 * - Response to sync requests by sending packets not in the requester's filter
 * - Automatic cleanup of expired packets and stale peer announcements
 * - Support for MESSAGE, FRAGMENT, and ANNOUNCE packet types
 */
export class GossipSyncManager {
  private readonly myPeerId: string;
  private readonly config: GossipSyncConfig;
  private delegate: GossipSyncDelegate | null = null;

  // Packet stores by type
  private messages = new PacketStore();
  private fragments = new PacketStore();
  private latestAnnouncementByPeer: Map<
    string,
    { id: string; packet: BitchatPacket }
  > = new Map();

  // Timers
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private lastStalePeerCleanup: number = 0;
  private syncSchedules: SyncSchedule[] = [];

  constructor(myPeerId: string, config: Partial<GossipSyncConfig> = {}) {
    this.myPeerId = myPeerId;
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

    this.maintenanceTimer = setInterval(
      () => this.performPeriodicMaintenance(),
      this.config.maintenanceIntervalMs
    );
  }

  /**
   * Stop the sync manager
   */
  stop(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
  }

  /**
   * Schedule an initial sync to a newly connected peer
   */
  scheduleInitialSyncToPeer(peerId: string, delayMs: number = 5000): void {
    setTimeout(() => {
      this.sendRequestSyncToPeer(peerId, SyncTypeFlags.MESSAGE);

      if (
        this.config.fragmentCapacity > 0 &&
        this.config.fragmentSyncIntervalMs > 0
      ) {
        setTimeout(() => {
          this.sendRequestSyncToPeer(peerId, SyncTypeFlags.FRAGMENT);
        }, 500);
      }
    }, delayMs);
  }

  /**
   * Called when a public packet is received
   */
  onPublicPacketSeen(packet: BitchatPacket): void {
    const isBroadcast = this.isBroadcastPacket(packet);

    switch (packet.type) {
      case PacketType.ANNOUNCE:
        if (!this.isPacketFresh(packet)) return;
        if (!this.isAnnouncementFresh(packet)) {
          const senderId = this.extractSenderId(packet);
          if (senderId) {
            this.removeStateForPeer(senderId);
          }
          return;
        }
        this.handleAnnouncement(packet);
        break;

      case PacketType.MESSAGE:
        if (!isBroadcast) return;
        if (!this.isPacketFresh(packet)) return;
        this.handleMessage(packet);
        break;

      case PacketType.FRAGMENT:
        if (!isBroadcast) return;
        if (!this.isPacketFresh(packet)) return;
        this.handleFragment(packet);
        break;

      case PacketType.SYNC:
        // Handle incoming sync request
        this.handleSyncRequest(packet);
        break;
    }
  }

  /**
   * Handle a REQUEST_SYNC packet from a peer
   */
  handleRequestSync(fromPeerId: string, payload: RequestSyncPayload): void {
    const requestedTypes = payload.types;
    const theirFilter = BloomFilter.fromJSON(payload.bloomFilter);

    // Send packets they don't have
    if (requestedTypes & SyncTypeFlags.ANNOUNCE) {
      for (const [, { packet }] of this.latestAnnouncementByPeer) {
        if (!this.isPacketFresh(packet)) continue;
        const idHex = this.computePacketId(packet);
        if (!theirFilter.has(idHex)) {
          this.sendPacketToPeer(fromPeerId, { ...packet, allowedHops: 0 });
        }
      }
    }

    if (requestedTypes & SyncTypeFlags.MESSAGE) {
      for (const packet of this.messages.allPackets((p) =>
        this.isPacketFresh(p)
      )) {
        const idHex = this.computePacketId(packet);
        if (!theirFilter.has(idHex)) {
          this.sendPacketToPeer(fromPeerId, { ...packet, allowedHops: 0 });
        }
      }
    }

    if (requestedTypes & SyncTypeFlags.FRAGMENT) {
      for (const packet of this.fragments.allPackets((p) =>
        this.isPacketFresh(p)
      )) {
        const idHex = this.computePacketId(packet);
        if (!theirFilter.has(idHex)) {
          this.sendPacketToPeer(fromPeerId, { ...packet, allowedHops: 0 });
        }
      }
    }
  }

  /**
   * Remove announcement for a specific peer (e.g., when they leave)
   */
  removeAnnouncementForPeer(peerId: string): void {
    this.removeStateForPeer(peerId);
  }

  /**
   * Get current statistics
   */
  getStats(): {
    messageCount: number;
    fragmentCount: number;
    announcementCount: number;
  } {
    return {
      messageCount: this.messages.size,
      fragmentCount: this.fragments.size,
      announcementCount: this.latestAnnouncementByPeer.size,
    };
  }

  // ============ Private Methods ============

  private handleAnnouncement(packet: BitchatPacket): void {
    const idHex = this.computePacketId(packet);
    const senderId = this.extractSenderId(packet);
    if (senderId) {
      this.latestAnnouncementByPeer.set(senderId, { id: idHex, packet });
    }
  }

  private handleMessage(packet: BitchatPacket): void {
    const idHex = this.computePacketId(packet);
    this.messages.insert(idHex, packet, this.config.seenCapacity);
  }

  private handleFragment(packet: BitchatPacket): void {
    const idHex = this.computePacketId(packet);
    this.fragments.insert(idHex, packet, this.config.fragmentCapacity);
  }

  private handleSyncRequest(packet: BitchatPacket): void {
    try {
      const payload = this.decodeRequestSyncPayload(packet.payload);
      const senderId = this.extractSenderId(packet);
      if (senderId && payload) {
        this.handleRequestSync(senderId, payload);
      }
    } catch (error) {
      console.error("[GossipSync] Failed to handle sync request:", error);
    }
  }

  private sendRequestSync(types: SyncTypeFlags): void {
    const payload = this.buildBloomFilterPayload(types);
    const packet: BitchatPacket = {
      version: 1,
      type: PacketType.SYNC,
      timestamp: Date.now(),
      payload: this.encodeRequestSyncPayload(payload),
      allowedHops: 0, // Local only, don't relay
    };

    const signed = this.delegate?.signPacketForBroadcast(packet) ?? packet;
    this.delegate?.sendPacket(signed);
  }

  private sendRequestSyncToPeer(peerId: string, types: SyncTypeFlags): void {
    const payload = this.buildBloomFilterPayload(types);
    const packet: BitchatPacket = {
      version: 1,
      type: PacketType.SYNC,
      timestamp: Date.now(),
      payload: this.encodeRequestSyncPayload(payload),
      allowedHops: 0, // Local only
    };

    const signed = this.delegate?.signPacketForBroadcast(packet) ?? packet;
    this.sendPacketToPeer(peerId, signed);
  }

  private sendPacketToPeer(peerId: string, packet: BitchatPacket): void {
    this.delegate?.sendPacketToPeer(peerId, packet);
  }

  private buildBloomFilterPayload(types: SyncTypeFlags): RequestSyncPayload {
    const packets: BitchatPacket[] = [];

    if (types & SyncTypeFlags.ANNOUNCE) {
      for (const [, { packet }] of this.latestAnnouncementByPeer) {
        if (this.isPacketFresh(packet)) {
          packets.push(packet);
        }
      }
    }

    if (types & SyncTypeFlags.MESSAGE) {
      packets.push(...this.messages.allPackets((p) => this.isPacketFresh(p)));
    }

    if (types & SyncTypeFlags.FRAGMENT) {
      packets.push(...this.fragments.allPackets((p) => this.isPacketFresh(p)));
    }

    // Sort by timestamp descending (newest first)
    packets.sort((a, b) => b.timestamp - a.timestamp);

    // Limit to capacity
    const capacity =
      types === SyncTypeFlags.FRAGMENT
        ? this.config.fragmentCapacity
        : this.config.seenCapacity;
    const limitedPackets = packets.slice(0, capacity);

    // Build bloom filter from packet IDs
    const bloomFilter =
      limitedPackets.length > 0
        ? BloomFilter.create(
            Math.max(limitedPackets.length, 10),
            this.config.bloomFilterErrorRate
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

  private performPeriodicMaintenance(): void {
    const now = Date.now();

    // Cleanup expired messages
    this.cleanupExpiredMessages();

    // Cleanup stale announcements
    this.cleanupStaleAnnouncementsIfNeeded(now);

    // Send scheduled sync requests
    for (const schedule of this.syncSchedules) {
      if (schedule.intervalMs <= 0) continue;
      if (
        schedule.lastSent === 0 ||
        now - schedule.lastSent >= schedule.intervalMs
      ) {
        schedule.lastSent = now;
        this.sendRequestSync(schedule.types);
      }
    }
  }

  private cleanupExpiredMessages(): void {
    // Remove expired announcements
    for (const [peerId, { packet }] of this.latestAnnouncementByPeer) {
      if (!this.isPacketFresh(packet)) {
        this.latestAnnouncementByPeer.delete(peerId);
      }
    }

    // Remove expired messages and fragments
    this.messages.removeExpired((p) => this.isPacketFresh(p));
    this.fragments.removeExpired((p) => this.isPacketFresh(p));
  }

  private cleanupStaleAnnouncementsIfNeeded(now: number): void {
    if (
      now - this.lastStalePeerCleanup <
      this.config.stalePeerCleanupIntervalMs
    ) {
      return;
    }
    this.lastStalePeerCleanup = now;
    this.cleanupStaleAnnouncements(now);
  }

  private cleanupStaleAnnouncements(now: number): void {
    const cutoff = now - this.config.stalePeerTimeoutMs;
    const stalePeerIds: string[] = [];

    for (const [peerId, { packet }] of this.latestAnnouncementByPeer) {
      if (packet.timestamp < cutoff) {
        stalePeerIds.push(peerId);
      }
    }

    for (const peerId of stalePeerIds) {
      this.removeStateForPeer(peerId);
    }
  }

  private removeStateForPeer(peerId: string): void {
    this.latestAnnouncementByPeer.delete(peerId);
    this.messages.remove((packet) => this.extractSenderId(packet) === peerId);
    this.fragments.remove((packet) => this.extractSenderId(packet) === peerId);
  }

  private isPacketFresh(packet: BitchatPacket): boolean {
    const now = Date.now();
    if (now < this.config.maxMessageAgeMs) return true;
    const cutoff = now - this.config.maxMessageAgeMs;
    return packet.timestamp >= cutoff;
  }

  private isAnnouncementFresh(packet: BitchatPacket): boolean {
    if (this.config.stalePeerTimeoutMs <= 0) return true;
    const now = Date.now();
    if (now < this.config.stalePeerTimeoutMs) return true;
    const cutoff = now - this.config.stalePeerTimeoutMs;
    return packet.timestamp >= cutoff;
  }

  private isBroadcastPacket(_packet: BitchatPacket): boolean {
    // In this simplified implementation, we consider all packets as broadcasts
    // The original Swift code checks if recipientID is null or all 0xFF bytes
    return true;
  }

  private extractSenderId(packet: BitchatPacket): string | null {
    // Extract sender ID from packet payload
    // This is a simplified implementation - actual extraction depends on payload format
    // For now, we'll use a hash of the packet as a pseudo-sender ID
    return this.computePacketId(packet).slice(0, 16);
  }

  private computePacketId(packet: BitchatPacket): string {
    // Compute a unique ID for the packet based on its contents
    // Using timestamp + type + first bytes of payload as a simple hash
    const data = new Uint8Array(16);
    const view = new DataView(data.buffer);

    // Write timestamp (8 bytes)
    const timestamp = BigInt(packet.timestamp);
    view.setBigUint64(0, timestamp, false);

    // Write type (1 byte)
    data[8] = packet.type;

    // Write version (1 byte)
    data[9] = packet.version;

    // Write first 6 bytes of payload
    for (let i = 0; i < 6 && i < packet.payload.length; i++) {
      data[10 + i] = packet.payload[i];
    }

    // Convert to hex string
    return Array.from(data)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private encodeRequestSyncPayload(payload: RequestSyncPayload): Uint8Array {
    const json = JSON.stringify(payload);
    return new TextEncoder().encode(json);
  }

  private decodeRequestSyncPayload(
    data: Uint8Array
  ): RequestSyncPayload | null {
    try {
      const json = new TextDecoder().decode(data);
      return JSON.parse(json) as RequestSyncPayload;
    } catch {
      return null;
    }
  }
}

/**
 * Create a singleton instance of GossipSyncManager
 */
let instance: GossipSyncManager | null = null;

export function getGossipSyncManager(
  myPeerId?: string,
  config?: Partial<GossipSyncConfig>
): GossipSyncManager {
  if (!instance && myPeerId) {
    instance = new GossipSyncManager(myPeerId, config);
  }
  if (!instance) {
    throw new Error(
      "GossipSyncManager not initialized. Provide myPeerId on first call."
    );
  }
  return instance;
}

export function resetGossipSyncManager(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
