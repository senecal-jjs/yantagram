/**
 * Noise Protocol XX Example
 *
 * This example demonstrates a complete Noise XX handshake and secure
 * communication session between Alice (initiator) and Bob (responder).
 */

import {
  deserializeMessageBuffer,
  generateNoiseKeypair,
  initSession,
  recvMessage,
  sendMessage,
  serializeMessageBuffer,
  type KeyPair,
  type MessageBuffer,
  type NoiseSession,
} from "./xx";

/**
 * Complete example of Noise XX protocol usage
 */
export async function noiseExample() {
  console.log("=== Noise Protocol XX Example ===\n");

  // Step 1: Generate long-term static keypairs for both parties
  console.log("Step 1: Generating static keypairs...");
  const aliceStaticKeypair: KeyPair = generateNoiseKeypair();
  const bobStaticKeypair: KeyPair = generateNoiseKeypair();

  console.log(
    "Alice public key:",
    Buffer.from(aliceStaticKeypair.publicKey).toString("hex").substring(0, 16) +
      "...",
  );
  console.log(
    "Bob public key:",
    Buffer.from(bobStaticKeypair.publicKey).toString("hex").substring(0, 16) +
      "...\n",
  );

  // Step 2: Initialize sessions
  // In XX pattern, neither party knows the other's static public key initially
  console.log("Step 2: Initializing sessions...");
  const prologue = new TextEncoder().encode("NoiseExampleApp2025");

  let aliceSession: NoiseSession = initSession(
    true, // Alice is the initiator
    prologue,
    aliceStaticKeypair,
    new Uint8Array(32), // Alice doesn't know Bob's public key yet
  );

  let bobSession: NoiseSession = initSession(
    false, // Bob is the responder
    prologue,
    bobStaticKeypair,
    new Uint8Array(32), // Bob doesn't know Alice's public key yet
  );

  console.log("Alice session initialized (initiator)");
  console.log("Bob session initialized (responder)\n");

  // Step 3: Handshake Message 1 (Alice -> Bob)
  // Alice sends: e (ephemeral public key)
  console.log("Step 3: Handshake Message 1 (Alice -> Bob)");
  const msg1Payload = new TextEncoder().encode("Hello from Alice");
  const sendResult1 = sendMessage(aliceSession, msg1Payload);
  aliceSession = sendResult1.session;
  const msg1: MessageBuffer = sendResult1.messageBuffer;

  if (sendResult1.error) {
    throw sendResult1.error;
  }

  console.log("Alice sent message 1");
  console.log(
    "  - Ephemeral key:",
    Buffer.from(msg1.ne).toString("hex").substring(0, 16) + "...",
  );
  console.log("  - Payload length:", msg1.ciphertext.length, "bytes\n");

  // Bob receives message 1
  const recvResult1 = recvMessage(bobSession, msg1);
  bobSession = recvResult1.session;

  if (!recvResult1.valid) {
    throw new Error("Message 1 validation failed");
  }

  console.log("Bob received message 1");
  console.log(
    "  - Decrypted payload:",
    new TextDecoder().decode(recvResult1.plaintext),
  );
  console.log("  - Valid:", recvResult1.valid, "\n");

  // Step 4: Handshake Message 2 (Bob -> Alice)
  // Bob sends: e, ee, s, es (ephemeral key, DH operations, static key encrypted)
  console.log("Step 4: Handshake Message 2 (Bob -> Alice)");
  const msg2Payload = new TextEncoder().encode("Hello from Bob");
  const sendResult2 = sendMessage(bobSession, msg2Payload);
  bobSession = sendResult2.session;
  const msg2: MessageBuffer = sendResult2.messageBuffer;

  if (sendResult2.error) {
    throw sendResult2.error;
  }

  console.log("Bob sent message 2");
  console.log(
    "  - Ephemeral key:",
    Buffer.from(msg2.ne).toString("hex").substring(0, 16) + "...",
  );
  console.log("  - Encrypted static key length:", msg2.ns.length, "bytes");
  console.log("  - Payload length:", msg2.ciphertext.length, "bytes\n");

  // Alice receives message 2
  const recvResult2 = recvMessage(aliceSession, msg2);
  aliceSession = recvResult2.session;

  if (!recvResult2.valid) {
    throw new Error("Message 2 validation failed");
  }

  console.log("Alice received message 2");
  console.log(
    "  - Decrypted payload:",
    new TextDecoder().decode(recvResult2.plaintext),
  );
  console.log("  - Valid:", recvResult2.valid);
  console.log("  - Alice now knows Bob's static public key\n");

  // Step 5: Handshake Message 3 (Alice -> Bob)
  // Alice sends: s, se (static key encrypted, final DH)
  console.log("Step 5: Handshake Message 3 (Alice -> Bob)");
  const msg3Payload = new TextEncoder().encode("Handshake complete!");
  const sendResult3 = sendMessage(aliceSession, msg3Payload);
  aliceSession = sendResult3.session;
  const msg3: MessageBuffer = sendResult3.messageBuffer;

  if (sendResult3.error) {
    throw sendResult3.error;
  }

  console.log("Alice sent message 3");
  console.log("  - Encrypted static key length:", msg3.ns.length, "bytes");
  console.log("  - Payload length:", msg3.ciphertext.length, "bytes");
  console.log(
    "  - Handshake hash:",
    Buffer.from(aliceSession.h).toString("hex").substring(0, 16) + "...\n",
  );

  // Bob receives message 3
  const recvResult3 = recvMessage(bobSession, msg3);
  bobSession = recvResult3.session;

  if (!recvResult3.valid) {
    throw new Error("Message 3 validation failed");
  }

  console.log("Bob received message 3");
  console.log(
    "  - Decrypted payload:",
    new TextDecoder().decode(recvResult3.plaintext),
  );
  console.log("  - Valid:", recvResult3.valid);
  console.log("  - Bob now knows Alice's static public key");
  console.log(
    "  - Handshake hash:",
    Buffer.from(bobSession.h).toString("hex").substring(0, 16) + "...\n",
  );

  // Step 6: Verify handshake hashes match
  const hashesMatch = aliceSession.h.every(
    (byte, i) => byte === bobSession.h[i],
  );
  console.log("Handshake hashes match:", hashesMatch);

  if (!hashesMatch) {
    throw new Error("Handshake hash mismatch!");
  }

  console.log("✓ Handshake complete! Transport mode established.\n");

  // Step 7: Transport phase - encrypted bidirectional communication
  console.log("Step 7: Transport phase - secure messaging");
  console.log("==========================================\n");

  // Alice sends encrypted application message
  const appMsg1 = new TextEncoder().encode("Secret message 1 from Alice");
  const sendApp1 = sendMessage(aliceSession, appMsg1);
  aliceSession = sendApp1.session;

  console.log('Alice -> Bob: "Secret message 1 from Alice"');
  console.log(
    "  - Encrypted length:",
    sendApp1.messageBuffer.ciphertext.length,
    "bytes",
  );

  const recvApp1 = recvMessage(bobSession, sendApp1.messageBuffer);
  bobSession = recvApp1.session;
  console.log(
    "  - Bob decrypted:",
    new TextDecoder().decode(recvApp1.plaintext),
  );
  console.log("  - Valid:", recvApp1.valid, "\n");

  // Bob sends encrypted application message
  const appMsg2 = new TextEncoder().encode("Secret message 2 from Bob");
  const sendApp2 = sendMessage(bobSession, appMsg2);
  bobSession = sendApp2.session;

  console.log('Bob -> Alice: "Secret message 2 from Bob"');
  console.log(
    "  - Encrypted length:",
    sendApp2.messageBuffer.ciphertext.length,
    "bytes",
  );

  const recvApp2 = recvMessage(aliceSession, sendApp2.messageBuffer);
  aliceSession = recvApp2.session;
  console.log(
    "  - Alice decrypted:",
    new TextDecoder().decode(recvApp2.plaintext),
  );
  console.log("  - Valid:", recvApp2.valid, "\n");

  // Multiple messages to show forward secrecy (each message uses new nonce)
  for (let i = 3; i <= 5; i++) {
    const msg = new TextEncoder().encode(`Message ${i} from Alice`);
    const send = sendMessage(aliceSession, msg);
    aliceSession = send.session;

    const recv = recvMessage(bobSession, send.messageBuffer);
    bobSession = recv.session;

    console.log(
      `Alice -> Bob: "Message ${i} from Alice" (valid: ${recv.valid})`,
    );
  }

  console.log(
    "\n✓ Example complete! All messages encrypted and authenticated.",
  );

  return {
    aliceSession,
    bobSession,
    handshakeHash: Buffer.from(aliceSession.h).toString("hex"),
  };
}

