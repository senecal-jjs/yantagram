/**
 * Quick hash function for binary data using FNV-1a algorithm
 * Fast, non-cryptographic hash suitable for deduplication and caching
 *
 * @param data Binary data to hash
 * @returns 32-bit hash as a number
 */
export function quickHash(data: Uint8Array): number {
  // FNV-1a 32-bit hash parameters
  const FNV_OFFSET_BASIS = 2166136261;
  const FNV_PRIME = 16777619;

  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Quick hash function that returns a hex string
 *
 * @param data Binary data to hash
 * @returns Hash as hexadecimal string
 */
export function quickHashHex(data: Uint8Array): string {
  return quickHash(data).toString(16).padStart(8, "0");
}
