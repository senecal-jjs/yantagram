# TTL Bloom Filter with Counting Bloom Filter

## Overview
When implementing a flooding protocol over a BLE mesh network, bloom filters prevent duplicate packet processing. However, without expiration, the filter grows indefinitely and old packets are remembered forever. This implementation uses a Counting Bloom Filter to enable true removal of expired entries without rebuilding.

---

## Time-Stamped Bloom Filter with Counting Support

**File**: `bloom/ttl-bloom-filter.ts`

### How It Works
- Uses a **Counting Bloom Filter** that maintains counters for each bit position
- Stores each packet hash with its insertion timestamp in a Map
- Checks timestamps on lookup to determine if entries have expired
- **True removal** via counter decrements (no rebuild needed!)
- Periodically prunes expired entries using the counting filter's remove() method

### Pros
✅ Per-item expiration granularity (exact TTL per packet)  
✅ Simple mental model - each packet has its own lifetime  
✅ Can query exact statistics (how many expired vs active)  
✅ **True removal support** - no rebuild needed ⭐  
✅ Maintains optimal false positive rate after removals  
✅ Can adjust TTL dynamically per packet if needed  

### Cons
❌ Higher memory overhead (stores timestamp + counting filter)  
❌ Requires periodic pruning operation  

### Memory Usage
```
Counting Bloom filter: ~2.4KB (for 1000 items, 0.01 error rate, 4-bit counters)
Timestamp map: ~40 bytes per entry × number of packets
Element references: ~32 bytes per entry (for removal support)
Example: 500 packets = ~36KB additional memory
Total: ~38.4KB for 500 concurrent packets
```

### Use Cases
- When precise expiration is critical
- When packet arrival patterns are unpredictable
- BLE mesh networks with moderate packet rates
- When maintaining optimal false positive rate is important

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
// Uses counting bloom filter for true removal - no rebuild!
setInterval(() => {
  const removed = filter.pruneExpired();
  console.log(`Removed ${removed} expired entries`);
}, 60 * 1000);

// Check statistics
const stats = filter.stats();
console.log(`Active: ${stats.activeEntries}, FP rate: ${stats.falsePositiveRate}`);
```

---

## Key Features

### True Removal via Counting Bloom Filter
Unlike traditional bloom filters, this implementation uses a **Counting Bloom Filter** which maintains counters at each bit position. This enables:

- **O(k) removal** by decrementing counters (k = number of hash functions)
- **No rebuild needed** - expired entries are truly removed
- **Maintains false positive rate** - filter doesn't degrade over time
- **Efficient pruning** - batch remove expired entries without reconstruction

### How Counting Bloom Filter Works
```typescript
// Traditional Bloom Filter
// - Can only add (set bit to 1)
// - Cannot remove (can't know if other items share the bit)

// Counting Bloom Filter
// - Adds: increment counter at hash positions
// - Removes: decrement counter at hash positions
// - Bit is "set" if counter > 0
// - Enables true removal!
```

---

## Migration Path

If currently using basic BloomFilter:

### Before
```typescript
const filter = new BloomFilter(1000, 4);
```

### After
```typescript
import { useTTLBloomFilter } from "@/hooks/use-ttl-bloom-filter";

// In your component
const { add, has, getStats } = useTTLBloomFilter();
```

The hook handles:
- ✅ Automatic pruning
- ✅ Persistence to disk
- ✅ Statistics logging
- ✅ Lifecycle management
- ✅ True removal via counting bloom filter
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
Use fake timers in tests
jest.useFakeTimers();

const filter = TTLBloomFilter.create(100, 0.01, 5000); // 5s TTL

filter.add("packet1");
expect(filter.has("packet1")).toBe(true);

// Advance time past TTL
jest.advanceTimersByTime(6000);

// Access triggers automatic removal
expect(filter.has("packet1")).toBe(false);

// Or prune manually
const removed = filter.pruneExpired();
expect(removed).toBe(0); // Already removed on access
```

---

## Performance Impact

### Without TTL
- Memory grows indefinitely: **Bad for long-running apps** ❌
- Old packets forever remembered: **Can't re-gossip after partition** ❌
- Filter degrades over time: **False positive rate increases** ❌

### With TTL Counting Bloom Filter
- Predictable memory: **~38KB for 500 packets** ✅
- Auto-cleanup with true removal: **No rebuild cost** ✅
- Maintains false positive rate: **Optimal performance