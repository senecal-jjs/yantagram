# Yantagram

A decentralized, privacy-focused messaging app built with React Native and Expo that uses Bluetooth Low Energy (BLE) mesh networking for peer-to-peer communication without relying on centralized servers or internet connectivity.

## Features

- **Decentralized Mesh Networking**: Messages are relayed through nearby devices using BLE, creating a resilient mesh network
- **End-to-End Encryption**: Uses Amigo protocol for decentralized continuous group key agreement
- **No Internet Required**: Communicate with nearby users without cellular or WiFi connectivity
- **QR Code Contact Exchange**: Securely add contacts by scanning QR codes for out-of-band verification
- **Group Messaging**: Create and manage encrypted group conversations
- **Message Retention Controls**: Configurable message expiration and retention policies
- **Cross-Platform**: Runs on iOS and Android

## Tech Stack

- **Framework**: React Native with Expo
- **Navigation**: Expo Router
- **Database**: SQLite via expo-sqlite
- **Secure Storage**: expo-secure-store for credentials
- **Cryptography**: 
  - Amigo protocol for decentralized group key agreement (implementation in amigo/)
  - Noble curves (Ed25519, Ristretto255, X25519) via @noble/curves
  - AES-256-GCM for symmetric encryption via @noble/ciphers
  - HKDF, SHA-256, SHA-512, BLAKE3 via @noble/hashes
- **Compression**: zlib via pako
- **Networking**: Custom BLE module for mesh communication
- **Duplicate Detection**: Bloom filters with TTL support (using seedrandom)

## Project Structure

```
├── app/                    # Expo Router app directory
│   ├── (tabs)/            # Tab-based navigation screens
│   ├── (settings-modal)/  # Settings screens
│   └── (group-modal)/     # Group management screens
├── bloom/                  # Bloom filter implementations for packet deduplication
├── components/             # Reusable React components
├── contexts/               # React contexts for state management
├── hooks/                  # Custom React hooks
├── modules/ble/            # Native BLE module for mesh networking
├── repos/                  # Data repositories and database layer
├── services/               # Business logic services
├── amigo/                  # Amigo cryptographic protocol implementation
├── types/                  # TypeScript type definitions
└── utils/                  # Utility functions
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI
- For iOS: Xcode and CocoaPods
- For Android: Android Studio and Android SDK

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/senecal-jjs/yantagram.git
   cd yantagram
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install iOS pods (macOS only):
   ```bash
   cd ios && pod install && cd ..
   ```

4. Start the development server:
   ```bash
   npm start
   ```

5. Run on device/simulator:
   ```bash
   # iOS
   npm run ios
   
   # Android
   npm run android
   ```

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Reset Project

To reset the project and clear generated files:
```bash
npm run reset-project
```

## Architecture

### Mesh Networking

Yantagram uses BLE to create a decentralized mesh network:
- Devices act as both central and peripheral BLE devices
- Messages are fragmented and broadcast to nearby peers
- Bloom filters prevent duplicate packet processing
- Packets are relayed to extend network reach

### Cryptography

The app implements the Amigo protocol for secure group messaging:
- Decentralized continuous group key agreement (CGKA) designed for mesh networks
- Tolerates unreliable networks with message drops and reordering
- Provides post-compromise security and fast member removal
- Forward secrecy is maintained through regular key rotation
- Messages are encrypted with group-specific keys

### Data Storage

- SQLite database for persistent storage
- Secure Store for sensitive credentials
- Configurable message retention policies

## Permissions

The app requires the following permissions:

**iOS:**
- Bluetooth (always and peripheral usage)
- Camera (for QR code scanning)
- Photo Library (for sharing images)

**Android:**
- Bluetooth and Bluetooth Admin
- Bluetooth Advertise and Connect
- Location (required for BLE scanning)
- Camera

## Security Notice

⚠️ **Application security and encryption have not yet been fully audited. Use this application at your own discretion.**

## License

This project is proprietary software.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
