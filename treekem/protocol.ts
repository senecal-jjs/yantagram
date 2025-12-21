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
