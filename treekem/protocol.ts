/**
 * Protocol utilities for TreeKEM
 */

import { Credentials, SerializedCredentials } from "./types";

/**
 * Serialize credentials to a base64-encoded JSON string for QR code encoding
 */
export function serializeCredentialsForQR(credentials: Credentials): string {
  const serialized: SerializedCredentials = {
    verificationKey: Buffer.from(credentials.verificationKey).toString(
      "base64",
    ),
    pseudonym: credentials.pseudonym,
    signature: Buffer.from(credentials.signature).toString("base64"),
    ecdhPublicKey: Buffer.from(credentials.ecdhPublicKey).toString("base64"),
  };

  return JSON.stringify(serialized);
}

/**
 * Deserialize credentials from a base64-encoded JSON string (from QR code)
 */
export function deserializeCredentialsFromQR(data: string): Credentials {
  const serialized: SerializedCredentials = JSON.parse(data);

  return {
    verificationKey: Buffer.from(serialized.verificationKey, "base64"),
    pseudonym: serialized.pseudonym,
    signature: Buffer.from(serialized.signature, "base64"),
    ecdhPublicKey: Buffer.from(serialized.ecdhPublicKey, "base64"),
  };
}
