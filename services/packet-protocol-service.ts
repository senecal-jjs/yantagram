import { BitchatPacket } from "@/types/global";
import * as CompressionUtil from "./compression-service";
import { MessagePadding } from "./padding-service";

const lengthFieldBytes = 4;

const flags = {
  isCompressed: 0x01,
};

// Encode BitchatPacket to binary format
const encode = (
  packet: BitchatPacket,
  padding: boolean = true,
): Uint8Array | null => {
  const version = packet.version;
  if (version !== 1) return null;

  let payload = packet.payload;
  let isCompressed = false;
  let originalPayloadSize: number | null = null;

  // Try to compress payload when beneficial
  if (CompressionUtil.shouldCompress(payload)) {
    const maxRepresentable = 0xffffffff;
    if (payload.length <= maxRepresentable) {
      const compressedPayload = CompressionUtil.compress(payload);
      if (compressedPayload) {
        originalPayloadSize = payload.length;
        payload = compressedPayload;
        isCompressed = true;
      }
    }
  }

  const originalSizeFieldBytes = isCompressed ? lengthFieldBytes : 0;
  const payloadDataSize = payload.length + originalSizeFieldBytes;

  // Check payload size limits
  if (version === 1 && payloadDataSize > 0xffffffff) return null;

  // Build the packet
  const data: number[] = [];

  // Version, type, TTL/allowedHops
  data.push(version);
  data.push(packet.type);
  data.push(packet.allowedHops);

  // Timestamp (8 bytes, big-endian)
  const timestamp = packet.timestamp;
  for (let shift = 56; shift >= 0; shift -= 8) {
    data.push((timestamp >>> shift) & 0xff);
  }

  // Flags
  let flagsByte = 0;
  if (isCompressed) flagsByte |= flags.isCompressed;
  data.push(flagsByte);

  // Payload length (4 bytes, big-endian)
  const length = payloadDataSize;
  for (let shift = 24; shift >= 0; shift -= 8) {
    data.push((length >> shift) & 0xff);
  }

  // Original size field (if compressed)
  if (isCompressed && originalPayloadSize !== null) {
    const size = originalPayloadSize;
    for (let shift = 24; shift >= 0; shift -= 8) {
      data.push((size >> shift) & 0xff);
    }
  }

  // Payload data
  data.push(...Array.from(payload));

  let result = new Uint8Array(data);

  // Apply padding if requested
  if (padding) {
    const optimalSize = MessagePadding.optimalBlockSize(result.length);
    result = new Uint8Array(MessagePadding.pad(result, optimalSize));
  }

  return result;
};

// Decode binary data to BitchatPacket
const decode = (data: Uint8Array): BitchatPacket | null => {
  // Try decode as-is first (robust when padding wasn't applied)
  const packet = decodeCore(data);
  if (packet) return packet;

  // If that fails, try after removing padding
  const unpadded = MessagePadding.unpad(data);
  if (unpadded === data) return null; // No padding was removed
  return decodeCore(unpadded);
};

