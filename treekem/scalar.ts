import { ed25519 } from "@noble/curves/ed25519.js";

// Curve order for Ed25519/Ristretto255
const CURVE_ORDER = ed25519.Point.Fn.ORDER;

export class Scalar {
  private value: bigint;

  constructor(scalar: bigint) {
    // Always reduce modulo curve order to keep scalar in valid range
    this.value = mod(scalar, CURVE_ORDER);
  }

  static fromBytes(bytes: Uint8Array): Scalar {
    if (bytes.length !== 32) {
      throw new Error(`Scalar must be 32 bytes, got ${bytes.length}`);
    }

    // Ed25519/Ristretto255 uses LITTLE-ENDIAN encoding
    let result = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
      result = (result << 8n) + BigInt(bytes[i]);
    }

    // Reduce modulo curve order
    return new Scalar(mod(result, CURVE_ORDER));
  }

  toBytes(): Uint8Array {
    let value = this.value;
    const bytes = new Uint8Array(32); // Always 32 bytes

    // Write in little-endian order
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number(value & 0xffn);
      value = value >> 8n;
    }

    return bytes;
  }

  getValue(): bigint {
    return this.value;
  }

  add(other: Scalar): Scalar {
    return new Scalar(this.value + other.value);
  }
}

// Modulo operation that handles negative numbers correctly
function mod(a: bigint, b: bigint): bigint {
  const result = a % b;
  return result >= 0n ? result : result + b;
}
