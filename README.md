# BitChat - React Native Client

A secure, decentralized messaging application built with React Native and Expo, featuring end-to-end encryption using the Noise Protocol and TreeKEM for group key management.

## Overview

BitChat is a privacy-focused messaging app that uses state-of-the-art cryptographic protocols to ensure secure communication. The app implements:

- **Noise Protocol XX** for secure 1-1 transport layer encryption
- **TreeKEM** for efficient group key management with forward secrecy and post-compromise security
- **X25519 ECDH** for key agreement (replacing RSA for better performance)
- **Ed25519** signatures for authentication
- **Ristretto255** for UPKE (Updatable Public Key Encryption)
- **AES-256-GCM** for AEAD encryption
- **QR code-based credential exchange** for easy contact sharing

All cryptographic operations use pure JavaScript implementations from the [@noble](https://github.com/paulmillr/noble-curves) suite, eliminating native module dependencies.

## Features

### Cryptography
- **Pure JS Crypto**: All cryptographic operations run in JavaScript using @noble libraries
- **No Native Dependencies**: Eliminates platform-specific crypto modules
- **Small Key Sizes**: 32-byte EC keys vs 256+ byte RSA keys
- **Forward Secrecy**: Message counter ratcheting prevents decryption of old messages
- **Post-Compromise Security**: Key refresh operations heal from key compromise

### Messaging
- Secure 1-1 and group messaging
- Message fragmentation for large payloads
- Delivery status tracking
- Persistent message storage with SQLite

### Contact Management
- QR code-based credential sharing
- Automatic contact deduplication
- Persistent contact storage
- Camera-based QR scanning with permission handling

### User Experience
- Random pseudonym generation (30,625 unique combinations)
- Dark theme UI
- Tab-based navigation
- **Settings Management**: Comprehensive settings system with persistent storage
- **Message Retention Control**: Configurable message auto-deletion (10 minutes to 5 days)
- **User Profile Management**: Easy pseudonym updates with real-time saving
- **Security Information**: Detailed privacy and security feature explanations
- **Panic Mode**: Triple-tap panic button for instant message deletion
- **Data Management**: Selective deletion of messages or complete app data reset
- **Settings Management**: Comprehensive settings system with persistent storage
- **Message Retention Control**: Configurable message auto-deletion (10 minutes to 5 days)
- **User Profile Management**: Easy pseudonym updates with real-time saving
- **Security Information**: Detailed privacy and security feature explanations
- **Panic Mode**: Triple-tap panic button for instant message deletion
- **Data Management**: Selective deletion of messages or complete app data reset

## Architecture

### Directory Structure

```
app/                      # Expo Router file-based routing
  (tabs)/                 # Tab navigation
    index.tsx            # Chats list screen (with panic button)
    chats/[chatId].tsx   # Individual chat screen
  (settings-modal)/       # Settings modal screens
    start-settings.tsx   # Main settings screen
    my-info.tsx         # User profile management
    security-privacy.tsx # Security information
    message-retention.tsx # Message retention settings
  (settings-modal)/       # Settings modal screens
    start-settings.tsx   # Main settings screen
    my-info.tsx         # User profile management
    security-privacy.tsx # Security information
    message-retention.tsx # Message retention settings
  _layout.tsx            # Root layout with credential initialization
  modal.tsx              # Modal screens

components/              # Reusable UI components
  chat-bubble.tsx        # Message display
  conversation.tsx       # Conversation list item
  credentials-qr.tsx     # QR code generation
  qr-modal.tsx          # QR code modal (show/scan)
  ui/                   # Base UI components

contexts/                # React context providers
  credential-context.tsx # Credential management
  message-context.tsx    # Message state
  repository-context.tsx # Database repository access
  settings-context.tsx   # App settings management
  settings-context.tsx   # App settings management
  settings-context.tsx   # App settings management

hooks/                   # Custom React hooks
  use-cipher-service.ts  # Encryption/decryption
  use-message-service.ts # Message operations
  use-peer-id.ts        # Peer identification

noise/                   # Noise Protocol XX implementation
  xx.ts                 # Handshake and transport
  example.ts            # Usage examples

treekem/                 # TreeKEM group key management
  member.ts             # Member operations
  tree.ts               # Binary tree structure
  upke.ts               # UPKE cryptographic primitives
  protocol.ts           # Serialization utilities
  types.ts              # TypeScript interfaces

repos/                   # Database layer
  db.ts                 # SQLite migrations
  specs/                # Repository interfaces
    contacts-repository.ts
    messages-repository.ts
    fragments-repository.ts
  impls/                # SQLite implementations
    sq-contacts-repository.ts
    sq-messages-repository.ts
    sq-fragments-repository.ts

services/                # Business logic
  compression-service.ts
  frag-service.ts       # Message fragmentation
  message-protocol-service.ts
  packet-protocol-service.ts
  padding-service.ts

utils/                   # Utility functions
  Base64String.ts
  ByteArrayBuilder.ts
  mutex.ts
  names.ts              # Random name generation
  random.ts
  secure-store.ts       # Encrypted storage
  string.ts
```

### Database Schema

**contacts**
- `id`: Auto-increment primary key
- `verification_key`: Ed25519 public key (hex string)
- `pseudonym`: User display name
- `signature`: Credential signature (hex string)
- `ecdh_public_key`: X25519 public key (hex string)
- `created_at`, `updated_at`: Timestamps

**messages**
- `id`: Message UUID
- `sender`, `contents`, `timestamp`
- `is_relay`, `is_private`
- `recipient_nickname`, `sender_peer_id`
- `delivery_status`

**fragments**
- Fragment reassembly for large messages
- `fragment_id`, `position`, `version`
- `payload`, `signature`, `route`

**outgoing_messages**
- Queue for pending message delivery

## Network Architecture

### Bluetooth Decentralized Mesh

BitChat operates as a **serverless, peer-to-peer mesh network** using Bluetooth Low Energy (BLE) for local communication. This architecture provides:

#### Key Features
- **No Central Server**: Messages route through nearby devices without internet dependency
- **Offline-First**: Full functionality without cellular or Wi-Fi connectivity
- **Censorship Resistant**: No central authority can block or monitor communications
- **Range Extension**: Messages propagate beyond single BLE range through relay nodes

#### Message Routing
1. **Peer Discovery**: Devices advertise presence via BLE advertising packets
2. **Neighbor Table**: Each device maintains a list of nearby reachable peers
3. **Flood Routing**: Messages propagate through the mesh with TTL (Time-To-Live) limiting
4. **Hop Count**: Each relay decrements `allowed_hops` counter to prevent infinite loops
5. **Route Tracking**: Message route is encoded to prevent circular forwarding

#### Packet Structure
```typescript
interface BitchatPacket {
  version: number;          // Protocol version
  type: number;             // Message type (unicast/broadcast/group)
  senderId: string;         // Original sender peer ID
  recipientId: string;      // Target recipient (or broadcast channel)
  timestamp: number;        // Message creation time
  payload: Uint8Array;      // Encrypted message data
  signature: string | null; // Ed25519 signature
  allowedHops: number;      // TTL for relay prevention
  route: Uint8Array;        // Path tracking (prevents loops)
}
```

#### Fragmentation
Large messages are automatically fragmented to fit BLE MTU constraints:
- **Fragment Size**: Configurable chunks (typically 512 bytes)
- **Reassembly**: Fragments collected and reconstructed at destination
- **Fragment ID**: UUID identifies fragments belonging to same message
- **Position Tracking**: Sequential ordering for correct reassembly
- **Compression**: Optional compression before fragmentation

#### Relay Mechanism
Devices act as relay nodes to extend network range:
1. **Receive**: Device receives packet from neighbor
2. **Verify**: Check signature and hop count
3. **Decrypt** (if recipient): Attempt decryption with own keys
4. **Forward** (if relay): Re-broadcast to other neighbors if hops remaining
5. **Deduplication**: Track seen message IDs to prevent re-forwarding

#### Privacy Features
- **Timing Obfuscation**: Random delays prevent traffic analysis
- **Dummy Traffic**: Planned support for cover traffic
- **Metadata Protection**: Encrypted sender/recipient in higher-layer protocols
- **Panic Mode**: Triple-tap emergency message deletion
- **Message Auto-Deletion**: Configurable retention periods
- **Data Sovereignty**: Complete local data control with selective or full deletion
- **Panic Mode**: Triple-tap emergency message deletion
- **Message Auto-Deletion**: Configurable retention periods
- **Data Sovereignty**: Complete local data control with selective or full deletion
- **Panic Mode**: Triple-tap emergency message deletion
- **Message Auto-Deletion**: Configurable retention periods
- **Data Sovereignty**: Complete local data control with selective or full deletion

#### Challenges & Solutions (TODO)
| Challenge | Solution |
|-----------|----------|
| BLE Range Limitation (~100m) | Multi-hop relay extends effective range |
| Network Partitioning | Store-and-forward when routes reconnect |
| Battery Drain | Adaptive scanning intervals, connection pooling |
| Scalability | Hop limits, local flooding, DHT for discovery |
| Denial of Service | Rate limiting, proof-of-work, reputation systems |

#### Future Exploration 
- **Mesh Routing Protocols**: Implement AODV or BATMAN for efficient routing
- **DHT Integration**: Distributed hash table for peer discovery at scale
- **LoRa Integration**: Long-range radio for extended outdoor coverage
- **WiFi Direct**: Fallback transport for higher bandwidth
- **Mesh Health Monitoring**: Network topology visualization and diagnostics

## Cryptographic Implementations

### Noise Protocol XX
- ChaCha20-Poly1305 AEAD encryption
- X25519 key agreement
- BLAKE2s hashing
- HKDF key derivation
- Three-way handshake pattern

### TreeKEM UPKE
- Ristretto255 elliptic curve operations
- Ed25519 signature verification
- X25519 ECDH for welcome message encryption
- AES-256-GCM for symmetric encryption
- Efficient O(log n) group updates

### Credential Format
```typescript
interface Credentials {
  verificationKey: Uint8Array;  // Ed25519 public key (32 bytes)
  pseudonym: string;             // Display name
  signature: Uint8Array;         // Self-signature (64 bytes)
  ecdhPublicKey: Uint8Array;     // X25519 public key (32 bytes)
}
```

## Settings & Privacy

### Settings Management
The app includes a comprehensive settings system that persists user preferences:

- **Message Retention**: Configure automatic message deletion from 10 minutes to 5 days
- **User Profile**: Update pseudonym with real-time saving
- **Data Management**: Selective message deletion or complete app reset
- **Security Information**: Detailed explanations of privacy and security features

### Settings Storage
Settings are stored locally using encrypted JSON files:
```typescript
interface Settings {
  messageRetentionMinutes: number;
  notificationsEnabled: boolean;
  theme: 'dark' | 'light' | 'auto';
  autoDeleteMessages: boolean;
  encryptionEnabled: boolean;
  lastUpdated: string;
}
```

### Privacy Controls
- **Panic Button**: Triple-tap emergency deletion of all messages
- **Data Deletion**: Granular control over message and credential deletion
- **Local Storage**: All settings and data remain on device
- **No Telemetry**: No usage data collection or transmission

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Expo CLI
- iOS Simulator or Android Emulator (or physical device)

### Installation

1. Install dependencies
```bash
npm install
```

2. Start the development server
```bash
npx expo start
```

3. Run on a platform
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app for physical device

### Development

The app uses file-based routing via Expo Router. Edit files in the `app/` directory to modify screens.

Key development files:
- `app/(tabs)/index.tsx` - Main chats screen
- `components/qr-modal.tsx` - QR code functionality
- `treekem/member.ts` - Group cryptography
- `noise/xx.ts` - Transport encryption

### Testing

Run the test suite:
```bash
npm test
```

TreeKEM tests (13 tests):
```bash
npm test treekem/__tests__/treekem-test.ts
```

## Dependencies

### Core
- `expo` - Development platform
- `expo-router` - File-based navigation
- `expo-sqlite` - Local database
- `expo-camera` - QR code scanning
- `expo-crypto` - Secure random bytes
- `react-native` - Mobile framework

### Cryptography
- `@noble/curves` - Elliptic curve operations (Ed25519, X25519, Ristretto255)
- `@noble/ciphers` - AES-GCM encryption
- `@noble/hashes` - Hashing (BLAKE2s, SHA256, HKDF)

### UI
- `react-native-qrcode-svg` - QR code generation
- `react-native-svg` - SVG rendering
- `react-native-safe-area-context` - Safe area handling
- `@miblanchard/react-native-slider` - Settings sliders
- `@miblanchard/react-native-slider` - Settings sliders
- `@miblanchard/react-native-slider` - Settings sliders

## Contributing

This is a research/educational project exploring modern cryptographic protocols in mobile applications.

## License

[Add your license here]

## Acknowledgments

- Noise Protocol: https://noiseprotocol.org/
- TreeKEM (Amigo Protocol): https://spacelab-ccny.github.io/research/amigo/
- Noble Cryptography: https://paulmillr.com/noble/

