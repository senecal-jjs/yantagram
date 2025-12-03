/**
 * Noise Protocol XX Implementation
 *
 * XX:
 *   -> e
 *   <- e, ee, s, es
 *   -> s, se
 *   <-
 *   ->
 *
 * Implementation Version: 1.0.4
 */

import { x25519 } from "@noble/curves/ed25519.js";
import { blake2s } from "@noble/hashes/blake2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";
import { getRandomBytes } from "expo-crypto";

/* ---------------------------------------------------------------- *
 * TYPES                                                            *
 * ---------------------------------------------------------------- */

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface MessageBuffer {
  ne: Uint8Array;
  ns: Uint8Array;
  ciphertext: Uint8Array;
}

/**
 * Serialize a MessageBuffer into a single byte array for transmission.
 *
 * Format:
 * - 2 bytes: ne length (big-endian uint16)
 * - ne length bytes: ne data
 * - 2 bytes: ns length (big-endian uint16)
 * - ns length bytes: ns data
 * - 4 bytes: ciphertext length (big-endian uint32)
 * - ciphertext length bytes: ciphertext data
 *
 * @param mb MessageBuffer to serialize
 * @returns Serialized bytes
 */
export function serializeMessageBuffer(mb: MessageBuffer): Uint8Array {
  const neLen = mb.ne.length;
  const nsLen = mb.ns.length;
  const ctLen = mb.ciphertext.length;

  // Calculate total size: 2 + neLen + 2 + nsLen + 4 + ctLen
  const totalSize = 2 + neLen + 2 + nsLen + 4 + ctLen;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  let offset = 0;

  // Write ne length and data
  view.setUint16(offset, neLen, false); // big-endian
  offset += 2;
  buffer.set(mb.ne, offset);
  offset += neLen;

  // Write ns length and data
  view.setUint16(offset, nsLen, false);
  offset += 2;
  buffer.set(mb.ns, offset);
  offset += nsLen;

  // Write ciphertext length and data
  view.setUint32(offset, ctLen, false);
  offset += 4;
  buffer.set(mb.ciphertext, offset);

  return buffer;
}

/**
 * Deserialize bytes into a MessageBuffer.
 *
 * @param data Serialized MessageBuffer bytes
 * @returns Deserialized MessageBuffer
 * @throws Error if data is malformed
 */
