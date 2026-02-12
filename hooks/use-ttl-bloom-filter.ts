import TTLBloomFilter from "@/bloom/ttl-bloom-filter";
import { Base64String } from "@/utils/Base64String";
import { fetchFromFile, saveToAppDirectory } from "@/utils/file";
import { useEffect, useRef, useState } from "react";

const BLOOM_FILE = "ttl-bloom.json";
const SAVE_INTERVAL_MS = 30 * 1000; // Save to disk every 30 seconds
const PRUNE_INTERVAL_MS = 3600 * 1000; // Prune expired entries every 60 minutes

/**
 * Hook that provides a TTL bloom filter with automatic expiration of entries.
 *
 * Configuration:
 * - 5-minute TTL per entry
 * - Tracks up to 1000 concurrent items
 * - 1% false positive rate
 * - Auto-prunes expired entries every 60 seconds
 * - Auto-saves to disk every 30 seconds
 *
 * This implementation tracks individual timestamps per packet, providing
 * precise expiration at the cost of higher memory usage compared to
 * rotating bloom filters.
 *
 * Memory usage: ~40 bytes per tracked packet + bloom filter overhead
 */
export function useTTLBloomFilter() {
  const [bloomFilter, setBloomFilter] = useState<TTLBloomFilter | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pruneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function loadBloomFilter() {
      const json = await fetchFromFile(BLOOM_FILE);
      if (json) {
        console.log("[TTLBloom] Loaded from disk");
        try {
          const filter = TTLBloomFilter.fromJSON(JSON.parse(json));
          setBloomFilter(filter);

          // Log stats on load
          const stats = filter.stats();
          console.log("[TTLBloom] Stats:", {
            totalEntries: stats.totalEntries,
            activeEntries: stats.activeEntries,
            expiredEntries: stats.expiredEntries,
            ttl: `${stats.ttlMs / 1000}s`,
          });

          // Prune any expired entries that accumulated while offline
          if (stats.expiredEntries > 0) {
            console.log("[TTLBloom] Pruning expired entries from disk load");
            filter.pruneExpired();
          }
        } catch (error) {
          console.error("[TTLBloom] Failed to load, creating new:", error);
          createNewFilter();
        }
      } else {
        console.log("[TTLBloom] Creating new filter");
        createNewFilter();
      }
    }

    function createNewFilter() {
      // Expected ~1000 concurrent items, 0.01 error rate, 5-minute TTL
      const filter = TTLBloomFilter.create(
        1000, // max concurrent items
        0.01, // 1% false positive rate
        5 * 60 * 1000, // 5-minute TTL
      );
      setBloomFilter(filter);
    }

    loadBloomFilter();

    // Cleanup on unmount
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      if (pruneIntervalRef.current) {
        clearInterval(pruneIntervalRef.current);
      }
    };
  }, []);

  // Set up periodic saving
  useEffect(() => {
    if (!bloomFilter) return;

    const saveToDisk = () => {
      try {
        const json = JSON.stringify(bloomFilter.saveAsJSON());
        saveToAppDirectory(json, BLOOM_FILE);
      } catch (error) {
        console.error("[TTLBloom] Failed to save:", error);
      }
    };

    // Save immediately
    saveToDisk();

    // Then save periodically
    saveIntervalRef.current = setInterval(saveToDisk, SAVE_INTERVAL_MS);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
    };
  }, [bloomFilter]);

  // Set up periodic pruning
  useEffect(() => {
    if (!bloomFilter) return;

    const pruneExpired = () => {
      try {
        const pruned = bloomFilter.pruneExpired();
        if (pruned > 0) {
          console.log(`[TTLBloom] Pruned ${pruned} expired entries`);
        }
      } catch (error) {
        console.error("[TTLBloom] Failed to prune:", error);
      }
    };

    // Prune periodically
    pruneIntervalRef.current = setInterval(pruneExpired, PRUNE_INTERVAL_MS);

    return () => {
      if (pruneIntervalRef.current) {
        clearInterval(pruneIntervalRef.current);
        pruneIntervalRef.current = null;
      }
    };
  }, [bloomFilter]);

  const add = (packet: Uint8Array) => {
    if (!bloomFilter) {
      console.warn("[TTLBloom] Filter not initialized");
      return;
    }

    bloomFilter.add(Base64String.fromBytes(packet).getValue());
  };

  const has = (packet: Uint8Array): boolean => {
    if (!bloomFilter) {
      return false;
    }

    return bloomFilter.has(Base64String.fromBytes(packet).getValue());
  };

  /**
   * Manually trigger pruning of expired entries
   * @returns Number of entries removed
   */
  const prune = (): number => {
    if (!bloomFilter) {
      return 0;
    }

    return bloomFilter.pruneExpired();
  };

  /**
   * Get current statistics about the filter
   */
  const getStats = () => {
    return bloomFilter?.stats();
  };

  return { add, has, prune, getStats };
}
