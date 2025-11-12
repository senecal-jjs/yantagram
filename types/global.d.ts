// Represents a user visible message in the BitChat system.
// Handles both broadcast messages and private encrypted messages,
// with support for re;ies, and delivery tracking
// - Note this is the primary data model for chat messages
type Message = {
    id: string
    sender: string,
    contents: string,
    timestamp: number,
    isRelay: boolean,
    originalSender: string?,
    isPrivate: boolean,
    recipientNickname: string?,
    senderPeerId: string?,
}

type Conversation = {
    id: string
    name: string
    lastMessage: string
    timestamp: string
}

enum DeliveryStatus {
    SENDING,
    SENT,      // left our device
    DELIVERED, // confirmed by recipient
    READ,      // seen by recipient
    FAILED,
}

enum PacketType {
    ANNOUNCE, // "I'm here" with nickname
    MESSAGE,  // Public chat message
    LEAVE,    // "I'm leaving" 

    NOISE_HANDSHAKE, // Handshake (init or response determined by payload)
    NOISE_ENCRYPTED, // All encrypted payloads ( messages, receipts, etc.)

    FRAGMENT,      // Single fragment type for large messages
    FILE_TRANSFER  // Binary file/audio/image payloads
}

// The core packet structure for all BitChat protocol messages.
// Encapsulates all data needed for routing through the mesh network,
// including allowedHops for hop limiting and optional encryption.
// Note: Packets larger than BLE MTU (512 bytes) are automatically fragmented
type BitchatPacket = {
    version: number,
    type: PacketType,
    senderId: string,
    recipientId: string,
    timestamp: number,
    payload: Uint8Array,
    signature: string?,
    allowedHops: number,
    route: Uint8Array,
}