export function deserializeMessageBuffer(data: Uint8Array): MessageBuffer {
  if (data.length < 8) {
    throw new Error("Invalid MessageBuffer: too short");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  // Read ne length and data
  const neLen = view.getUint16(offset, false);
  offset += 2;
  if (offset + neLen > data.length) {
    throw new Error("Invalid MessageBuffer: ne length exceeds buffer");
  }
  const ne = data.slice(offset, offset + neLen);
  offset += neLen;

  // Read ns length and data
  if (offset + 2 > data.length) {
    throw new Error("Invalid MessageBuffer: truncated at ns length");
  }
  const nsLen = view.getUint16(offset, false);
  offset += 2;
  if (offset + nsLen > data.length) {
    throw new Error("Invalid MessageBuffer: ns length exceeds buffer");
  }
  const ns = data.slice(offset, offset + nsLen);
  offset += nsLen;

  // Read ciphertext length and data
  if (offset + 4 > data.length) {
    throw new Error("Invalid MessageBuffer: truncated at ciphertext length");
  }
  const ctLen = view.getUint32(offset, false);
  offset += 4;
  if (offset + ctLen > data.length) {
    throw new Error("Invalid MessageBuffer: ciphertext length exceeds buffer");
  }
  const ciphertext = data.slice(offset, offset + ctLen);

  return { ne, ns, ciphertext };
}

interface CipherState {
  k: Uint8Array;
  n: bigint;
}

interface SymmetricState {
  cs: CipherState;
  ck: Uint8Array;
  h: Uint8Array;
}

interface HandshakeState {
  ss: SymmetricState;
  s: KeyPair;
  e: KeyPair;
  rs: Uint8Array;
  re: Uint8Array;
  psk: Uint8Array;
}

export interface NoiseSession {
  hs: HandshakeState;
  h: Uint8Array;
  cs1: CipherState;
  cs2: CipherState;
  mc: number;
  i: boolean;
}

/* ---------------------------------------------------------------- *
 * CONSTANTS                                                        *
 * ---------------------------------------------------------------- */

const EMPTY_KEY = new Uint8Array(32);
const MIN_NONCE = 0n;
const MAX_NONCE = 18446744073709551615n; // 2^64 - 1

/* ---------------------------------------------------------------- *
 * UTILITY FUNCTIONS                                                *
 * ---------------------------------------------------------------- */

function getPublicKey(kp: KeyPair): Uint8Array {
  return kp.publicKey;
}

function isEmptyKey(k: Uint8Array): boolean {
  return k.every((byte, i) => byte === EMPTY_KEY[i]);
}

function validatePublicKey(k: Uint8Array): boolean {
  const forbiddenCurveValues: Uint8Array[] = [
    new Uint8Array([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
    ]),
    new Uint8Array([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0,
    ]),
    new Uint8Array([
      224, 235, 122, 124, 59, 65, 184, 174, 22, 86, 227, 250, 241, 159, 196,
      106, 218, 9, 141, 235, 156, 50, 177, 253, 134, 98, 5, 22, 95, 73, 184, 0,
    ]),
    new Uint8Array([
      95, 156, 149, 188, 163, 80, 140, 36, 177, 208, 177, 85, 156, 131, 239, 91,
      4, 68, 92, 196, 88, 28, 142, 134, 216, 34, 78, 221, 208, 159, 17, 87,
    ]),
    new Uint8Array([
      236, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 127,
    ]),
    new Uint8Array([
      237, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 127,
    ]),
    new Uint8Array([
      238, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 127,
    ]),
    new Uint8Array([
      205, 235, 122, 124, 59, 65, 184, 174, 22, 86, 227, 250, 241, 159, 196,
      106, 218, 9, 141, 235, 156, 50, 177, 253, 134, 98, 5, 22, 95, 73, 184,
      128,
    ]),
    new Uint8Array([
      76, 156, 149, 188, 163, 80, 140, 36, 177, 208, 177, 85, 156, 131, 239, 91,
      4, 68, 92, 196, 88, 28, 142, 134, 216, 34, 78, 221, 208, 159, 17, 215,
    ]),
    new Uint8Array([
      217, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255,
    ]),
    new Uint8Array([
      218, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255,
    ]),
    new Uint8Array([
      219, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 25,
    ]),
  ];

  for (const testValue of forbiddenCurveValues) {
    if (k.every((byte, i) => byte === testValue[i])) {
      throw new Error("Invalid public key");
    }
  }
  return true;
}

/* ---------------------------------------------------------------- *
 * PRIMITIVES                                                       *
 * ---------------------------------------------------------------- */

function incrementNonce(n: bigint): bigint {
  return n + 1n;
}

function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

function generateKeypair(): KeyPair {
  const privateKey = getRandomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);

  if (validatePublicKey(publicKey)) {
    return { publicKey, privateKey };
  }
  return generateKeypair();
}