// Core decoding implementation used by decode with and without padding removal
const decodeCore = (raw: Uint8Array): BitchatPacket | null => {
  const minHeaderSize = 16; // version(1) + type(1) + allowedHops(1) + timestamp(8) + flags(1) + length(4)
  if (raw.length < minHeaderSize) return null;

  let offset = 0;

  // Helper functions for reading data
  const require = (n: number): boolean => offset + n <= raw.length;

  const read8 = (): number | null => {
    if (!require(1)) return null;
    return raw[offset++];
  };

  const read32 = (): number | null => {
    if (!require(4)) return null;
    const value =
      (raw[offset] << 24) |
      (raw[offset + 1] << 16) |
      (raw[offset + 2] << 8) |
      raw[offset + 3];
    offset += 4;
    return value;
  };

  const readData = (n: number): Uint8Array | null => {
    if (!require(n)) return null;
    const data = raw.slice(offset, offset + n);
    offset += n;
    return data;
  };

  // Read version
  const version = read8();
  if (version === null || version !== 1) return null;

  // Read type and TTL/allowedHops
  const type = read8();
  const allowedHops = read8();
  if (type === null || allowedHops === null) return null;

  // Read timestamp (8 bytes, big-endian)
  let timestamp: number = 0;
  for (let i = 0; i < 8; i++) {
    const byte = read8();
    if (byte === null) return null;
    timestamp = (timestamp << 8) | byte;
  }

  // Read flags
  const flagsByte = read8();
  if (flagsByte === null) return null;

  const isCompressed = (flagsByte & flags.isCompressed) !== 0;

  // Read payload length
  let payloadLength: number;
  const len = read32();
  if (len === null) return null;
  payloadLength = len;

  if (payloadLength < 0) return null;

  let remainingPayloadBytes = payloadLength;

  // Read payload
  let payloadData: Uint8Array;
  if (isCompressed) {
    if (remainingPayloadBytes < lengthFieldBytes) return null;

    // Read original size
    let originalSize: number;
    const size = read32();
    if (size === null) return null;
    originalSize = size;
    remainingPayloadBytes -= lengthFieldBytes;

    // Security check: prevent decompression bombs
    if (originalSize < 0 || originalSize > 100 * 1024 * 1024) return null; // 100MB limit

    const compressedSize = remainingPayloadBytes;
    if (compressedSize <= 0) return null;

    const compressed = readData(compressedSize);
    if (!compressed) return null;
    remainingPayloadBytes = 0;

    // Check compression ratio for safety
    const compressionRatio = originalSize / compressedSize;
    if (compressionRatio > 50000) {
      console.warn(
        `Suspicious compression ratio: ${compressionRatio.toFixed(0)}:1`,
      );
      return null;
    }

    // Decompress payload
    const decompressed = CompressionUtil.decompress(compressed, originalSize);
    if (!decompressed || decompressed.length !== originalSize) return null;

    payloadData = decompressed;
  } else {
    if (remainingPayloadBytes < 0) return null;
    const rawPayload = readData(remainingPayloadBytes);
    if (!rawPayload) return null;
    remainingPayloadBytes = 0;
    payloadData = rawPayload;
  }

  // Verify we haven't read past the end
  if (offset > raw.length) return null;

  return {
    version,
    type,
    timestamp,
    payload: payloadData,
    allowedHops,
  };
};

export { decode, encode };

/**
 * DeliveryAck payload structure for acknowledging message delivery
 */
export interface DeliveryAck {
  messageId: string;
  senderVerificationKey: string; // hex string of who is sending the ack
  timestamp: number;
}

/**
 * DeliveryAckConfirm payload structure for confirming receipt of a delivery ACK
 */
export interface DeliveryAckConfirm {
  messageId: string;
  recipientVerificationKey: string; // hex string of who sent the original ACK
  timestamp: number;
}

/**
 * Serialize a DeliveryAck to binary format
 * Format:
 * - 1 byte: message ID length (uint8)
 * - N bytes: message ID (UTF-8 string)
 * - 1 byte: sender verification key length (uint8)
 * - M bytes: sender verification key (hex string as UTF-8)
 * - 8 bytes: timestamp (uint64, big-endian)
 */
export const serializeDeliveryAck = (ack: DeliveryAck): Uint8Array => {
  const encoder = new TextEncoder();
  const messageIdBytes = encoder.encode(ack.messageId);
  const senderKeyBytes = encoder.encode(ack.senderVerificationKey);

  if (messageIdBytes.length > 255) {
    throw new Error("Message ID too long (max 255 bytes)");
  }

  if (senderKeyBytes.length > 255) {
    throw new Error("Sender verification key too long (max 255 bytes)");
  }

  const data: number[] = [];

  // Message ID length (1 byte)
  data.push(messageIdBytes.length);

  // Message ID bytes
  data.push(...Array.from(messageIdBytes));

  // Sender verification key length (1 byte)
  data.push(senderKeyBytes.length);

  // Sender verification key bytes
  data.push(...Array.from(senderKeyBytes));

  // Timestamp (8 bytes, big-endian)
  const timestamp = ack.timestamp;
  for (let shift = 56; shift >= 0; shift -= 8) {
    data.push((timestamp >>> shift) & 0xff);
  }

  return new Uint8Array(data);
};

