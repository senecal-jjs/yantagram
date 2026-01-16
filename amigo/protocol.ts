/**
 * Protocol utilities for TreeKEM
 */

import ByteArrayBuilder from "@/utils/byte-array-builder";
import {
  Credentials,
  SerializedCredentials,
  UpdateMessage,
  WelcomeMessage,
} from "./types";
import { createAnnounceSigningMessage, SignatureMaterial } from "./upke";

/**
 * Announce payload structure with signature for authenticity verification
 */
export interface AnnouncePayload {
  credentials: Credentials;
  timestamp: number;
  announceSignature: Uint8Array; // Signs: verificationKey + pseudonym + timestamp
}

/**
 * Serialize an announce payload to binary format
 * Format:
 * - 4 bytes: verificationKey length (uint32)
 * - N bytes: verificationKey
 * - 4 bytes: pseudonym length (uint32)
 * - M bytes: pseudonym (UTF-8 encoded)
 * - 4 bytes: signature length (uint32)
 * - K bytes: signature (credential signature)
 * - 4 bytes: ecdhPublicKey length (uint32)
 * - L bytes: ecdhPublicKey
 * - 8 bytes: timestamp (uint64)
 * - 4 bytes: announceSignature length (uint32)
 * - P bytes: announceSignature
 */
export function serializeAnnouncePayload(
  credentials: Credentials,
  timestamp: number,
  signingKey: Uint8Array,
): Uint8Array {
  const builder = new ByteArrayBuilder();
  const encoder = new TextEncoder();

  // Serialize verificationKey
  const vkLength = new Uint8Array(4);
  new DataView(vkLength.buffer).setUint32(
    0,
    credentials.verificationKey.length,
    false,
  );
  builder.append(vkLength);
  builder.append(credentials.verificationKey);

  // Serialize pseudonym (UTF-8 encoded)
  const pseudonymBytes = encoder.encode(credentials.pseudonym);
  const pseudonymLength = new Uint8Array(4);
  new DataView(pseudonymLength.buffer).setUint32(
    0,
    pseudonymBytes.length,
    false,
  );
  builder.append(pseudonymLength);
  builder.append(pseudonymBytes);

  // Serialize credential signature
  const sigLength = new Uint8Array(4);
  new DataView(sigLength.buffer).setUint32(
    0,
    credentials.signature.length,
    false,
  );
  builder.append(sigLength);
  builder.append(credentials.signature);

  // Serialize ecdhPublicKey
  const ecdhLength = new Uint8Array(4);
  new DataView(ecdhLength.buffer).setUint32(
    0,
    credentials.ecdhPublicKey.length,
    false,
  );
  builder.append(ecdhLength);
  builder.append(credentials.ecdhPublicKey);

  // Serialize timestamp (8 bytes)
  const timestampBytes = new Uint8Array(8);
  new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp), false);
  builder.append(timestampBytes);

  // Create and serialize announce signature
  const signingMessage = createAnnounceSigningMessage(
    credentials.verificationKey,
    credentials.pseudonym,
    timestamp,
  );
  const signingMaterial = new SignatureMaterial(
    credentials.verificationKey,
    signingKey,
  );
  const announceSignature = signingMaterial.sign(signingMessage);

  const announceSigLength = new Uint8Array(4);
  new DataView(announceSigLength.buffer).setUint32(
    0,
    announceSignature.length,
    false,
  );
  builder.append(announceSigLength);
  builder.append(announceSignature);

  return builder.build();
}

/**
 * Deserialize binary data to AnnouncePayload
 */
export function deserializeAnnouncePayload(data: Uint8Array): AnnouncePayload {
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  // Deserialize verificationKey
  const vkLength = view.getUint32(offset, false);
  offset += 4;
  const verificationKey = data.slice(offset, offset + vkLength);
  offset += vkLength;

  // Deserialize pseudonym
  const pseudonymLength = view.getUint32(offset, false);
  offset += 4;
  const pseudonymBytes = data.slice(offset, offset + pseudonymLength);
  const pseudonym = decoder.decode(pseudonymBytes);
  offset += pseudonymLength;

  // Deserialize credential signature
  const sigLength = view.getUint32(offset, false);
  offset += 4;
  const signature = data.slice(offset, offset + sigLength);
  offset += sigLength;

  // Deserialize ecdhPublicKey
  const ecdhLength = view.getUint32(offset, false);
  offset += 4;
  const ecdhPublicKey = data.slice(offset, offset + ecdhLength);
  offset += ecdhLength;

  // Deserialize timestamp
  const timestamp = Number(view.getBigUint64(offset, false));
  offset += 8;

  // Deserialize announceSignature
  const announceSigLength = view.getUint32(offset, false);
  offset += 4;
  const announceSignature = data.slice(offset, offset + announceSigLength);

  return {
    credentials: {
      verificationKey,
      pseudonym,
      signature,
      ecdhPublicKey,
    },
    timestamp,
    announceSignature,
  };
}