function generatePublicKey(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

function encrypt(
  k: Uint8Array,
  n: bigint,
  ad: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  const nonce = new Uint8Array(12);
  const view = new DataView(nonce.buffer);
  view.setBigUint64(4, n, true); // little-endian

  const cipher = new ChaCha20Poly1305(k);
  return cipher.seal(nonce, plaintext, ad);
}

function decrypt(
  k: Uint8Array,
  n: bigint,
  ad: Uint8Array,
  ciphertext: Uint8Array,
): {
  valid: boolean;
  ad: Uint8Array;
  plaintext: Uint8Array;
} {
  const nonce = new Uint8Array(12);
  const view = new DataView(nonce.buffer);
  view.setBigUint64(4, n, true); // little-endian

  const cipher = new ChaCha20Poly1305(k);
  try {
    const plaintext = cipher.open(nonce, ciphertext, ad);
    return {
      valid: plaintext !== null,
      ad,
      plaintext: plaintext || new Uint8Array(0),
    };
  } catch {
    return { valid: false, ad, plaintext: new Uint8Array(0) };
  }
}

function getHash(a: Uint8Array, b: Uint8Array): Uint8Array {
  const combined = new Uint8Array(a.length + b.length);
  combined.set(a);
  combined.set(b, a.length);
  return blake2s(combined);
}

function hashProtocolName(protocolName: Uint8Array): Uint8Array {
  const h = new Uint8Array(32);
  if (protocolName.length <= 32) {
    h.set(protocolName);
  } else {
    return getHash(protocolName, new Uint8Array(0));
  }
  return h;
}

function getHkdf(
  ck: Uint8Array,
  ikm: Uint8Array,
): [Uint8Array, Uint8Array, Uint8Array] {
  const output = hkdf(blake2s, ikm, ck, undefined, 96);
  const k1 = output.slice(0, 32);
  const k2 = output.slice(32, 64);
  const k3 = output.slice(64, 96);
  return [k1, k2, k3];
}

/* ---------------------------------------------------------------- *
 * STATE MANAGEMENT                                                 *
 * ---------------------------------------------------------------- */

/* CipherState */
function initializeKey(k: Uint8Array): CipherState {
  return { k, n: MIN_NONCE };
}

function hasKey(cs: CipherState): boolean {
  return !isEmptyKey(cs.k);
}

function setNonce(cs: CipherState, newNonce: bigint): CipherState {
  cs.n = newNonce;
  return cs;
}

function encryptWithAd(
  cs: CipherState,
  ad: Uint8Array,
  plaintext: Uint8Array,
): {
  cs: CipherState;
  ciphertext: Uint8Array;
  error?: Error;
} {
  if (cs.n >= MAX_NONCE) {
    return {
      cs,
      ciphertext: new Uint8Array(0),
      error: new Error("encryptWithAd: maximum nonce size reached"),
    };
  }
  const e = encrypt(cs.k, cs.n, ad, plaintext);
  cs = setNonce(cs, incrementNonce(cs.n));
  return { cs, ciphertext: e };
}

function decryptWithAd(
  cs: CipherState,
  ad: Uint8Array,
  ciphertext: Uint8Array,
): {
  cs: CipherState;
  plaintext: Uint8Array;
  valid: boolean;
  error?: Error;
} {
  if (cs.n >= MAX_NONCE) {
    return {
      cs,
      plaintext: new Uint8Array(0),
      valid: false,
      error: new Error("decryptWithAd: maximum nonce size reached"),
    };
  }
  const { valid, plaintext } = decrypt(cs.k, cs.n, ad, ciphertext);
  if (valid) {
    cs = setNonce(cs, incrementNonce(cs.n));
  }
  return { cs, plaintext, valid };
}

function reKey(cs: CipherState): CipherState {
  const e = encrypt(cs.k, MAX_NONCE, new Uint8Array(0), EMPTY_KEY);
  cs.k = e.slice(0, 32);
  return cs;
}

/* SymmetricState */

function initializeSymmetric(protocolName: Uint8Array): SymmetricState {
  const h = hashProtocolName(protocolName);
  const ck = new Uint8Array(h);
  const cs = initializeKey(new Uint8Array(EMPTY_KEY));
  return { cs, ck, h };
}

function mixKey(ss: SymmetricState, ikm: Uint8Array): SymmetricState {
  const [ck, tempK] = getHkdf(ss.ck, ikm);
  ss.cs = initializeKey(tempK);
  ss.ck = ck;
  return ss;
}

function mixHash(ss: SymmetricState, data: Uint8Array): SymmetricState {
  ss.h = getHash(ss.h, data);
  return ss;
}

function mixKeyAndHash(ss: SymmetricState, ikm: Uint8Array): SymmetricState {
  const [ck, tempH, tempK] = getHkdf(ss.ck, ikm);
  ss.ck = ck;
  ss = mixHash(ss, tempH);
  ss.cs = initializeKey(tempK);
  return ss;
}

function getHandshakeHash(ss: SymmetricState): Uint8Array {
  return ss.h;
}

function encryptAndHash(
  ss: SymmetricState,
  plaintext: Uint8Array,
): {
  ss: SymmetricState;
  ciphertext: Uint8Array;
  error?: Error;
} {
  let ciphertext: Uint8Array;
  let error: Error | undefined;

  if (hasKey(ss.cs)) {
    const result = encryptWithAd(ss.cs, ss.h, plaintext);
    ciphertext = result.ciphertext;
    error = result.error;
    if (error) {
      return { ss, ciphertext: new Uint8Array(0), error };
    }
  } else {
    ciphertext = plaintext;
  }
  ss = mixHash(ss, ciphertext);
  return { ss, ciphertext };
}

function decryptAndHash(
  ss: SymmetricState,
  ciphertext: Uint8Array,
): {
  ss: SymmetricState;
  plaintext: Uint8Array;
  valid: boolean;
  error?: Error;
} {
  let plaintext: Uint8Array;
  let valid: boolean;
  let error: Error | undefined;

  if (hasKey(ss.cs)) {
    const result = decryptWithAd(ss.cs, ss.h, ciphertext);
    plaintext = result.plaintext;
    valid = result.valid;
    error = result.error;
    if (error) {
      return { ss, plaintext: new Uint8Array(0), valid: false, error };
    }
  } else {
    plaintext = ciphertext;
    valid = true;
  }
  ss = mixHash(ss, ciphertext);
  return { ss, plaintext, valid };
}

function split(ss: SymmetricState): [CipherState, CipherState] {
  const [tempK1, tempK2] = getHkdf(ss.ck, new Uint8Array(0));
  const cs1 = initializeKey(tempK1);
  const cs2 = initializeKey(tempK2);
  return [cs1, cs2];
}

/* HandshakeState */

function initializeInitiator(
  prologue: Uint8Array,
  s: KeyPair,
  rs: Uint8Array,
  psk: Uint8Array,
): HandshakeState {
  const name = new TextEncoder().encode("Noise_XX_25519_ChaChaPoly_BLAKE2s");
  const ss = initializeSymmetric(name);
  mixHash(ss, prologue);
  return {
    ss,
    s,
    e: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
    rs,
    re: new Uint8Array(32),
    psk,
  };
}

function initializeResponder(
  prologue: Uint8Array,
  s: KeyPair,
  rs: Uint8Array,
  psk: Uint8Array,
): HandshakeState {
  const name = new TextEncoder().encode("Noise_XX_25519_ChaChaPoly_BLAKE2s");
  const ss = initializeSymmetric(name);
  mixHash(ss, prologue);
  return {
    ss,
    s,
    e: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
    rs,
    re: new Uint8Array(32),
    psk,
  };
}

function writeMessageA(
  hs: HandshakeState,
  payload: Uint8Array,
): {
  hs: HandshakeState;
  messageBuffer: MessageBuffer;
  error?: Error;
} {
  hs.e = generateKeypair();
  const ne = hs.e.publicKey;
  mixHash(hs.ss, ne);

  const { ss, ciphertext, error } = encryptAndHash(hs.ss, payload);
  hs.ss = ss;

  if (error) {
    return {
      hs,
      messageBuffer: {
        ne: new Uint8Array(32),
        ns: new Uint8Array(0),
        ciphertext: new Uint8Array(0),
      },
      error,
    };
  }

  return {
    hs,
    messageBuffer: { ne, ns: new Uint8Array(0), ciphertext },
  };
}

function writeMessageB(
  hs: HandshakeState,
  payload: Uint8Array,
): {
  hs: HandshakeState;
  messageBuffer: MessageBuffer;
  error?: Error;
} {
  hs.e = generateKeypair();
  const ne = hs.e.publicKey;
  mixHash(hs.ss, ne);

  mixKey(hs.ss, dh(hs.e.privateKey, hs.re));

  const spk = new Uint8Array(hs.s.publicKey);
  let result1 = encryptAndHash(hs.ss, spk);
  hs.ss = result1.ss;
  if (result1.error) {
    return {
      hs,
      messageBuffer: {
        ne: new Uint8Array(32),
        ns: new Uint8Array(0),
        ciphertext: new Uint8Array(0),
      },
      error: result1.error,
    };
  }
  const ns = result1.ciphertext;

  mixKey(hs.ss, dh(hs.s.privateKey, hs.re));

  const result2 = encryptAndHash(hs.ss, payload);
  hs.ss = result2.ss;
  if (result2.error) {
    return {
      hs,
      messageBuffer: {
        ne: new Uint8Array(32),
        ns: new Uint8Array(0),
        ciphertext: new Uint8Array(0),
      },
      error: result2.error,
    };
  }

  return {
    hs,
    messageBuffer: { ne, ns, ciphertext: result2.ciphertext },
  };
}

function writeMessageC(
  hs: HandshakeState,
  payload: Uint8Array,
): {
  h: Uint8Array;
  messageBuffer: MessageBuffer;
  cs1: CipherState;
  cs2: CipherState;
  error?: Error;
} {
  const spk = new Uint8Array(hs.s.publicKey);
  let result1 = encryptAndHash(hs.ss, spk);
  hs.ss = result1.ss;

  if (result1.error) {
    const [cs1, cs2] = split(hs.ss);
    return {
      h: hs.ss.h,
      messageBuffer: {
        ne: new Uint8Array(32),
        ns: new Uint8Array(0),
        ciphertext: new Uint8Array(0),
      },
      cs1,
      cs2,
      error: result1.error,
    };
  }
  const ns = result1.ciphertext;

  mixKey(hs.ss, dh(hs.s.privateKey, hs.re));

  const result2 = encryptAndHash(hs.ss, payload);
  hs.ss = result2.ss;

  const [cs1, cs2] = split(hs.ss);

  if (result2.error) {
    return {
      h: hs.ss.h,
      messageBuffer: {
        ne: new Uint8Array(32),
        ns: new Uint8Array(0),
        ciphertext: new Uint8Array(0),
      },
      cs1,
      cs2,
      error: result2.error,
    };
  }

  return {
    h: hs.ss.h,
    messageBuffer: {
      ne: new Uint8Array(32),
      ns,
      ciphertext: result2.ciphertext,
    },
    cs1,
    cs2,
  };
}

function writeMessageRegular(
  cs: CipherState,
  payload: Uint8Array,
): {
  cs: CipherState;
  messageBuffer: MessageBuffer;
  error?: Error;
} {
  const result = encryptWithAd(cs, new Uint8Array(0), payload);

  if (result.error) {
    return {
      cs: result.cs,
      messageBuffer: {
        ne: new Uint8Array(32),
        ns: new Uint8Array(0),
        ciphertext: new Uint8Array(0),
      },
      error: result.error,
    };
  }

  return {
    cs: result.cs,
    messageBuffer: {
      ne: new Uint8Array(32),
      ns: new Uint8Array(0),
      ciphertext: result.ciphertext,
    },
  };
}

function readMessageA(
  hs: HandshakeState,
  message: MessageBuffer,
): {
  hs: HandshakeState;
  plaintext: Uint8Array;
  valid: boolean;
  error?: Error;
} {
  let valid1 = true;
  if (validatePublicKey(message.ne)) {
    hs.re = message.ne;
  }
  mixHash(hs.ss, hs.re);

  const result = decryptAndHash(hs.ss, message.ciphertext);
  hs.ss = result.ss;

  return {
    hs,
    plaintext: result.plaintext,
    valid: valid1 && result.valid,
    error: result.error,
  };
}

function readMessageB(
  hs: HandshakeState,
  message: MessageBuffer,
): {
  hs: HandshakeState;
  plaintext: Uint8Array;
  valid: boolean;
  error?: Error;
} {
  let valid1 = true;
  if (validatePublicKey(message.ne)) {
    hs.re = message.ne;
  }
  mixHash(hs.ss, hs.re);

  mixKey(hs.ss, dh(hs.e.privateKey, hs.re));

  const result1 = decryptAndHash(hs.ss, message.ns);
  hs.ss = result1.ss;

  if (result1.error) {
    return {
      hs,
      plaintext: new Uint8Array(0),
      valid: false,
      error: result1.error,
    };
  }

  if (
    result1.valid &&
    result1.plaintext.length === 32 &&
    validatePublicKey(result1.plaintext)
  ) {
    hs.rs = result1.plaintext;
  }

  mixKey(hs.ss, dh(hs.e.privateKey, hs.rs));

  const result2 = decryptAndHash(hs.ss, message.ciphertext);
  hs.ss = result2.ss;

  return {
    hs,
    plaintext: result2.plaintext,
    valid: result1.valid && result2.valid,
    error: result2.error,
  };
}

function readMessageC(
  hs: HandshakeState,
  message: MessageBuffer,
): {
  h: Uint8Array;
  plaintext: Uint8Array;
  valid: boolean;
  cs1: CipherState;
  cs2: CipherState;
  error?: Error;
} {
  const result1 = decryptAndHash(hs.ss, message.ns);
  hs.ss = result1.ss;

  if (result1.error) {
    const [cs1, cs2] = split(hs.ss);
    return {
      h: hs.ss.h,
      plaintext: new Uint8Array(0),
      valid: false,
      cs1,
      cs2,
      error: result1.error,
    };
  }

  if (
    result1.valid &&
    result1.plaintext.length === 32 &&
    validatePublicKey(result1.plaintext)
  ) {
    hs.rs = result1.plaintext;
  }

  mixKey(hs.ss, dh(hs.e.privateKey, hs.rs));

  const result2 = decryptAndHash(hs.ss, message.ciphertext);
  hs.ss = result2.ss;

  const [cs1, cs2] = split(hs.ss);

  return {
    h: hs.ss.h,
    plaintext: result2.plaintext,
    valid: result1.valid && result2.valid,
    cs1,
    cs2,
    error: result2.error,
  };
}

function readMessageRegular(
  cs: CipherState,
  message: MessageBuffer,
): {
  cs: CipherState;
  plaintext: Uint8Array;
  valid: boolean;
  error?: Error;
} {
  const result = decryptWithAd(cs, new Uint8Array(0), message.ciphertext);

  return {
    cs: result.cs,
    plaintext: result.plaintext,
    valid: result.valid,
    error: result.error,
  };
}

/* ---------------------------------------------------------------- *
 * PROCESSES                                                        *
 * ---------------------------------------------------------------- */

export function initSession(
  initiator: boolean,
  prologue: Uint8Array,
  s: KeyPair,
  rs: Uint8Array,
): NoiseSession {
  const psk = new Uint8Array(EMPTY_KEY);
  const hs = initiator
    ? initializeInitiator(prologue, s, rs, psk)
    : initializeResponder(prologue, s, rs, psk);

  return {
    hs,
    h: new Uint8Array(32),
    cs1: initializeKey(new Uint8Array(32)),
    cs2: initializeKey(new Uint8Array(32)),
    mc: 0,
    i: initiator,
  };
}

export function sendMessage(
  session: NoiseSession,
  message: Uint8Array,
): {
  session: NoiseSession;
  messageBuffer: MessageBuffer;
  error?: Error;
} {
  let messageBuffer: MessageBuffer;
  let error: Error | undefined;

  if (session.mc === 0) {
    const result = writeMessageA(session.hs, message);
    session.hs = result.hs;
    messageBuffer = result.messageBuffer;
    error = result.error;
  } else if (session.mc === 1) {
    const result = writeMessageB(session.hs, message);
    session.hs = result.hs;
    messageBuffer = result.messageBuffer;
    error = result.error;
  } else if (session.mc === 2) {
    const result = writeMessageC(session.hs, message);
    session.h = result.h;
    messageBuffer = result.messageBuffer;
    session.cs1 = result.cs1;
    session.cs2 = result.cs2;
    error = result.error;
    session.hs = {
      ss: initializeSymmetric(new Uint8Array(0)),
      s: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
      e: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
      rs: new Uint8Array(32),
      re: new Uint8Array(32),
      psk: new Uint8Array(32),
    };
  } else {
    const result = session.i
      ? writeMessageRegular(session.cs1, message)
      : writeMessageRegular(session.cs2, message);

    if (session.i) {
      session.cs1 = result.cs;
    } else {
      session.cs2 = result.cs;
    }
    messageBuffer = result.messageBuffer;
    error = result.error;
  }

  session.mc = session.mc + 1;
  return { session, messageBuffer, error };
}

export function recvMessage(
  session: NoiseSession,
  message: MessageBuffer,
): {
  session: NoiseSession;
  plaintext: Uint8Array;
  valid: boolean;
  error?: Error;
} {
  let plaintext: Uint8Array;
  let valid: boolean;
  let error: Error | undefined;

  if (session.mc === 0) {
    const result = readMessageA(session.hs, message);
    session.hs = result.hs;
    plaintext = result.plaintext;
    valid = result.valid;
    error = result.error;
  } else if (session.mc === 1) {
    const result = readMessageB(session.hs, message);
    session.hs = result.hs;
    plaintext = result.plaintext;
    valid = result.valid;
    error = result.error;
  } else if (session.mc === 2) {
    const result = readMessageC(session.hs, message);
    session.h = result.h;
    plaintext = result.plaintext;
    valid = result.valid;
    session.cs1 = result.cs1;
    session.cs2 = result.cs2;
    error = result.error;
    session.hs = {
      ss: initializeSymmetric(new Uint8Array(0)),
      s: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
      e: { publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) },
      rs: new Uint8Array(32),
      re: new Uint8Array(32),
      psk: new Uint8Array(32),
    };
  } else {
    const result = session.i
      ? readMessageRegular(session.cs2, message)
      : readMessageRegular(session.cs1, message);

    if (session.i) {
      session.cs2 = result.cs;
    } else {
      session.cs1 = result.cs;
    }
    plaintext = result.plaintext;
    valid = result.valid;
    error = result.error;
  }

  session.mc = session.mc + 1;
  return { session, plaintext, valid, error };
}

/**
 * Generate a new Noise keypair
 */
export function generateNoiseKeypair(): KeyPair {
  return generateKeypair();
}
