import { BitchatPacket } from "@/types/global";

const fragmentPacket = (
  packet: BitchatPacket,
  maxChunkSize: number | null,
): BitchatPacket[] => {
  // create a random 8 byte fragment id
  const fragmentId = new Uint8Array(8).map(() =>
    Math.floor(Math.random() * 256),
  );
  return [];
};