/**
 * Minimal usage example
 */
export function minimalExample() {
  // Setup
  const aliceKeys = generateNoiseKeypair();
  const bobKeys = generateNoiseKeypair();
  const prologue = new Uint8Array(0);

  let alice = initSession(true, prologue, aliceKeys, new Uint8Array(32));
  let bob = initSession(false, prologue, bobKeys, new Uint8Array(32));

  // Handshake
  // Message 1: Alice -> Bob
  const send1 = sendMessage(alice, new TextEncoder().encode("msg1"));
  alice = send1.session;
  const recv1 = recvMessage(bob, send1.messageBuffer);
  bob = recv1.session;

  // Message 2: Bob -> Alice
  const send2 = sendMessage(bob, new TextEncoder().encode("msg2"));
  bob = send2.session;
  const recv2 = recvMessage(alice, send2.messageBuffer);
  alice = recv2.session;

  // Message 3: Alice -> Bob
  const send3 = sendMessage(alice, new TextEncoder().encode("msg3"));
  alice = send3.session;
  const recv3 = recvMessage(bob, send3.messageBuffer);
  bob = recv3.session;

  // Transport: Send encrypted messages
  const appSend = sendMessage(alice, new TextEncoder().encode("Hello!"));
  alice = appSend.session;
  const appRecv = recvMessage(bob, appSend.messageBuffer);
  bob = appRecv.session;

  console.log("Decrypted:", new TextDecoder().decode(appRecv.plaintext));
  console.log("Valid:", appRecv.valid);
}

