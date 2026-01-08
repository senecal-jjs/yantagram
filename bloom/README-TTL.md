# Bloom Filter TTL/Expiration Approaches

## Overview
When implementing a flooding protocol over a BLE mesh network, bloom filters prevent duplicate packet processing. However, without expiration, the filter grows indefinitely and old packets are remembered forever. Two main approaches exist for adding TTL support.

---

## Approach 1: Time-Stamped Bloom Filter

**File**: `bloom/ttl-bloom-filter.ts`

### How It Works
- Stores each packet hash with its insertion timestamp in a Map
- Checks timestamps on lookup to determine if entries have expired
- Periodically prunes expired entries and rebuilds the bloom filter

### Pros
✅ Per-item expiration granularity (exact TTL per packet)  
✅ Simple mental model - each packet has its own lifetime  
✅ Can query exact statistics (how many expired vs active)  
✅ Can adjust TTL dynamically per packet if needed  

### Cons
❌ Higher memory overhead (stores timestamp for every hash)  
❌ Requires periodic pruning operation  
❌ Pruning requires rebuilding the entire bloom filter  
❌ Can't truly remove from bloom filter (need to rebuild)  
❌ More complex implementation  

### Memory Usage
```
Bloom filter: ~1.2KB (for 1000 items, 0.01 error rate)
Timestamp map: ~40 bytes per entry × number of packets
Example: 500 packets = ~20KB additional memory
Total: ~21KB for 500 concurrent packets
```

### Use Cases
- When precise expiration is critical
- When packet arrival patterns are unpredictable
- When you need detailed statistics about entry ages
- Smaller networks with predictable load

### Example Usage
```typescript
const filter = TTLBloomFilter.create(
  500,              // max concurrent items
  0.01,             // 1% error rate
  5 * 60 * 1000     // 5 minute TTL
);

filter.add(packetBytes);
filter.has(packetBytes);  // Checks expiration automatically

// Periodic cleanup (e.g., every minute)
setInterval(() => {
  filter.pruneExpired();
}, 60 * 1000);
```

---

## Approach 2: Rotating Bloom Filters ⭐ **Recommended**

**Files**: 
- `bloom/rotating-bloom-filter.ts`
- `hooks/use-rotating-bloom-filter.ts`

### How It Works
- Maintains N bloom filters (e.g., 3 filters)
- Each filter represents a time window (e.g., 2 minutes)
- Periodically rotates: discard oldest, create fresh current
- Lookups check all active filters

### Pros
✅ Lower memory overhead (no timestamp storage)  
✅ Predictable, constant memory usage  
✅ Simple rotation logic  
✅ No rebuild needed (just discard oldest)  
✅ Better performance (no timestamp lookups)  
✅ Natural time-based partitioning  
✅ Easier to reason about in distributed systems  

### Cons
❌ Coarser expiration granularity (by window, not per-item)  
❌ Items may live slightly longer than exact TTL  
❌ Can't know precise age of individual entries  
❌ Requires checking multiple filters on lookup  

### Memory Usage
```
Per filter: ~1.2KB (for 500 items, 0.01 error rate)
3 filters: ~3.6KB total
No timestamp storage needed
Total: ~4KB for any number of packets within capacity
```

### Configuration Example
```
3 filters × 2-minute windows = 6-minute total TTL

Filter 0 (current):  Items from 0-2 mins ago     [write/read]
Filter 1 (previous): Items from 2-4 mins ago     [read only]
Filter 2 (oldest):   Items from 4-6 mins ago     [read only]

After 2 minutes:
- Discard Filter 2
- Shift: Filter 1 → Filter 2, Filter 0 → Filter 1
- Create new empty Filter 0
```

### Use Cases
- Mesh networks with consistent packet rates
- Memory-constrained devices (BLE mesh)
- When window-based expiration is acceptable
- Most production scenarios ⭐

### Example Usage
```typescript
const filter = RotatingBloomFilter.create(
  500,              // items per window
  0.01,             // 1% error rate
  3,                // number of rotating filters
  2 * 60 * 1000     // 2-minute windows
);

filter.add(packetBytes);  // Auto-rotates if needed
filter.has(packetBytes);  // Checks all windows

const stats = filter.stats();
console.log(`Total TTL: ${stats.totalTTL / 1000}s`);
```

---

## Comparison Table

| Aspect | Time-Stamped | Rotating |
|--------|--------------|----------|
| **Memory Overhead** | High (~40 bytes/item) | Low (fixed) |
| **Expiration Precision** | Exact (per-item) | Coarse (per-window) |
| **Lookup Speed** | O(k) + Map lookup | O(n×k) where n = filters |
| **Cleanup Cost** | Rebuild filter | Discard filter (cheap) |
| **Memory Growth** | Linear with items | Constant |
| **Implementation Complexity** | Higher | Lower |
| **BLE Mesh Suitability** | Moderate | **High** ⭐ |

---

## Recommendation for BitChat BLE Mesh

**Use Rotating Bloom Filters** for these reasons:

1. **Memory Constrained**: Mobile devices benefit from predictable memory usage
2. **Natural Fit**: 2-minute windows align well with BLE mesh dynamics
3. **Simpler Operations**: No expensive rebuilds needed
4. **Sufficient Precision**: Window-based expiration is fine for flooding protocols
5. **Better Performance**: No timestamp lookups on hot path

### Suggested Configuration
```typescript
// 3 filters × 2 minutes = 6 minute total TTL
// Expected ~300 packets/minute in a typical mesh
const filter = RotatingBloomFilter.create(
  500,              // packets per 2-minute window
  0.01,             // 1% false positive rate
  3,                // 3 rotating filters
  2 * 60 * 1000     // 2-minute windows
);
```

This gives 6 minutes of duplicate detection, which is:
- Long enough to prevent loops in typical mesh topologies
- Short enough to allow re-gossip if network partitions heal
- Memory-efficient (~4KB vs ~20KB+ for timestamped approach)

---

## Migration Path

If currently using basic BloomFilter:

### Before
```typescript
const filter = new BloomFilter(1000, 4);
```

### After (Rotating)
```typescript
import { useRotatingBloomFilter } from "@/hooks/use-rotating-bloom-filter";

// In your component
const { add, has, getStats } = useRotatingBloomFilter();
```

The hook handles:
- ✅ Automatic rotation
- ✅ Persistence to disk
- ✅ Statistics logging
- ✅ Lifecycle management

---

## Testing Expiration

```typescript
// Advance time in tests
jest.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

// Trigger rotation
filter.add("new-packet");

// Old packets from >6 minutes ago won't be found
expect(filter.has("very-old-packet")).toBe(false);
```

---

## Performance Impact

### Without TTL
- Memory grows indefinitely: **Bad for long-running apps** ❌
- Old packets forever remembered: **Can't re-gossip after partition** ❌

### With Rotating Filters
- Constant memory: **~4KB always** ✅
- Auto-cleanup every 2 minutes: **Zero performance impact** ✅
- Packets expire: **Network can heal and re-sync** ✅
