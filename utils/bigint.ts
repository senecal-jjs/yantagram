/**
 * Convert a hex string to a BigInt
 *
 * @param hex Hex string (with or without '0x' prefix)
 * @returns BigInt representation of the hex string
 */
export function hexToBigInt(hex: string): bigint {
  // Remove '0x' prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return BigInt("0x" + cleanHex);
}

export function uint8ArrayToBigIntBE(arr: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = 0; i < arr.length; i++) {
    result = result * BigInt(256);
    result = result + BigInt(arr[i]);
  }
  return result;
}