/**
 * Example showing serialization/deserialization for network transmission
 */
export function serializationExample() {
  console.log("=== Message Serialization Example ===\n");

  // Setup two parties
  const aliceKeys = generateNoiseKeypair();
  const bobKeys = generateNoiseKeypair();
  const prologue = new Uint8Array(0);

  let alice = initSession(true, prologue, aliceKeys, new Uint8Array(32));
  let bob = initSession(false, prologue, bobKeys, new Uint8Array(32));

  // Alice creates and sends message 1
  const payload1 = new TextEncoder().encode("Hello from Alice");
  const send1 = sendMessage(alice, payload1);
  alice = send1.session;

  console.log("Step 1: Alice creates message");
  console.log("  Original MessageBuffer:");
  console.log("    - ne length:", send1.messageBuffer.ne.length);
  console.log("    - ns length:", send1.messageBuffer.ns.length);
  console.log(
    "    - ciphertext length:",
    send1.messageBuffer.ciphertext.length,
  );

  // Serialize for transmission (e.g., over BLE, network, etc.)
  const serialized = serializeMessageBuffer(send1.messageBuffer);
  console.log("\nStep 2: Serialize for transmission");
  console.log("  Serialized size:", serialized.length, "bytes");
  console.log(
    "  Wire format:",
    Buffer.from(serialized).toString("hex").substring(0, 40) + "...",
  );

  // Simulate network transmission...
  // In real usage, you'd send 'serialized' over BLE, WebSocket, etc.

  // Deserialize on receiving end
  console.log("\nStep 3: Bob receives and deserializes");
  const deserialized = deserializeMessageBuffer(serialized);
  console.log("  Deserialized MessageBuffer:");
  console.log("    - ne length:", deserialized.ne.length);
  console.log("    - ns length:", deserialized.ns.length);
  console.log("    - ciphertext length:", deserialized.ciphertext.length);

  // Verify data integrity
  const neMatch = send1.messageBuffer.ne.every(
    (b, i) => b === deserialized.ne[i],
  );
  const nsMatch = send1.messageBuffer.ns.every(
    (b, i) => b === deserialized.ns[i],
  );
  const ctMatch = send1.messageBuffer.ciphertext.every(
    (b, i) => b === deserialized.ciphertext[i],
  );

  console.log("\nStep 4: Verify integrity");
  console.log("  ne matches:", neMatch);
  console.log("  ns matches:", nsMatch);
  console.log("  ciphertext matches:", ctMatch);

  // Bob processes the deserialized message
  const recv1 = recvMessage(bob, deserialized);
  bob = recv1.session;

  console.log("\nStep 5: Bob decrypts message");
  console.log(
    "  Decrypted payload:",
    new TextDecoder().decode(recv1.plaintext),
  );
  console.log("  Valid:", recv1.valid);

  console.log("\n✓ Serialization/deserialization successful!");

  return { serialized, deserialized };
}

// Run the example if this file is executed directly
if (require.main === module) {
  noiseExample().catch(console.error);
}