/**
 * Serialize credentials to binary format for announce packets
 * @deprecated Use serializeAnnouncePayload instead for secure announce packets
 * Format:
 * - 4 bytes: verificationKey length (uint32)
 * - N bytes: verificationKey
 * - 4 bytes: pseudonym length (uint32)
 * - M bytes: pseudonym (UTF-8 encoded)
 * - 4 bytes: signature length (uint32)
 * - K bytes: signature
 * - 4 bytes: ecdhPublicKey length (uint32)
 * - L bytes: ecdhPublicKey
 */
export function serializeCredentials(credentials: Credentials): Uint8Array {
  const builder = new ByteArrayBuilder();
  const encoder = new TextEncoder();

  // Serialize verificationKey
  const vkLength = new Uint8Array(4);
  new DataView(vkLength.buffer).setUint32(
    0,
    credentials.verificationKey.length,
    false,
  );
  builder.append(vkLength);
  builder.append(credentials.verificationKey);

  // Serialize pseudonym (UTF-8 encoded)
  const pseudonymBytes = encoder.encode(credentials.pseudonym);
  const pseudonymLength = new Uint8Array(4);
  new DataView(pseudonymLength.buffer).setUint32(
    0,
    pseudonymBytes.length,
    false,
  );
  builder.append(pseudonymLength);
  builder.append(pseudonymBytes);

  // Serialize signature
  const sigLength = new Uint8Array(4);
  new DataView(sigLength.buffer).setUint32(
    0,
    credentials.signature.length,
    false,
  );
  builder.append(sigLength);
  builder.append(credentials.signature);

  // Serialize ecdhPublicKey
  const ecdhLength = new Uint8Array(4);
  new DataView(ecdhLength.buffer).setUint32(
    0,
    credentials.ecdhPublicKey.length,
    false,
  );
  builder.append(ecdhLength);
  builder.append(credentials.ecdhPublicKey);

  return builder.build();
}

/**
 * Deserialize binary data to Credentials
 * @deprecated Use deserializeAnnouncePayload instead for secure announce packets
 */
export function deserializeCredentials(data: Uint8Array): Credentials {
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  // Deserialize verificationKey
  const vkLength = view.getUint32(offset, false);
  offset += 4;
  const verificationKey = data.slice(offset, offset + vkLength);
  offset += vkLength;

  // Deserialize pseudonym
  const pseudonymLength = view.getUint32(offset, false);
  offset += 4;
  const pseudonymBytes = data.slice(offset, offset + pseudonymLength);
  const pseudonym = decoder.decode(pseudonymBytes);
  offset += pseudonymLength;

  // Deserialize signature
  const sigLength = view.getUint32(offset, false);
  offset += 4;
  const signature = data.slice(offset, offset + sigLength);
  offset += sigLength;

  // Deserialize ecdhPublicKey
  const ecdhLength = view.getUint32(offset, false);
  offset += 4;
  const ecdhPublicKey = data.slice(offset, offset + ecdhLength);

  return {
    verificationKey,
    pseudonym,
    signature,
    ecdhPublicKey,
  };
}

export interface EncryptedMessage {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  messageCounter: number;
}

/**
 * Serialize an UpdateMessage to bytes
 * Format:
 * - 4 bytes: ciphertext length (uint32)
 * - N bytes: ciphertext
 * - 4 bytes: nonce length (uint32)
 * - M bytes: nonce
 */
export function serializeUpdateMessage(
  updateMessage: UpdateMessage,
): Uint8Array {
  const builder = new ByteArrayBuilder();

  // Serialize ciphertext
  const ciphertextLength = new Uint8Array(4);
  new DataView(ciphertextLength.buffer).setUint32(
    0,
    updateMessage.ciphertext.length,
    false,
  );
  builder.append(ciphertextLength);
  builder.append(updateMessage.ciphertext);

  // Serialize nonce
  const nonceLength = new Uint8Array(4);
  new DataView(nonceLength.buffer).setUint32(
    0,
    updateMessage.nonce.length,
    false,
  );
  builder.append(nonceLength);
  builder.append(updateMessage.nonce);

  return builder.build();
}

/**
 * Deserialize bytes to an UpdateMessage
 */
export function deserializeUpdateMessage(data: Uint8Array): UpdateMessage {
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Deserialize ciphertext
  const ciphertextLength = view.getUint32(offset, false);
  offset += 4;
  const ciphertext = data.slice(offset, offset + ciphertextLength);
  offset += ciphertextLength;

  // Deserialize nonce
  const nonceLength = view.getUint32(offset, false);
  offset += 4;
  const nonce = data.slice(offset, offset + nonceLength);

  return {
    ciphertext,
    nonce,
  };
}

/**
 * Serialize an EncryptedMessage to bytes
 * Format:
 * - 4 bytes: ciphertext length (uint32)
 * - N bytes: ciphertext
 * - 4 bytes: nonce length (uint32)
 * - M bytes: nonce
 * - 8 bytes: message counter (uint64)
 */
