import Constants from "expo-constants";

import { BitchatPacket, FragmentType, PacketType } from "@/types/global";
import { Base64String } from "@/utils/Base64String";
import { getRandomBytes } from "expo-crypto";

const fragmentPayload = (
  data: Uint8Array,
  fragmentType: FragmentType,
): { fragmentId: Base64String; fragments: BitchatPacket[] } => {
  // create a random 8 byte fragment id
  const fragmentId = getRandomBytes(8);

  let fragmentSize;

  if (Constants.expoConfig?.extra) {
    fragmentSize = Constants.expoConfig?.extra.ble.defaultFragmentSizeBytes;
  } else {
    fragmentSize = 50;
  }

  // Fragment payload structure:
  // - Fragment ID: 8 bytes
  // - Fragment type: 1 byte
  // - Fragment index: 2 bytes (big-endian)
  // - Total fragments: 2 bytes (big-endian)
  // - Fragment data: remaining bytes (up to fragmentSize)
  const fragmentHeaderSize = 13; // 8 (id) + 1 (type) + 2 (index) + 2 (total)
  const dataPerFragment = fragmentSize - fragmentHeaderSize;

  if (dataPerFragment <= 0) {
    throw new Error(
      `Fragment size too small. Must be > ${fragmentHeaderSize} bytes`,
    );
  }

  // Calculate total number of fragments needed
  const totalFragments = Math.ceil(data.length / dataPerFragment);

  if (totalFragments > 65535) {
    throw new Error(
      `Message too large to fragment. Would require ${totalFragments} fragments (max 65535)`,
    );
  }

  const fragments: BitchatPacket[] = [];

  for (let i = 0; i < totalFragments; i++) {
    // Calculate data slice for this fragment
    const start = i * dataPerFragment;
    const end = Math.min(start + dataPerFragment, data.length);
    const fragmentData = data.slice(start, end);

    // Build fragment payload
    const payload = new Uint8Array(fragmentHeaderSize + fragmentData.length);
    let offset = 0;

    // Fragment ID (8 bytes)
    payload.set(fragmentId, offset);
    offset += 8;

    // Fragment type (1 byte)
    payload[offset++] = fragmentType;

    // Fragment index (2 bytes, big-endian)
    payload[offset++] = (i >> 8) & 0xff;
    payload[offset++] = i & 0xff;

    // Total fragments (2 bytes, big-endian)
    payload[offset++] = (totalFragments >> 8) & 0xff;
    payload[offset++] = totalFragments & 0xff;

    // Fragment data
    payload.set(fragmentData, offset);

    // Create packet for this fragment
    const packet: BitchatPacket = {
      version: 1,
      type: PacketType.FRAGMENT,
      timestamp: Date.now(),
      payload,
      allowedHops: 3,
    };

    fragments.push(packet);
  }

  return {
    fragmentId: Base64String.fromBytes(fragmentId),
    fragments: fragments,
  };
};

const extractFragmentMetadata = (
  packet: BitchatPacket,
): {
  fragmentId: Base64String;
  fragmentType: FragmentType;
  index: number;
  total: number;
} | null => {
  const payload = packet.payload;

  // Fragment payload structure:
  // - Fragment ID: 8 bytes
  // - Fragment type: 1 byte
  // - Fragment index: 2 bytes (big-endian)
  // - Total fragments: 2 bytes (big-endian)
  // - Fragment data: remaining bytes
  const fragmentHeaderSize = 13;

  if (payload.length < fragmentHeaderSize) {
    return null;
  }

  // Extract fragment ID (first 8 bytes)
  const fragmentIdBytes = payload.slice(0, 8);
  const fragmentId = Base64String.fromBytes(fragmentIdBytes);

  // Extract fragment type (byte 8)
  const fragmentType = payload[8] as FragmentType;

  // Extract fragment index (bytes 9-10, big-endian)
  const index = (payload[9] << 8) | payload[10];

  // Extract total fragments (bytes 11-12, big-endian)
  const total = (payload[11] << 8) | payload[12];

  return { fragmentId, fragmentType, index, total };
};

const reassembleFragments = (
  fragments: BitchatPacket[],
): AssembledData | null => {
  if (fragments.length === 0) {
    return null;
  }

  const fragmentHeaderSize = 13;

  // Sort fragments by index to ensure correct order
  const sortedFragments = [...fragments].sort((a, b) => {
    const metadataA = extractFragmentMetadata(a);
    const metadataB = extractFragmentMetadata(b);

    if (!metadataA || !metadataB) return 0;

    return metadataA.index - metadataB.index;
  });

  // Validate we have all fragments
  const metadata = extractFragmentMetadata(sortedFragments[0]);

  if (!metadata) {
    return null;
  }

  const { total } = metadata;

  if (sortedFragments.length !== total) {
    console.warn(
      `Incomplete fragments: expected ${total}, got ${sortedFragments.length}`,
    );
    return null;
  }

  // Verify all fragments have the same fragment ID
  const firstFragmentId = metadata.fragmentId.getValue();
  for (const fragment of sortedFragments) {
    const meta = extractFragmentMetadata(fragment);
    if (!meta || meta.fragmentId.getValue() !== firstFragmentId) {
      console.warn("Fragment ID mismatch");
      return null;
    }
  }

  // Calculate total payload size
  let totalSize = 0;
  for (const fragment of sortedFragments) {
    totalSize += fragment.payload.length - fragmentHeaderSize;
  }

  // Reassemble the payload
  const reassembledPayload = new Uint8Array(totalSize);
  let offset = 0;

  for (const fragment of sortedFragments) {
    // Extract fragment data (skip the 12-byte header)
    const fragmentData = fragment.payload.slice(fragmentHeaderSize);
    reassembledPayload.set(fragmentData, offset);
    offset += fragmentData.length;
  }

  return {
    data: reassembledPayload,
    fragmentType: metadata.fragmentType,
    fragmentId: metadata.fragmentId,
  };
};

interface AssembledData {
  data: Uint8Array;
  fragmentType: FragmentType;
  fragmentId: Base64String;
}

export {
  AssembledData,
  extractFragmentMetadata,
  fragmentPayload,
  reassembleFragments,
};
