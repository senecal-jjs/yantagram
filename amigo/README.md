# TreeKEM TypeScript Implementation

This directory contains a TypeScript port of the Rust TreeKEM implementation from the `amigo` directory.

## Files

- **`types.ts`** - Shared type definitions and interfaces
- **`upke.ts`** - Updatable Public Key Encryption (UPKE) primitives
- **`tree.ts`** - Binary tree structure for the ratchet tree
- **`member.ts`** - Group member operations and protocols

## Architecture

### UPKE Cryptography (`upke.ts`)

- **Ristretto255**: Elliptic curve operations using `@noble/curves/ed25519`
- **UPKE**: Updatable encryption where encrypt/decrypt operations update keys
- **Ed25519**: Digital signatures for credentials
- **RSA-2048**: For encrypting group symmetric keys in welcome messages
- **AES-256-GCM**: Symmetric encryption for messages and tree serialization
- **HKDF**: Key derivation using SHA-256/SHA-512

### Tree Structure (`tree.ts`)

- **BinaryTree**: Complete binary tree where leaves = group members
- **Node**: Stores UPKE keys, node secrets, and member credentials
- Key operations:
  - `getAncestors()`: Path from leaf to root for updates
  - `getLeftmostOpenLeaf()`: Find position for new members
  - `serialize()`/`deserialize()`: Share tree state with joiners
  - `getBlankNodePath()`: Nodes to encrypt removal messages to

### Member Protocol (`member.ts`)

Group operations:
- **`createGroup()`**: Initialize ratchet tree with admin threshold
- **`addToGroup()`**: Claim leftmost open leaf, generate keys
- **`sendWelcomeMessage()`**: RSA-encrypt group key + serialized tree
- **`joinGroup()`**: Decrypt welcome, deserialize tree, add self
- **`updatePath()`**: Refresh keys from leaf to root
- **`applyUpdatePath()`**: Process another member's key update
- **`blankNode()`/`applyBlankMessage()`**: Remove members securely
- **`encryptApplicationMessage()`**: Group messaging with counter ratcheting
- **`decryptApplicationMessage()`**: Decrypt with forward secrecy

## Dependencies

Required packages:

```json
{
  "@noble/curves": "^1.3.0",
  "@noble/hashes": "^1.3.3",
  "@noble/ciphers": "^0.4.0",
  "expo-crypto": "~13.0.0"
}
```

**Note**: All cryptographic operations use pure JavaScript implementations from the @noble suite, eliminating the need for native modules.

- **X25519 ECDH**: Key agreement for welcome message encryption
- **AES-256-GCM**: AEAD encryption using @noble/ciphers
- **Ed25519/Ristretto255**: Signatures and UPKE operations

## Security Properties

- **Forward Secrecy**: Message counter ratcheting prevents decryption of old messages
- **Post-Compromise Security**: `key_refresh()` heals from key compromise
- **Efficient Updates**: Only O(log n) nodes updated per operation
- **Authentication**: Ed25519 signatures verify member identities
- **Confidentiality**: Only group members can decrypt (shared root key)

## Usage Example

```typescript
import { Member } from './treekem/member';

// Create members
const alice = await Member.create('Alice');
const bob = await Member.create('Bob');
const charlie = await Member.create('Charlie');

// Alice creates group
alice.createGroup(4, 'SecureChat', 1);
const aliceUpdate = alice.addToGroup('SecureChat');

// Bob joins
const welcome = await alice.sendWelcomeMessage(bob.credential, 'SecureChat');
const bobUpdate = await bob.joinGroup(welcome);
await alice.applyUpdatePath(bobUpdate.ciphertext, bobUpdate.nonce, 'SecureChat', bob.id!);

// Send encrypted message
const message = new TextEncoder().encode('Hello, group!');
const { ciphertext, nonce, messageCounter } = await alice.encryptApplicationMessage(
  message,
  'SecureChat'
);

// Bob decrypts
const plaintext = await bob.decryptApplicationMessage(
  ciphertext,
  'SecureChat',
  nonce,
  messageCounter
);
```

## Implementation Notes

### Differences from Rust Version

1. **Async/Await**: Cryptographic operations are async in TypeScript
2. **Map instead of HashMap**: Using JavaScript `Map` for key-value storage
3. **Uint8Array**: Instead of Rust's `Vec<u8>` and `[u8; N]`
4. **JSON serialization**: Using JSON instead of serde for message encoding
5. **Error handling**: Using exceptions instead of Result types

### Cryptographic Implementation

All cryptographic operations are implemented in pure JavaScript using @noble libraries:

- ✅ X25519 ECDH key agreement (32-byte keys)
- ✅ HKDF key derivation
- ✅ AES-256-GCM AEAD encryption
- ✅ Ed25519 signatures
- ✅ Ristretto255 UPKE operations
- ✅ Secure random number generation (using `expo-crypto`)

No native modules required! This provides:
- Cross-platform compatibility
- Smaller QR codes (32-byte EC keys vs 256+ byte RSA keys)
- Faster cryptographic operations
- Easier testing and debugging

## Testing

To test the implementation, run the equivalent of the Rust tests:

```typescript
// Test group creation
const member = await Member.create('Alice');
member.createGroup(4, 'anonymous', 1);
member.addToGroup('anonymous');

// Test member joining
const member2 = await Member.create('Bob');
const welcome = await member.sendWelcomeMessage(member2.credential, 'anonymous');
const update = await member2.joinGroup(welcome);
await member.applyUpdatePath(update.ciphertext, update.nonce, 'anonymous', member2.id!);

// Test messaging
const msg = new TextEncoder().encode('Test message');
const encrypted = await member.encryptApplicationMessage(msg, 'anonymous');
const decrypted = await member2.decryptApplicationMessage(
  encrypted.ciphertext,
  'anonymous',
  encrypted.nonce,
  encrypted.messageCounter
);
```

## Integration with BitChat

This TreeKEM implementation can be integrated with the existing BitChat React Native app:

1. **Replace current encryption**: Use TreeKEM for group messaging
2. **Fragment large messages**: Use existing `frag-service.ts` for BLE MTU limits
3. **Store in SQLite**: Persist group state using existing repository pattern
4. **BLE transmission**: Send TreeKEM messages over existing BLE mesh

## References

- Original Rust implementation: `../amigo/`
- TreeKEM paper: [Art et al., "On the Security of Two-Round Key Exchange"](https://eprint.iacr.org/2017/666)
- MLS RFC: [RFC 9420 - Messaging Layer Security](https://www.rfc-editor.org/rfc/rfc9420.html)