export function serializeEncryptedMessage(
  message: EncryptedMessage,
): Uint8Array {
  const builder = new ByteArrayBuilder();

  // Serialize ciphertext
  const ciphertextLength = new Uint8Array(4);
  new DataView(ciphertextLength.buffer).setUint32(
    0,
    message.ciphertext.length,
    false,
  );
  builder.append(ciphertextLength);
  builder.append(message.ciphertext);

  // Serialize nonce
  const nonceLength = new Uint8Array(4);
  new DataView(nonceLength.buffer).setUint32(0, message.nonce.length, false);
  builder.append(nonceLength);
  builder.append(message.nonce);

  // Serialize message counter (8 bytes for uint64)
  const counterBytes = new Uint8Array(8);
  const counterView = new DataView(counterBytes.buffer);
  // Split 64-bit counter into two 32-bit parts (high and low)
  const high = Math.floor(message.messageCounter / 0x100000000);
  const low = message.messageCounter >>> 0;
  counterView.setUint32(0, high, false);
  counterView.setUint32(4, low, false);
  builder.append(counterBytes);

  return builder.build();
}

/**
 * Deserialize bytes to an EncryptedMessage
 */
export function deserializeEncryptedMessage(
  data: Uint8Array,
): EncryptedMessage {
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Deserialize ciphertext
  const ciphertextLength = view.getUint32(offset, false);
  offset += 4;
  const ciphertext = data.slice(offset, offset + ciphertextLength);
  offset += ciphertextLength;

  // Deserialize nonce
  const nonceLength = view.getUint32(offset, false);
  offset += 4;
  const nonce = data.slice(offset, offset + nonceLength);
  offset += nonceLength;

  // Deserialize message counter (8 bytes)
  const high = view.getUint32(offset, false);
  const low = view.getUint32(offset + 4, false);
  const messageCounter = high * 0x100000000 + low;

  return {
    ciphertext,
    nonce,
    messageCounter,
  };
}

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

/**
 * Serialize a WelcomeMessage to bytes
 * Format:
 * - 4 bytes: key length (uint32)
 * - N bytes: key
 * - 4 bytes: ciphertext length (uint32)
 * - M bytes: ciphertext
 * - 4 bytes: nonce length (uint32)
 * - K bytes: nonce
 */
export function serializeWelcomeMessage(
  welcomeMessage: WelcomeMessage,
): Uint8Array {
  const builder = new ByteArrayBuilder();

  // Serialize key
  const keyLength = new Uint8Array(4);
  new DataView(keyLength.buffer).setUint32(0, welcomeMessage.key.length, false);
  builder.append(keyLength);
  builder.append(welcomeMessage.key);

  // Serialize updateMessage.ciphertext
  const ciphertextLength = new Uint8Array(4);
  new DataView(ciphertextLength.buffer).setUint32(
    0,
    welcomeMessage.updateMessage.ciphertext.length,
    false,
  );
  builder.append(ciphertextLength);
  builder.append(welcomeMessage.updateMessage.ciphertext);

  // Serialize updateMessage.nonce
  const nonceLength = new Uint8Array(4);
  new DataView(nonceLength.buffer).setUint32(
    0,
    welcomeMessage.updateMessage.nonce.length,
    false,
  );
  builder.append(nonceLength);
  builder.append(welcomeMessage.updateMessage.nonce);

  // Serialize groupPseudonym.cipherText
  const groupCipherTextLength = new Uint8Array(4);
  new DataView(groupCipherTextLength.buffer).setUint32(
    0,
    welcomeMessage.groupPseudonym.cipherText.length,
    false,
  );
  builder.append(groupCipherTextLength);
  builder.append(welcomeMessage.groupPseudonym.cipherText);

  // Serialize groupPseudonym.nonce
  const groupNonceLength = new Uint8Array(4);
  new DataView(groupNonceLength.buffer).setUint32(
    0,
    welcomeMessage.groupPseudonym.nonce.length,
    false,
  );
  builder.append(groupNonceLength);
  builder.append(welcomeMessage.groupPseudonym.nonce);

  return builder.build();
}

/**
 * Deserialize bytes to a WelcomeMessage
 */
export function deserializeWelcomeMessage(data: Uint8Array): WelcomeMessage {
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Deserialize key
  const keyLength = view.getUint32(offset, false);
  offset += 4;
  const key = data.slice(offset, offset + keyLength);
  offset += keyLength;

  // Deserialize updateMessage.ciphertext
  const ciphertextLength = view.getUint32(offset, false);
  offset += 4;
  const ciphertext = data.slice(offset, offset + ciphertextLength);
  offset += ciphertextLength;

  // Deserialize updateMessage.nonce
  const nonceLength = view.getUint32(offset, false);
  offset += 4;
  const nonce = data.slice(offset, offset + nonceLength);
  offset += nonceLength;

  // Deserialize groupPseudonym.cipherText
  const groupCipherTextLength = view.getUint32(offset, false);
  offset += 4;
  const groupCipherText = data.slice(offset, offset + groupCipherTextLength);
  offset += groupCipherTextLength;

  // Deserialize groupPseudonym.nonce
  const groupNonceLength = view.getUint32(offset, false);
  offset += 4;
  const groupNonce = data.slice(offset, offset + groupNonceLength);

  return {
    key,
    updateMessage: {
      ciphertext,
      nonce,
    },
    groupPseudonym: {
      cipherText: groupCipherText,
      nonce: groupNonce,
    },
  };
}
