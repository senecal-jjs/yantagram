import * as Crypto from "expo-crypto";

async function getRandomBytes(size: number): Promise<Uint8Array> {
  return await Crypto.getRandomBytesAsync(size);
}

export { getRandomBytes };
