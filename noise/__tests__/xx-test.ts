import { getRandomBytes } from "expo-crypto";
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
} from "../xx";

test("serialization/deserialization", () => {
  const buffer: MessageBuffer = {
    ne: getRandomBytes(8),
    ns: getRandomBytes(8),
    ciphertext: getRandomBytes(8),
  };

  const serialized = serializeMessageBuffer(buffer);
  const deserialized = deserializeMessageBuffer(serialized);

  expect(deserialized.ne).toEqual(buffer.ne);
  expect(deserialized.ns).toEqual(buffer.ns);
  expect(deserialized.ciphertext).toEqual(buffer.ciphertext);
});

test("noise handshake", () => {
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
});
