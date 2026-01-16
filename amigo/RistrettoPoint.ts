import { ristretto255 } from "@noble/curves/ed25519.js";

export class RistrettoPoint {
  private hex: string;

  constructor(hex: string) {
    this.hex = hex;
  }

  static fromBytes(bytes: Uint8Array): RistrettoPoint {
    return new RistrettoPoint(ristretto255.Point.fromBytes(bytes).toHex());
  }

  getHex(): string {
    return this.hex;
  }

  toBytes(): Uint8Array {
    return ristretto255.Point.fromHex(this.hex).toBytes();
  }
}
