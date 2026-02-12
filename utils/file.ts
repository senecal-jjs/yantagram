import { gcm } from "@noble/ciphers/aes.js";
import { getRandomBytes } from "expo-crypto";
import { File, Paths } from "expo-file-system";

type Nonce = {
  data: Uint8Array;
};

const NONCE_LENGTH = 12;

const saveToAppDirectory = async (
  data: string,
  fileName: string,
  encryptionKey: Uint8Array | null = null,
): Promise<Nonce | null> => {
  try {
    const file = new File(Paths.document, fileName);

    // Create file if it doesn't exist
    if (!file.exists) {
      file.create();
    }

    let dataToWrite = data;
    let nonce: Nonce | null = null;

    if (encryptionKey) {
      // Encrypt with AES-256-GCM
      const nonceBytes = getRandomBytes(12);
      const aes = gcm(encryptionKey, nonceBytes);
      const textEncoder = new TextEncoder();
      const ciphertext = aes.encrypt(textEncoder.encode(data));
      dataToWrite = Buffer.from(ciphertext).toString("base64");
      nonce = { data: nonceBytes };
    }

    file.write(dataToWrite);
    return nonce;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const fetchFromFile = async (
  fileName: string,
  decryptionKey: Uint8Array | null = null,
  nonce: Nonce | null = null,
): Promise<string | null> => {
  try {
    const file = new File(Paths.document, fileName);
    if (!file.exists) {
      console.warn(`File ${fileName} does not exist`);
      return null;
    }

    const fileContent = await file.text();

    if (decryptionKey && nonce) {
      // Decrypt with AES-256-GCM
      const aes = gcm(decryptionKey, nonce.data);
      const ciphertext = Buffer.from(fileContent, "base64");
      const plaintext = aes.decrypt(ciphertext);
      const textDecoder = new TextDecoder();
      return textDecoder.decode(plaintext);
    }

    return fileContent;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const fileExists = (fileName: string): boolean => {
  return new File(Paths.document, fileName).exists;
};

const deleteFile = async (fileName: string): Promise<boolean> => {
  try {
    const file = new File(Paths.document, fileName);
    if (!file.exists) {
      console.warn(`File ${fileName} does not exist`);
      return false;
    }
    file.delete();
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
};

/**
 * Atomically saves encrypted data to a file with the nonce embedded.
 * Format: base64(nonce[12 bytes] + ciphertext)
 *
 * Writes to a temp file first, then atomically moves it to the final path.
 * This ensures no data loss window if the write fails partway through.
 *
 * @throws Error if the write or move fails
 */
const saveEncryptedAtomic = async (
  data: string,
  fileName: string,
  encryptionKey: Uint8Array,
): Promise<void> => {
  // Generate nonce and encrypt
  const nonceBytes = getRandomBytes(NONCE_LENGTH);
  const aes = gcm(encryptionKey, nonceBytes);
  const ciphertext = aes.encrypt(new TextEncoder().encode(data));

  // Embed nonce: base64(nonce || ciphertext)
  const combined = new Uint8Array(NONCE_LENGTH + ciphertext.length);
  combined.set(nonceBytes, 0);
  combined.set(ciphertext, NONCE_LENGTH);

  const dataToWrite = Buffer.from(combined).toString("base64");

  const tmpFileName = `${fileName}.tmp`;
  const tmpFile = new File(Paths.document, tmpFileName);
  const finalFile = new File(Paths.document, fileName);

  // Clean up any leftover tmp file from a previous interrupted write
  if (tmpFile.exists) {
    tmpFile.delete();
  }

  // Write to temp file
  tmpFile.create();
  tmpFile.write(dataToWrite);

  // Atomic swap: delete old, move new (minimal gap — move is a single rename syscall)
  if (finalFile.exists) {
    finalFile.delete();
  }
  tmpFile.move(finalFile);
};

/**
 * Reads and decrypts a file with an embedded nonce.
 * Format: base64(nonce[12 bytes] + ciphertext)
 *
 * @throws Error if the file doesn't exist, can't be read, or decryption fails
 */
const fetchEncryptedFromFile = async (
  fileName: string,
  decryptionKey: Uint8Array,
): Promise<string> => {
  const file = new File(Paths.document, fileName);
  if (!file.exists) {
    throw new Error(`Encrypted file ${fileName} does not exist`);
  }

  const fileContent = await file.text();
  const combined = Buffer.from(fileContent, "base64");

  if (combined.length <= NONCE_LENGTH) {
    throw new Error(`Encrypted file ${fileName} is corrupted or too short`);
  }

  const nonce = combined.subarray(0, NONCE_LENGTH);
  const ciphertext = combined.subarray(NONCE_LENGTH);

  const aes = gcm(decryptionKey, nonce);
  const plaintext = aes.decrypt(ciphertext);
  return new TextDecoder().decode(plaintext);
};

/**
 * Recovers from an interrupted atomic write by moving the temp file to the final path.
 * If both tmp and final exist, the tmp is cleaned up (final is authoritative).
 *
 * @returns true if recovery was performed (tmp moved to final)
 */
const recoverTmpFile = (fileName: string): boolean => {
  const tmpFile = new File(Paths.document, `${fileName}.tmp`);
  if (!tmpFile.exists) return false;

  const finalFile = new File(Paths.document, fileName);
  if (finalFile.exists) {
    // Both exist — final is authoritative, clean up stale tmp
    tmpFile.delete();
    return false;
  }

  // Tmp exists but final doesn't — interrupted during atomic swap
  tmpFile.move(finalFile);
  return true;
};

export {
  deleteFile,
  fetchEncryptedFromFile,
  fetchFromFile,
  fileExists,
  recoverTmpFile,
  saveEncryptedAtomic,
  saveToAppDirectory
};

