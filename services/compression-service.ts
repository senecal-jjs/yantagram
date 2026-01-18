import pako from "pako";

/**
 * Compression utilities for BitChat protocol
 * Uses zlib compression via pako library for compatibility with Swift implementation
 */

const compressionThreshold = 100;

/**
 * Compress data using zlib algorithm (most compatible with Swift implementation)
 * @param data - Data to compress
 * @returns Compressed data or null if compression failed or wasn't beneficial
 */
function compress(data: Uint8Array): Uint8Array | null {
  // Skip compression for small data
  if (data.length < compressionThreshold) {
    return null;
  }

  try {
    const compressed = pako.deflate(data, {
      level: 6, // Balanced compression level
      windowBits: 15, // Standard zlib window size
      memLevel: 8, // Default memory level
      strategy: 0, // Default strategy
    });

    // Only return compressed data if it's actually smaller
    if (compressed.length >= data.length) {
      return null;
    }

    return compressed;
  } catch (error) {
    console.warn("Compression failed:", error);
    return null;
  }
}

/**
 * Decompress zlib compressed data
 * @param compressedData - Compressed data to decompress
 * @param originalSize - Expected size of decompressed data (for validation)
 * @returns Decompressed data or null if decompression failed
 */
function decompress(
  compressedData: Uint8Array,
  originalSize: number,
): Uint8Array | null {
  // Sanity check on original size
  if (originalSize <= 0 || originalSize > 100 * 1024 * 1024) {
    // 100MB limit
    return null;
  }

  try {
    const decompressed = pako.inflate(compressedData);

    // Verify the decompressed size matches expected size
    if (decompressed.length !== originalSize) {
      console.warn(
        `Decompression size mismatch: expected ${originalSize}, got ${decompressed.length}`,
      );
      return null;
    }

    return decompressed;
  } catch (error) {
    console.warn("Decompression failed:", error);
    return null;
  }
}

/**
 * Helper to check if compression is worth it
 * @param data - Data to analyze
 * @returns True if data should be compressed
 */
function shouldCompress(data: Uint8Array): boolean {
  // Don't compress if data is too small
  if (data.length < compressionThreshold) {
    return false;
  }

  // Quick uniqueness check — a high diversity of bytes usually means the
  // payload is already compressed. We only need to know how many unique
  // values exist rather than keeping full frequency counts.
  const sampleSize = Math.min(data.length, 256);
  const sample = data.slice(0, sampleSize);

  // Count unique bytes in sample
  const uniqueBytes = new Set(sample);
  const uniqueByteRatio = uniqueBytes.size / sampleSize;

  // Compress if less than 90% unique bytes (indicates repetitive data)
  return uniqueByteRatio < 0.9;
}

/**
 * Get the compression threshold value
 * @returns Current compression threshold in bytes
 */
function getCompressionThreshold(): number {
  return compressionThreshold;
}

/**
 * Estimate compressed size without actually compressing
 * @param data - Data to estimate compression for
 * @returns Estimated compression ratio (0-1, where 0.5 means 50% of original size)
 */
function estimateCompressionRatio(data: Uint8Array): number {
  if (!shouldCompress(data)) {
    return 1.0; // No compression benefit expected
  }

  // Simple heuristic based on byte diversity
  const sampleSize = Math.min(data.length, 256);
  const sample = data.slice(0, sampleSize);
  const uniqueBytes = new Set(sample);
  const uniqueByteRatio = uniqueBytes.size / sampleSize;

  // Estimate compression ratio based on uniqueness
  // Less unique = better compression
  const estimatedRatio = Math.max(0.1, uniqueByteRatio);
  return Math.min(1.0, estimatedRatio);
}

export {
  compress,
  decompress,
  estimateCompressionRatio,
  getCompressionThreshold,
  shouldCompress,
};
