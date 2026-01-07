/**
 * A Bloom Filter with TTL (Time-To-Live) support for automatic expiration of entries.
 *
 * This implementation uses a Counting Bloom Filter to track packet hashes with their
 * insertion timestamps. The counting bloom filter allows true removal of expired entries,
 * preventing the filter from degrading over time and maintaining its false positive rate.
 *
 * Benefits:
 * - True removal support (no need to rebuild the filter)
 * - Maintains optimal false positive rate
 * - Memory efficient cleanup of expired entries
 * - Prevents indefinite growth in long-running mesh networks
 */

import CountingBloomFilter from "./counting-bloom-filter";
import { HashableInput } from "./types";

export type TTLEntry = {
  element: HashableInput;
  insertedAt: number; // timestamp in milliseconds
};

export type ExportedTTLBloomFilter = {
  bloomFilter: ReturnType<CountingBloomFilter["saveAsJSON"]>;
  entries: TTLEntry[];
  ttlMs: number;
};

export default class TTLBloomFilter {
  private bloomFilter: CountingBloomFilter;
  private entries: Map<string, { element: HashableInput; timestamp: number }>;
  private ttlMs: number;

  /**
   * @param size - The number of cells in the bloom filter
   * @param nbHashes - The number of hash functions used
   * @param ttlMs - Time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(size: number, nbHashes: number, ttlMs: number = 5 * 60 * 1000) {
    this.bloomFilter = new CountingBloomFilter(size, nbHashes);
    this.entries = new Map();
    this.ttlMs = ttlMs;
  }

  /**
   * Create an optimal TTL bloom filter
   * @param nbItems - The maximum number of items stored concurrently
   * @param errorRate - The desired error rate
   * @param ttlMs - Time-to-live in milliseconds
   */
  public static create(
    nbItems: number,
    errorRate: number,
    ttlMs: number = 5 * 60 * 1000,
  ): TTLBloomFilter {
    const bloomFilter = CountingBloomFilter.create(nbItems, errorRate);
    const ttlFilter = new TTLBloomFilter(
      bloomFilter.size,
      bloomFilter._nbHashes,
      ttlMs,
    );
    ttlFilter.bloomFilter = bloomFilter;
    return ttlFilter;
  }

  /**
   * Add an element with a timestamp
   * @param element - The element to add
   * @param timestamp - Optional timestamp (defaults to now)
   */
  public add(element: HashableInput, timestamp?: number): void {
    const hash = this.hashElement(element);
    const insertedAt = timestamp ?? Date.now();

    this.bloomFilter.add(element);
    this.entries.set(hash, { element, timestamp: insertedAt });
  }

  /**
   * Test if an element exists and hasn't expired
   * @param element - The element to look for
   * @returns False if definitely not in filter or expired, True if might be present
   */
  public has(element: HashableInput): boolean {
    const hash = this.hashElement(element);
    const entry = this.entries.get(hash);

    // If we have a timestamp record, check if it's expired
    if (entry !== undefined) {
      if (this.isExpired(entry.timestamp)) {
        // Entry has expired, remove it completely
        this.remove(element);
        return false;
      }
    }

    // Check the bloom filter
    return this.bloomFilter.has(element);
  }

  /**
   * Remove an element from both the counting bloom filter and tracking
   * @param element - The element to remove
   */
  private remove(element: HashableInput): void {
    const hash = this.hashElement(element);
    this.entries.delete(hash);
    // CountingBloomFilter supports true removal
    this.bloomFilter.remove(element);
  }

  /**
   * Clean up expired entries by removing them from the counting bloom filter
   * This should be called periodically (e.g., every minute)
   * @returns Number of entries removed
   */
  public pruneExpired(): number {
    const now = Date.now();
    const expiredEntries: { hash: string; element: HashableInput }[] = [];

    // Find expired entries
    for (const [hash, entry] of this.entries.entries()) {
      if (this.isExpired(entry.timestamp, now)) {
        expiredEntries.push({ hash, element: entry.element });
      }
    }

    if (expiredEntries.length === 0) {
      return 0;
    }

    // Remove expired entries from both tracking map and counting bloom filter
    for (const { hash, element } of expiredEntries) {
      this.entries.delete(hash);
      // CountingBloomFilter supports true removal without rebuilding
      this.bloomFilter.remove(element);
    }

    console.log(
      `[TTLBloomFilter] Pruned ${expiredEntries.length} expired entries, ${this.entries.size} remain`,
    );

    return expiredEntries.length;
  }

  /**
   * Check if a timestamp has expired
   */
  private isExpired(insertedAt: number, now: number = Date.now()): boolean {
    return now - insertedAt > this.ttlMs;
  }

  /**
   * Simple hash function for tracking purposes
   */
  private hashElement(element: HashableInput): string {
    return typeof element === "string" ? element : JSON.stringify(element);
  }

  /**
   * Get current statistics
   */
  public stats(): {
    totalEntries: number;
    expiredEntries: number;
    activeEntries: number;
    ttlMs: number;
    filterLength: number;
    falsePositiveRate: number;
  } {
    const now = Date.now();
    let expiredCount = 0;

    for (const entry of this.entries.values()) {
      if (this.isExpired(entry.timestamp, now)) {
        expiredCount++;
      }
    }

    return {
      totalEntries: this.entries.size,
      expiredEntries: expiredCount,
      activeEntries: this.entries.size - expiredCount,
      ttlMs: this.ttlMs,
      filterLength: this.bloomFilter.length,
      falsePositiveRate: this.bloomFilter.rate(),
    };
  }

  /**
   * Export for persistence
   */
  public saveAsJSON(): ExportedTTLBloomFilter {
    return {
      bloomFilter: this.bloomFilter.saveAsJSON(),
      entries: Array.from(this.entries.entries()).map(([hash, entry]) => ({
        element: entry.element,
        insertedAt: entry.timestamp,
      })),
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Import from persistence
   */
  public static fromJSON(data: ExportedTTLBloomFilter): TTLBloomFilter {
    const filter = new TTLBloomFilter(
      data.bloomFilter._size,
      data.bloomFilter._nbHashes,
      data.ttlMs,
    );
    filter.bloomFilter = CountingBloomFilter.fromJSON(data.bloomFilter);
    filter.entries = new Map(
      data.entries.map((entry) => [
        filter.hashElement(entry.element),
        { element: entry.element, timestamp: entry.insertedAt },
      ]),
    );
    return filter;
  }
}
