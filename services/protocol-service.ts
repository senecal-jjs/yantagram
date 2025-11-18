/// ## Protocol Design
/// The protocol uses a compact binary format to minimize overhead:
/// - 1-byte message type identifier
/// - Variable-length fields with length prefixes
/// - Network byte order (big-endian) for multi-byte values
/// - PKCS#7-style padding for privacy
///
/// ## Message Flow
/// 1. **Creation**: Messages are created with type, content, and metadata
/// 2. **Encoding**: Converted to binary format with proper field ordering
/// 3. **Fragmentation**: Split if larger than BLE MTU (512 bytes)
/// 4. **Transmission**: Sent via BLEService
/// 5. **Routing**: Relayed by intermediate nodes (TTL decrements)
/// 6. **Reassembly**: Fragments collected and reassembled
/// 7. **Decoding**: Binary data parsed back to message objects
///
/// ## Security Considerations
/// - Message padding obscures actual content length
/// - Timing obfuscation prevents traffic analysis
/// - Integration with Noise Protocol for E2E encryption
/// - No persistent identifiers in protocol headers
///
/// ## Message Types
/// - **Announce/Leave**: Peer presence notifications
/// - **Message**: User chat messages (broadcast or directed)
/// - **Fragment**: Multi-part message handling
/// - **Delivery/Read**: Message acknowledgments
/// - **Noise**: Encrypted channel establishment
/// - **Version**: Protocol version negotiation
///
/// ## Future Extensions
/// The protocol is designed to be extensible:
/// - Reserved message type ranges for future use
/// - Version field for protocol evolution
/// - Optional fields for new features
///

import { DeliveryStatus, Message } from "@/types/global";
import ByteArrayBuilder from "@/utils/ByteArrayBuilder";

// Message format:
// - Flags: 1 byte (bit 0: isRelay, bit 1: isPrivate, bit 2: hasOriginalSender, bit 3: hasRecipientNickname, bit 4: hasSenderPeerID, bit 5: hasMentions)
// - Timestamp: 8 bytes (milliseconds since epoch)
// - ID length: 1 byte
// - ID: variable
// - Sender length: 1 byte
// - Sender: variable
// - Content length: 2 bytes
// - Content: variable
// Optional fields based on flags:
// - Original sender length + data
// - Recipient nickname length + data
// - Sender peer ID length + data
// - Mentions array
const toBinaryPayload = (message: Message): Uint8Array | null => {
  const buffer = new ByteArrayBuilder();
  let flags = 0;

  // Set flags based on message properties
  if (message.isRelay) flags |= 0x01;
  if (message.isPrivate) flags |= 0x02;
  if (message.originalSender) flags |= 0x04;
  if (message.recipientNickname) flags |= 0x08;
  if (message.senderPeerId) flags |= 0x10;
  // Note: mentions not implemented in Message type yet, but flag reserved
  // if (message.mentions && message.mentions.length > 0) flags |= 0x20

  // Append flags
  buffer.append(new Uint8Array([flags]));

  // Timestamp (in milliseconds) - 8 bytes big-endian
  const timestampMs = BigInt(message.timestamp);
  buffer.append(encodeTimestampAsBigEndian(Number(timestampMs)));

  const textEncoder = new TextEncoder();

  // ID field
  const encodedId = textEncoder.encode(message.id);
  buffer.append(new Uint8Array([Math.min(encodedId.length, 255)]));
  buffer.append(encodedId.subarray(0, 255));

  // Sender field
  const encodedSender = textEncoder.encode(message.sender);
  buffer.append(new Uint8Array([Math.min(encodedSender.length, 255)]));
  buffer.append(encodedSender.subarray(0, 255));

  // Content field - 2 bytes length + data
  const encodedContent = textEncoder.encode(message.contents);
  const contentLength = Math.min(encodedContent.length, 65535);
  // Encode length as 2 bytes, big-endian
  buffer.append(new Uint8Array([(contentLength >> 8) & 0xff]));
  buffer.append(new Uint8Array([contentLength & 0xff]));
  buffer.append(encodedContent.subarray(0, contentLength));

  // Optional fields based on flags

  // Original sender (if flag bit 2 is set)
  if (message.originalSender) {
    const encodedOriginalSender = textEncoder.encode(message.originalSender);
    buffer.append(
      new Uint8Array([Math.min(encodedOriginalSender.length, 255)]),
    );
    buffer.append(encodedOriginalSender.subarray(0, 255));
  }

  // Recipient nickname (if flag bit 3 is set)
  if (message.recipientNickname != null) {
    const encodedRecipientNickname = textEncoder.encode(
      message.recipientNickname,
    );
    buffer.append(
      new Uint8Array([Math.min(encodedRecipientNickname.length, 255)]),
    );
    buffer.append(encodedRecipientNickname.subarray(0, 255));
  }

  // Sender peer ID (if flag bit 4 is set)
  if (message.senderPeerId != null) {
    const encodedSenderPeerId = textEncoder.encode(message.senderPeerId);
    buffer.append(new Uint8Array([Math.min(encodedSenderPeerId.length, 255)]));
    buffer.append(encodedSenderPeerId.subarray(0, 255));
  }

  // Mentions array (if flag bit 5 is set) - not implemented in Message type yet
  // This is a placeholder for future implementation
  /*
    if (message.mentions && message.mentions.length > 0) {
        buffer.append(new Uint8Array([Math.min(message.mentions.length, 255)]))
        for (let i = 0; i < Math.min(message.mentions.length, 255); i++) {
            const encodedMention = textEncoder.encode(message.mentions[i])
            buffer.append(new Uint8Array([Math.min(encodedMention.length, 255)]))
            buffer.append(encodedMention.subarray(0, 255))
        }
    }
    */

  return buffer.build();
};

