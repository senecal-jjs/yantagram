import TTLBloomFilter from "../ttl-bloom-filter";

describe("TTLBloomFilter with Counting Bloom Filter", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should create a TTL bloom filter", () => {
    const filter = new TTLBloomFilter(100, 3, 5000);
    expect(filter).toBeDefined();
  });

  it("should add and retrieve elements", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);

    filter.add("packet1");
    filter.add("packet2");

    expect(filter.has("packet1")).toBe(true);
    expect(filter.has("packet2")).toBe(true);
    expect(filter.has("packet3")).toBe(false);
  });

  it("should track elements with timestamps", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);
    const now = Date.now();

    filter.add("packet1", now);
    filter.add("packet2", now + 1000);

    const stats = filter.stats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.activeEntries).toBe(2);
    expect(stats.expiredEntries).toBe(0);
  });

  it("should expire elements after TTL", () => {
    const ttl = 5000; // 5 seconds
    const filter = TTLBloomFilter.create(100, 0.01, ttl);

    filter.add("packet1");
    expect(filter.has("packet1")).toBe(true);

    // Advance time past TTL
    jest.advanceTimersByTime(ttl + 1000);

    // Accessing expired element should return false and remove it
    expect(filter.has("packet1")).toBe(false);

    const stats = filter.stats();
    expect(stats.totalEntries).toBe(0); // Should be removed from tracking
  });

  it("should support true removal via counting bloom filter", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);
    const now = Date.now();

    filter.add("packet1", now);

    expect(filter.has("packet1")).toBe(true);

    // Manually expire packet1
    jest.advanceTimersByTime(6000);

    // Add packet2 after time advance (so it's not expired)
    filter.add("packet2");

    // Access packet1 to trigger removal
    expect(filter.has("packet1")).toBe(false);

    // packet2 should still be there (not expired yet)
    expect(filter.has("packet2")).toBe(true);

    const stats = filter.stats();
    expect(stats.filterLength).toBeGreaterThan(0); // packet2 still in filter
  });

  it("should prune expired entries in batch", () => {
    const ttl = 5000;
    const filter = TTLBloomFilter.create(100, 0.01, ttl);
    const now = Date.now();

    filter.add("packet1", now);
    filter.add("packet2", now + 1000);
    filter.add("packet3", now + 6000); // Won't expire

    jest.advanceTimersByTime(ttl + 2000);

    const pruned = filter.pruneExpired();
    expect(pruned).toBe(2); // packet1 and packet2 expired

    const stats = filter.stats();
    expect(stats.totalEntries).toBe(1); // Only packet3 remains
    expect(stats.activeEntries).toBe(1);
  });

  it("should maintain false positive rate after removals", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);

    // Add many items
    for (let i = 0; i < 50; i++) {
      filter.add(`packet${i}`);
    }

    const statsBefore = filter.stats();
    expect(statsBefore.filterLength).toBeGreaterThan(0);
    expect(statsBefore.falsePositiveRate).toBeGreaterThan(0);

    // Expire and prune all items
    jest.advanceTimersByTime(6000);
    filter.pruneExpired();

    const statsAfter = filter.stats();
    expect(statsAfter.totalEntries).toBe(0);
    // Filter should be empty after removals
    expect(statsAfter.filterLength).toBe(0);
  });

  it("should export and import correctly", () => {
    const filter1 = TTLBloomFilter.create(100, 0.01, 5000);
    const now = Date.now();

    filter1.add("packet1", now);
    filter1.add("packet2", now + 1000);

    const exported = filter1.saveAsJSON();
    const filter2 = TTLBloomFilter.fromJSON(exported);

    expect(filter2.has("packet1")).toBe(true);
    expect(filter2.has("packet2")).toBe(true);
    expect(filter2.has("packet3")).toBe(false);

    const stats1 = filter1.stats();
    const stats2 = filter2.stats();

    expect(stats2.totalEntries).toBe(stats1.totalEntries);
    expect(stats2.ttlMs).toBe(stats1.ttlMs);
  });

  it("should preserve element references for removal", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);
    const now = Date.now();

    const element1 = "packet-hash-abc123";
    const element2 = "packet-hash-def456";

    filter.add(element1, now);

    expect(filter.has(element1)).toBe(true);

    // Expire element1
    jest.advanceTimersByTime(6000);

    // Add element2 after expiring element1
    filter.add(element2);

    expect(filter.has(element1)).toBe(false);

    // Verify element2 is still present
    expect(filter.has(element2)).toBe(true);
  });

  it("should report accurate statistics", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);
    const now = Date.now();

    filter.add("packet1", now);
    filter.add("packet2", now + 500); // Expires at now + 5500

    // Advance time to make first two expire (now + 6000 > now + 5500)
    jest.advanceTimersByTime(6000);

    // Add packet3 after time advance (so it's fresh and not expired)
    filter.add("packet3");

    const stats = filter.stats();

    expect(stats.totalEntries).toBe(3);
    expect(stats.expiredEntries).toBe(2);
    expect(stats.activeEntries).toBe(1);
    expect(stats.ttlMs).toBe(5000);
    expect(stats.filterLength).toBe(3); // All still in counting filter until pruned
    expect(stats.falsePositiveRate).toBeGreaterThan(0);
  });

  it("should handle empty filter gracefully", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);

    expect(filter.has("nonexistent")).toBe(false);

    const pruned = filter.pruneExpired();
    expect(pruned).toBe(0);

    const stats = filter.stats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.filterLength).toBe(0);
  });

  it("should handle same element added multiple times", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);

    filter.add("packet1");
    filter.add("packet1"); // Add again

    expect(filter.has("packet1")).toBe(true);

    // Stats should show multiple entries (due to map overwrite and bloom counter)
    const stats = filter.stats();
    expect(stats.totalEntries).toBe(1); // Map overwrites, so only 1 tracked
    expect(stats.filterLength).toBeGreaterThan(0); // Counting filter increments
  });

  it("should not prune non-expired entries", () => {
    const filter = TTLBloomFilter.create(100, 0.01, 5000);
    const now = Date.now();

    filter.add("packet1", now);
    filter.add("packet2", now + 1000);
    filter.add("packet3", now + 2000);

    // Advance time but not past TTL
    jest.advanceTimersByTime(3000);

    const pruned = filter.pruneExpired();
    expect(pruned).toBe(0); // Nothing expired yet

    const stats = filter.stats();
    expect(stats.totalEntries).toBe(3);
    expect(stats.activeEntries).toBe(3);
  });
});
