import { gcm } from "@noble/ciphers/aes.js";
import { getRandomBytes } from "expo-crypto";
import { File, Paths } from "expo-file-system";

type Nonce = {
  data: Uint8Array;
};

const saveToAppDirectory = async (
  data: string,
  fileName: string,
  encryptionKey: Uint8Array | null = null,
): Promise<Nonce | null> => {
  try {
    if (new File(Paths.cache, fileName).exists) return null;
    const file = new File(Paths.cache, fileName);
    file.create(); // can throw an error if the file already exists or no permission to create it

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
    const file = new File(Paths.cache, fileName);
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
  return new File(Paths.cache, fileName).exists;
};

const deleteFile = async (fileName: string): Promise<boolean> => {
  try {
    const file = new File(Paths.cache, fileName);
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

export { deleteFile, fetchFromFile, fileExists, saveToAppDirectory };
