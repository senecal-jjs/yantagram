enum DeliveryStatus {
  SENDING,
  SENT, // left our device
  DELIVERED, // confirmed by recipient
  READ, // seen by recipient
  FAILED,
}

enum Result {
  SUCCESS,
  FAILURE,
}

enum PacketType {
  AMIGO_WELCOME,
  AMIGO_PATH_UPDATE,
  ANNOUNCE, // "I'm here" with nickname
  MESSAGE, // Public chat message
  LEAVE, // "I'm leaving"

  NOISE_HANDSHAKE, // Handshake (init or response determined by payload)
  NOISE_ENCRYPTED, // All encrypted payloads ( messages, receipts, etc.)

  FRAGMENT, // Single fragment type for large messages
  FILE_TRANSFER, // Binary file/audio/image payloads

  DELIVERY_ACK, // acknowledge delivery of a message to intended recipient
  READ_RECEIPT,
}

enum FragmentType {
  AMIGO_WELCOME,
  AMIGO_PATH_UPDATE,
  MESSAGE, // Chat message
}

// Represents a user visible message in the BitChat system.
// Handles both broadcast messages and private encrypted messages,
// with support for retries, and delivery tracking
// - Note this is the primary data model for chat messages
type Message = {
  id: string;
  groupId: string;
  sender: string;
  contents: string;
  timestamp: number;
};

type MessageWithPseudonym = {
  message: Message;
  pseudonym: string;
};

// The core packet structure for all BitChat protocol messages.
// Encapsulates all data needed for routing through the mesh network,
// including allowedHops for hop limiting and optional encryption.
// Note: Packets larger than BLE MTU (512 bytes) are automatically fragmented
type BitchatPacket = {
  version: number;
  type: PacketType;
  timestamp: number;
  payload: Uint8Array;
  allowedHops: number;
};

export {
  BitchatPacket,
  DeliveryStatus,
  FragmentType,
  Message,
  MessageWithPseudonym,
  PacketType,
  Result
};