const fromBinaryPayload = (data: Uint8Array): Message => {
  // Create a copy to prevent modification issues
  const dataCopy = new Uint8Array(data);

  // Minimum required size: flags(1) + timestamp(8) + id_len(1) + sender_len(1) + content_len(2) = 13 bytes
  if (dataCopy.length < 13) {
    throw Error(
      `Could not convert to Message from binary payload. Data does not meet minimum size. [minSize: 13, binarySize: ${dataCopy.length}]`,
    );
  }

  let offset = 0;

  // Parse flags
  if (offset >= dataCopy.length) throw Error("Offset exceed data length.");
  const flags = dataCopy[offset++];
  const isRelay = (flags & 0x01) !== 0;
  const isPrivate = (flags & 0x02) !== 0;
  const hasOriginalSender = (flags & 0x04) !== 0;
  const hasRecipientNickname = (flags & 0x08) !== 0;
  const hasSenderPeerId = (flags & 0x10) !== 0;
  const hasMentions = (flags & 0x20) !== 0;

  // Parse timestamp (8 bytes big-endian)
  if (offset + 8 > dataCopy.length) throw Error("Offset exceed data length.");
  const timestampData = dataCopy.slice(offset, offset + 8);
  let timestampMillis = 0;
  for (let i = 0; i < 8; i++) {
    timestampMillis = timestampMillis * 256 + timestampData[i];
  }
  offset += 8;
  const timestamp = timestampMillis;

  // Parse ID
  if (offset >= dataCopy.length) throw Error("Offset exceed data length.");
  const idLength = dataCopy[offset++];
  if (offset + idLength > dataCopy.length)
    throw Error("Offset exceed data length.");
  const textDecoder = new TextDecoder("utf-8");
  const id =
    textDecoder.decode(dataCopy.slice(offset, offset + idLength)) ||
    crypto.randomUUID();
  offset += idLength;

  // Parse sender
  if (offset >= dataCopy.length) throw Error("Offset exceed data length.");
  const senderLength = dataCopy[offset++];
  if (offset + senderLength > dataCopy.length)
    throw Error("Offset exceed data length.");
  const sender =
    textDecoder.decode(dataCopy.slice(offset, offset + senderLength)) ||
    "unknown";
  offset += senderLength;

  // Parse content (2-byte length + data)
  if (offset + 2 > dataCopy.length) throw Error("Offset exceed data length.");
  const contentLengthHigh = dataCopy[offset++];
  const contentLengthLow = dataCopy[offset++];
  const contentLength = (contentLengthHigh << 8) | contentLengthLow;
  if (offset + contentLength > dataCopy.length)
    throw Error("Offset exceed data length.");
  const contents =
    textDecoder.decode(dataCopy.slice(offset, offset + contentLength)) || "";
  offset += contentLength;

  // Parse optional fields based on flags
  let originalSender: string | null = null;
  if (hasOriginalSender && offset < dataCopy.length) {
    const length = dataCopy[offset++];
    if (offset + length <= dataCopy.length) {
      originalSender =
        textDecoder.decode(dataCopy.slice(offset, offset + length)) || null;
      offset += length;
    }
  }

  let recipientNickname: string | null = null;
  if (hasRecipientNickname && offset < dataCopy.length) {
    const length = dataCopy[offset++];
    if (offset + length <= dataCopy.length) {
      recipientNickname =
        textDecoder.decode(dataCopy.slice(offset, offset + length)) || null;
      offset += length;
    }
  }

  let senderPeerId: string | null = null;
  if (hasSenderPeerId && offset < dataCopy.length) {
    const length = dataCopy[offset++];
    if (offset + length <= dataCopy.length) {
      senderPeerId =
        textDecoder.decode(dataCopy.slice(offset, offset + length)) || null;
      offset += length;
    }
  }

  // Parse mentions array (reserved for future use)
  // Note: mentions not implemented in Message type yet, but parsing logic ready
  /*
    let mentions: string[] | null = null
    if (hasMentions && offset < dataCopy.length) {
        const mentionCount = dataCopy[offset++]
        if (mentionCount > 0) {
            mentions = []
            for (let i = 0; i < mentionCount; i++) {
                if (offset < dataCopy.length) {
                    const length = dataCopy[offset++]
                    if (offset + length <= dataCopy.length) {
                        const mention = textDecoder.decode(dataCopy.slice(offset, offset + length))
                        if (mention) {
                            mentions.push(mention)
                        }
                        offset += length
                    }
                }
            }
        }
    }
    */

  // Create and return the Message object
  const deliveryStatus = isPrivate ? DeliveryStatus.SENDING : null;

  const message: Message = {
    id,
    sender,
    contents,
    timestamp,
    isRelay,
    originalSender,
    isPrivate,
    recipientNickname,
    senderPeerId,
    deliveryStatus,
  };

  return message;
};

export { fromBinaryPayload, toBinaryPayload };

function encodeTimestampAsBigEndian(timestampMs: number): Uint8Array {
  // Use BigInt to safely represent the full timestamp value,
  // which can exceed JavaScript's maximum safe integer.
  const timestampBigInt = BigInt(timestampMs);

  // Create an 8-byte (64-bit) ArrayBuffer.
  const buffer = new ArrayBuffer(8);

  // Create a DataView to write the BigInt to the buffer.
  const view = new DataView(buffer);

  // Write the 64-bit BigInt at the start of the buffer (byte offset 0).
  // The third argument, `false`, specifies big-endian byte order.
  view.setBigInt64(0, timestampBigInt, false);

  // Return the buffer as a Uint8Array.
  return new Uint8Array(buffer);
}
