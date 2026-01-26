import { BitchatPacket, PacketType } from "@/types/global";

/**
 * Sync packet category for organizing packets by type
 */
export enum SyncPacketCategory {
  MESSAGE = "message",
  FRAGMENT = "fragment",
  FILE_TRANSFER = "file_transfer",
  ANNOUNCEMENT = "announcement",
}

/**
 * Stored sync packet with metadata
 */
export interface SyncPacket {
  id: number;
  packetIdHex: string;
  category: SyncPacketCategory;
  packet: BitchatPacket;
  createdAt: number;
}

/**
 * Repository for storing packets for gossip sync with FIFO eviction
 */
export default interface SyncPacketsRepository {
  /**
   * Insert or update a packet. If capacity is exceeded, evict oldest packets.
   * @param packetIdHex - Unique hex ID of the packet
   * @param category - The category of packet (message, fragment, etc.)
   * @param packet - The BitchatPacket to store
   * @param capacity - Maximum capacity for this category
   */
  upsert(
    packetIdHex: string,
    category: SyncPacketCategory,
    packet: BitchatPacket,
    capacity: number,
  ): Promise<void>;

  /**
   * Check if a packet exists by ID and category
   */
  has(packetIdHex: string, category: SyncPacketCategory): Promise<boolean>;

  /**
   * Get a packet by ID and category
   */
  get(
    packetIdHex: string,
    category: SyncPacketCategory,
  ): Promise<SyncPacket | null>;

  /**
   * Get all fresh packets for a category
   * @param category - The category to filter by
   * @param minTimestamp - Minimum packet timestamp (for freshness check)
   */
  getAllFresh(
    category: SyncPacketCategory,
    minTimestamp: number,
  ): Promise<SyncPacket[]>;

  /**
   * Get all packet IDs for a category
   */
  getAllIds(category: SyncPacketCategory): Promise<string[]>;

  /**
   * Delete expired packets (older than minTimestamp)
   */
  deleteExpired(minTimestamp: number): Promise<number>;

  /**
   * Delete all packets in a category
   */
  deleteByCategory(category: SyncPacketCategory): Promise<void>;

  /**
   * Delete all packets
   */
  deleteAll(): Promise<void>;

  /**
   * Get count of packets in a category
   */
  countByCategory(category: SyncPacketCategory): Promise<number>;

  /**
   * Get stats for all categories
   */
  getStats(): Promise<{
    messageCount: number;
    fragmentCount: number;
    fileTransferCount: number;
    announcementCount: number;
  }>;
}

/**
 * Map PacketType to SyncPacketCategory
 */
export function packetTypeToCategory(
  type: PacketType,
): SyncPacketCategory | null {
  switch (type) {
    case PacketType.ANNOUNCE:
      return SyncPacketCategory.ANNOUNCEMENT;
    case PacketType.MESSAGE:
      return SyncPacketCategory.MESSAGE;
    case PacketType.FRAGMENT:
      return SyncPacketCategory.FRAGMENT;
    case PacketType.FILE_TRANSFER:
      return SyncPacketCategory.FILE_TRANSFER;
    default:
      return null;
  }
}
