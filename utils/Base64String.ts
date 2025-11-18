import { Buffer } from "buffer";

/**
 * A TypeScript class that approximates a Kotlin value class for Base64 strings.
 * Provides a type-safe wrapper around base64-encoded strings with encoding/decoding utilities.
 *
 * Similar to Kotlin's value class, this provides a lightweight wrapper with utility methods.
 */
class Base64String {
  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Create a Base64String from a raw base64-encoded string
   * @param base64 - A base64-encoded string
   * @returns A new Base64String instance
   */
  static fromBase64(base64: string): Base64String {
    return new Base64String(base64);
  }

  /**
   * Encode raw bytes (Uint8Array) to a Base64String
   * @param bytes - Raw bytes to encode
   * @returns A new Base64String instance
   */
  static fromBytes(bytes: Uint8Array): Base64String {
    // Convert Uint8Array to base64 string using Buffer
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    return new Base64String(base64);
  }

  /**
   * Decode this Base64String to raw bytes (Uint8Array)
   * @returns Decoded bytes as Uint8Array
   * @throws Error if the base64 string is invalid
   */
  toBytes(): Uint8Array {
    try {
      const buffer = Buffer.from(this.value, "base64");
      return new Uint8Array(buffer);
    } catch (error) {
      throw new Error(`Invalid base64 string: ${error}`);
    }
  }

  /**
   * Get the raw base64 string value
   * @returns The base64-encoded string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Get the raw base64 string value (alias for toString)
   * @returns The base64-encoded string
   */
  getValue(): string {
    return this.value;
  }

  /**
   * Compare this Base64String with another for equality
   * @param other - Another Base64String to compare
   * @returns True if the base64 values are equal
   */
  equals(other: Base64String): boolean {
    return this.value === other.value;
  }

  /**
   * Get the length of the base64 string
   * @returns Length of the base64 string
   */
  get length(): number {
    return this.value.length;
  }

  /**
   * Check if the base64 string is empty
   * @returns True if empty
   */
  isEmpty(): boolean {
    return this.value.length === 0;
  }

  /**
   * Create an empty Base64String
   * @returns An empty Base64String instance
   */
  static empty(): Base64String {
    return new Base64String("");
  }

  /**
   * Encode a UTF-8 string to Base64String
   * @param text - UTF-8 text to encode
   * @returns A new Base64String instance
   */
  static fromText(text: string): Base64String {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    return Base64String.fromBytes(bytes);
  }

  /**
   * Decode this Base64String to a UTF-8 string
   * @returns Decoded UTF-8 string
   */
  toText(): string {
    const bytes = this.toBytes();
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(bytes);
  }

  /**
   * Check if a string is valid base64
   * @param str - String to validate
   * @returns True if valid base64
   */
  static isValidBase64(str: string): boolean {
    try {
      // Base64 should only contain A-Z, a-z, 0-9, +, /, and = for padding
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(str)) {
        return false;
      }
      // Try to decode it using Buffer
      Buffer.from(str, "base64");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a Base64String from a hex string
   * @param hex - Hexadecimal string
   * @returns A new Base64String instance
   */
  static fromHex(hex: string): Base64String {
    // Remove any spaces or 0x prefix
    const cleanHex = hex.replace(/\s/g, "").replace(/^0x/, "");

    // Convert hex to bytes
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
    }

    return Base64String.fromBytes(bytes);
  }

  /**
   * Convert this Base64String to a hex string
   * @returns Hexadecimal representation
   */
  toHex(): string {
    const bytes = this.toBytes();
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Concatenate two Base64Strings at the byte level
   * @param other - Another Base64String to concatenate
   * @returns A new Base64String with concatenated bytes
   */
  concat(other: Base64String): Base64String {
    const bytes1 = this.toBytes();
    const bytes2 = other.toBytes();
    const combined = new Uint8Array(bytes1.length + bytes2.length);
    combined.set(bytes1, 0);
    combined.set(bytes2, bytes1.length);
    return Base64String.fromBytes(combined);
  }

  /**
   * Get a slice of this Base64String at the byte level
   * @param start - Start index in bytes
   * @param end - End index in bytes (optional)
   * @returns A new Base64String with sliced bytes
   */
  slice(start: number, end?: number): Base64String {
    const bytes = this.toBytes();
    const sliced = bytes.slice(start, end);
    return Base64String.fromBytes(sliced);
  }
}

export default Base64String;
export { Base64String };