/**
 * Serialize a DeliveryAckConfirm to binary format
 * Format matches DeliveryAck but uses recipientVerificationKey field name.
 */
export const serializeDeliveryAckConfirm = (
  ack: DeliveryAckConfirm,
): Uint8Array => {
  const encoder = new TextEncoder();
  const messageIdBytes = encoder.encode(ack.messageId);
  const recipientKeyBytes = encoder.encode(ack.recipientVerificationKey);

  if (messageIdBytes.length > 255) {
    throw new Error("Message ID too long (max 255 bytes)");
  }

  if (recipientKeyBytes.length > 255) {
    throw new Error("Recipient verification key too long (max 255 bytes)");
  }

  const data: number[] = [];

  // Message ID length (1 byte)
  data.push(messageIdBytes.length);

  // Message ID bytes
  data.push(...Array.from(messageIdBytes));

  // Recipient verification key length (1 byte)
  data.push(recipientKeyBytes.length);

  // Recipient verification key bytes
  data.push(...Array.from(recipientKeyBytes));

  // Timestamp (8 bytes, big-endian)
  const timestamp = ack.timestamp;
  for (let shift = 56; shift >= 0; shift -= 8) {
    data.push((timestamp >>> shift) & 0xff);
  }

  return new Uint8Array(data);
};

/**
 * Deserialize binary data to DeliveryAck
 */
export const deserializeDeliveryAck = (
  data: Uint8Array,
): DeliveryAck | null => {
  if (data.length < 11) return null; // minimum: 1 + 0 + 1 + 0 + 8 bytes

  let offset = 0;

  // Read message ID length
  const messageIdLength = data[offset++];

  if (data.length < 1 + messageIdLength + 1 + 8) return null;

  // Read message ID
  const messageIdBytes = data.slice(offset, offset + messageIdLength);
  offset += messageIdLength;

  const decoder = new TextDecoder();
  const messageId = decoder.decode(messageIdBytes);

  // Read sender verification key length
  const senderKeyLength = data[offset++];

  if (data.length < 1 + messageIdLength + 1 + senderKeyLength + 8) return null;

  // Read sender verification key
  const senderKeyBytes = data.slice(offset, offset + senderKeyLength);
  offset += senderKeyLength;

  const senderVerificationKey = decoder.decode(senderKeyBytes);

  // Read timestamp (8 bytes, big-endian)
  let timestamp = 0;
  for (let i = 0; i < 8; i++) {
    timestamp = (timestamp << 8) | data[offset++];
  }

  return { messageId, senderVerificationKey, timestamp };
};

/**
 * Deserialize binary data to DeliveryAckConfirm
 */
export const deserializeDeliveryAckConfirm = (
  data: Uint8Array,
): DeliveryAckConfirm | null => {
  if (data.length < 11) return null; // minimum: 1 + 0 + 1 + 0 + 8 bytes

  let offset = 0;

  // Read message ID length
  const messageIdLength = data[offset++];

  if (data.length < 1 + messageIdLength + 1 + 8) return null;

  // Read message ID
  const messageIdBytes = data.slice(offset, offset + messageIdLength);
  offset += messageIdLength;

  const decoder = new TextDecoder();
  const messageId = decoder.decode(messageIdBytes);

  // Read recipient verification key length
  const recipientKeyLength = data[offset++];

  if (data.length < 1 + messageIdLength + 1 + recipientKeyLength + 8)
    return null;

  // Read recipient verification key
  const recipientKeyBytes = data.slice(offset, offset + recipientKeyLength);
  offset += recipientKeyLength;

  const recipientVerificationKey = decoder.decode(recipientKeyBytes);

  // Read timestamp (8 bytes, big-endian)
  let timestamp = 0;
  for (let i = 0; i < 8; i++) {
    timestamp = (timestamp << 8) | data[offset++];
  }

  return { messageId, recipientVerificationKey, timestamp };
};
