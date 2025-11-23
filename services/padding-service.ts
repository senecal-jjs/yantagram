/**
 * Provides privacy-preserving message padding to obscure actual content length.
 * Uses PKCS#7-style padding with deterministic bytes to prevent traffic analysis.
 */
class MessagePadding {
  // Standard block sizes for padding
  private static readonly blockSizes = [256, 512, 1024, 2048];

  /**
   * Add PKCS#7-style padding to reach target size
   * @param data - Data to pad
   * @param targetSize - Desired final size
   * @returns Padded data or original data if padding not possible
   */
  static pad(data: Uint8Array, targetSize: number): Uint8Array {
    if (data.length >= targetSize) {
      return data;
    }

    const paddingNeeded = targetSize - data.length;
    // Constrain to 255 to fit a single-byte pad length marker
    if (paddingNeeded <= 0 || paddingNeeded > 255) {
      return data;
    }

    // PKCS#7: All pad bytes are equal to the pad length
    const padded = new Uint8Array(targetSize);
    padded.set(data);

    // Fill remaining bytes with padding value (equal to padding length)
    for (let i = data.length; i < targetSize; i++) {
      padded[i] = paddingNeeded;
    }

    return padded;
  }

  /**
   * Remove padding from data
   * @param data - Padded data
   * @returns Data with padding removed or original data if not properly padded
   */
  static unpad(data: Uint8Array): Uint8Array {
    if (data.length === 0) {
      return data;
    }

    const lastByte = data[data.length - 1];
    const paddingLength = lastByte;

    // Must have at least 1 pad byte and not exceed data length
    if (paddingLength <= 0 || paddingLength > data.length) {
      return data;
    }

    // Verify PKCS#7: all last N bytes equal to pad length
    const start = data.length - paddingLength;
    for (let i = start; i < data.length; i++) {
      if (data[i] !== lastByte) {
        return data; // Invalid padding, return original data
      }
    }

    // Return data without padding
    return data.slice(0, start);
  }

  /**
   * Find optimal block size for data
   * @param dataSize - Size of data to be padded
   * @returns Optimal block size
   */
  static optimalBlockSize(dataSize: number): number {
    // Account for encryption overhead (~16 bytes for AES-GCM tag)
    const totalSize = dataSize + 16;

    // Find smallest block that fits
    for (const blockSize of this.blockSizes) {
      if (totalSize <= blockSize) {
        return blockSize;
      }
    }

    // For very large messages, just use the original size
    // (will be fragmented anyway)
    return dataSize;
  }

  /**
   * Get all available block sizes
   * @returns Array of block sizes
   */
  static getBlockSizes(): number[] {
    return [...this.blockSizes];
  }

  /**
   * Calculate padding overhead for given data size
   * @param dataSize - Size of original data
   * @returns Number of padding bytes that would be added
   */
  static calculatePaddingOverhead(dataSize: number): number {
    const optimalSize = this.optimalBlockSize(dataSize);
    return Math.max(0, optimalSize - dataSize);
  }

  /**
   * Check if data appears to be properly PKCS#7 padded
   * @param data - Data to check
   * @returns True if data appears to have valid PKCS#7 padding
   */
  static isValidPadding(data: Uint8Array): boolean {
    if (data.length === 0) {
      return false;
    }

    const lastByte = data[data.length - 1];
    const paddingLength = lastByte;

    // Must have valid padding length
    if (
      paddingLength <= 0 ||
      paddingLength > data.length ||
      paddingLength > 255
    ) {
      return false;
    }

    // Check if all padding bytes match
    const start = data.length - paddingLength;
    for (let i = start; i < data.length; i++) {
      if (data[i] !== lastByte) {
        return false;
      }
    }

    return true;
  }

  /**
   * Pad data to next block boundary
   * @param data - Data to pad
   * @returns Data padded to optimal block size
   */
  static padToOptimalSize(data: Uint8Array): Uint8Array {
    const optimalSize = this.optimalBlockSize(data.length);
    return this.pad(data, optimalSize);
  }
}

export default MessagePadding;
export { MessagePadding };
