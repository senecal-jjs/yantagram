/**
 * UPKE (Updatable Public Key Encryption) implementation for TreeKEM
 * Uses Ristretto255 (Curve25519), Ed25519, RSA, and AES-256-GCM
 */

import ByteArrayBuilder from "@/utils/byte-array-builder";
import { gcm } from "@noble/ciphers/aes.js";
import { ed25519, ristretto255, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { getRandomBytes } from "expo-crypto";
import { AnnouncePayload } from "./protocol";
import { RistrettoPoint } from "./RistrettoPoint";
import { Scalar } from "./scalar";
import { Ciphertext } from "./types";

/**
 * Secret key in UPKE scheme (Scalar)
 */
export class SecretKey {
  private scalar: Scalar;

  constructor(scalar: Scalar) {
    this.scalar = scalar;
  }

  static new(): SecretKey {
    // Use ed25519.utils.randomPrivateKey() which returns a proper 32-byte secret key
    // This is already in the valid range and properly formatted
    const randomScalar = ed25519.utils.randomSecretKey();
    return new SecretKey(Scalar.fromBytes(randomScalar));
  }

  static fromBytesModOrder(bytes: Uint8Array): SecretKey {
    if (bytes.length !== 32) {
      throw new Error(
        `Cannot construct secret key from bytes. Must have length 32, but length was ${bytes.length}`,
      );
    }
    return new SecretKey(Scalar.fromBytes(bytes));
  }

  getScalar(): Scalar {
    return this.scalar;
  }

  toBytes(): Uint8Array {
    return this.scalar.toBytes();
  }

  /**
   * Decrypt UPKE ciphertext
   * Returns plaintext and new secret key
   */
  decrypt(ciphertext: Ciphertext): {
    message: Uint8Array;
    newSecretKey: SecretKey;
  } {
    // Reconstruct the Ristretto point from ciphertext
    const c1 = ristretto255.Point.fromBytes(ciphertext.point);

    // Compute shared secret: sk * c1
    const sharedSecret = c1.multiply(this.scalar.getValue());

    // Hash the shared secret
    const hashed = sha512(sharedSecret.toBytes());

    // XOR to decrypt message (first 32 bytes)
    const message = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      message[i] = hashed[i] ^ ciphertext.data[i];
    }

    // XOR to decrypt delta (remaining bytes)
    const delta = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      delta[i] = hashed[32 + i] ^ ciphertext.data[32 + i];
    }

    // Update secret key
    const deltaScalar = Scalar.fromBytes(delta);

    const newSk = this.scalar.getValue() + deltaScalar.getValue();

    return {
      message,
      newSecretKey: new SecretKey(new Scalar(newSk)),
    };
  }
}

/**
 * Public key in UPKE scheme (Ristretto point)
 */
export class PublicKey {
  private point: RistrettoPoint;

  constructor(point: RistrettoPoint) {
    this.point = point;
  }

  static fromSecretKey(sk: SecretKey): PublicKey {
    const basePoint = ristretto255.Point.BASE;
    const point = basePoint.multiply(sk.getScalar().getValue());
    return new PublicKey(new RistrettoPoint(point.toHex()));
  }

  static fromBytesModOrder(bytes: Uint8Array): PublicKey {
    const point = RistrettoPoint.fromBytes(bytes);
    return new PublicKey(point);
  }

  toBytes(): Uint8Array {
    return this.point.toBytes();
  }

  /**
   * Encrypt message using UPKE
   * Returns ciphertext and new public key
   */
  encrypt(message: Uint8Array): {
    ciphertext: Ciphertext;
    newPublicKey: PublicKey;
  } {
    // Generate random scalar r
    const r = Scalar.fromBytes(getRandomBytes(32));

    // c1 = r * G
    const c1 = ristretto255.Point.BASE.multiply(r.getValue());

    // Generate random delta
    const delta = Scalar.fromBytes(getRandomBytes(32));

    // Combine message and delta
    const combined = new Uint8Array(64);
    combined.set(message, 0);
    combined.set(delta.toBytes(), 32);

    // Compute shared secret: r * pk
    const sharedSecret = ristretto255.Point.fromHex(
      this.point.getHex(),
    ).multiply(r.getValue());

    // Hash the shared secret
    const hashed = sha512(sharedSecret.toBytes());

    // XOR to encrypt
    const c2 = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      c2[i] = hashed[i] ^ combined[i];
    }

    // New public key: pk + delta * G
    const deltaPoint = ristretto255.Point.BASE.multiply(delta.getValue());
    const newPoint = ristretto255.Point.fromHex(this.point.getHex()).add(
      deltaPoint,
    );

    return {
      ciphertext: {
        point: c1.toBytes(),
        data: c2,
      },
      newPublicKey: new PublicKey(new RistrettoPoint(newPoint.toHex())),
    };
  }
}

/**
 * UPKE key pair material
 */
export class UPKEMaterial {
  publicKey: PublicKey;
  privateKey: SecretKey;

  constructor(publicKey: PublicKey, privateKey: SecretKey) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  static generate(): UPKEMaterial {
    const sk = SecretKey.new();
    const pk = PublicKey.fromSecretKey(sk);
    return new UPKEMaterial(pk, sk);
  }

  static updatePublic(newPk: PublicKey, oldPk: PublicKey): PublicKey {
    const newPoint = ristretto255.Point.fromBytes(newPk.toBytes()); // RistrettoPoint.fromHex(newPk.toBytes());
    const oldPoint = ristretto255.Point.fromBytes(oldPk.toBytes()); // RistrettoPoint.fromHex(oldPk.toBytes());
    const addedPoint = newPoint.add(oldPoint);
    return new PublicKey(RistrettoPoint.fromBytes(addedPoint.toBytes()));
  }

  static updatePrivate(newSk: SecretKey, oldSk: SecretKey): SecretKey {
    const newScalar = Scalar.fromBytes(newSk.toBytes());
    const oldScalar = Scalar.fromBytes(oldSk.toBytes());
    return new SecretKey(
      new Scalar(newScalar.getValue() + oldScalar.getValue()),
    );
  }
}

/**
 * Ed25519 signature material
 */
export class SignatureMaterial {
  publicKey: Uint8Array;
  privateKey: Uint8Array;

  constructor(publicKey: Uint8Array, privateKey: Uint8Array) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  static generate(): SignatureMaterial {
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);
    return new SignatureMaterial(publicKey, privateKey);
  }

  sign(message: Uint8Array): Uint8Array {
    return ed25519.sign(message, this.privateKey);
  }

  static verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean {
    return ed25519.verify(signature, message, publicKey);
  }
}

/**
 * Create the message to be signed for announce verification.
 * Combines verificationKey + pseudonym + timestamp to prevent tampering.
 */
export function createAnnounceSigningMessage(
  verificationKey: Uint8Array,
  pseudonym: string,
  timestamp: number,
): Uint8Array {
  const encoder = new TextEncoder();
  const builder = new ByteArrayBuilder();

  builder.append(verificationKey);
  builder.append(encoder.encode(pseudonym));

  // Add timestamp as 8 bytes
  const timestampBytes = new Uint8Array(8);
  const view = new DataView(timestampBytes.buffer);
  view.setBigUint64(0, BigInt(timestamp), false);
  builder.append(timestampBytes);

  return builder.build();
}

/**
 * Verify an announce payload's signature
 * Returns true if the announce signature is valid (proving the pseudonym wasn't tampered with)
 */
export function verifyAnnouncePayload(payload: AnnouncePayload): boolean {
  const signingMessage = createAnnounceSigningMessage(
    payload.credentials.verificationKey,
    payload.credentials.pseudonym,
    payload.timestamp,
  );

  return SignatureMaterial.verify(
    signingMessage,
    payload.announceSignature,
    payload.credentials.verificationKey,
  );
}

/**
 * RSA key pair (placeholder - needs native implementation)
 */
export class ECDHKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;

  constructor(publicKey: Uint8Array, privateKey: Uint8Array) {
    this.publicKey = publicKey;
    this.privateKey = privateKey;
  }

  static generate(): ECDHKeyPair {
    // X25519 uses 32-byte keys
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    return new ECDHKeyPair(publicKey, privateKey);
  }

  async encrypt(data: Uint8Array): Promise<Uint8Array> {
    // Generate ephemeral keypair for ECDH
    const ephemeralPrivate = ed25519.utils.randomSecretKey();
    const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);

    // Compute shared secret: ephemeralPrivate * theirPublic
    const sharedSecret = x25519.getSharedSecret(
      ephemeralPrivate,
      this.publicKey,
    );

    // Derive encryption key using HKDF
    const key = hkdf(
      sha256,
      sharedSecret,
      undefined,
      new Uint8Array([0x01]),
      32,
    );

    // Encrypt with AES-256-GCM
    const nonce = getRandomBytes(12);
    const aes = gcm(key, nonce);
    const ciphertext = aes.encrypt(data);

    // Return: ephemeralPublic || nonce || ciphertext
    const result = new Uint8Array(32 + 12 + ciphertext.length);
    result.set(ephemeralPublic, 0);
    result.set(nonce, 32);
    result.set(ciphertext, 44);

    return result;
  }

  async decrypt(encryptedData: Uint8Array): Promise<Uint8Array> {
    // Parse: ephemeralPublic || nonce || ciphertext
    const ephemeralPublic = encryptedData.slice(0, 32);
    const nonce = encryptedData.slice(32, 44);
    const ciphertext = encryptedData.slice(44);

    // Compute shared secret: ourPrivate * ephemeralPublic
    const sharedSecret = x25519.getSharedSecret(
      this.privateKey,
      ephemeralPublic,
    );

    // Derive decryption key
    const key = hkdf(
      sha256,
      sharedSecret,
      undefined,
      new Uint8Array([0x01]),
      32,
    );

    // Decrypt
    const aes = gcm(key, nonce);
    return aes.decrypt(ciphertext);
  }
}

/**
 * Path secret operations for update paths
 */
export class PathSecret {
  static newPathSecret(): Uint8Array {
    return getRandomBytes(32);
  }

  static deriveKeyPair(pathSecret: Uint8Array): UPKEMaterial {
    const info = new Uint8Array([
      0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9,
    ]);
    const okm = hkdf(sha256, pathSecret, undefined, info, 32);

    const privateKey = SecretKey.fromBytesModOrder(okm);
    const publicKey = PublicKey.fromSecretKey(privateKey);

    return new UPKEMaterial(publicKey, privateKey);
  }

  static updateWithPathSecret(
    pathSecret: Uint8Array,
    oldPublicKey: PublicKey,
    oldPrivateKey: SecretKey,
  ): UPKEMaterial {
    const info = new Uint8Array([
      0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9,
    ]);
    const okm = hkdf(sha256, pathSecret, undefined, info, 32);

    const newPrivateKey = SecretKey.fromBytesModOrder(okm);
    const newPublicKey = PublicKey.fromSecretKey(newPrivateKey);

    // Combine old and new keys
    const combinedPrivate = UPKEMaterial.updatePrivate(
      newPrivateKey,
      oldPrivateKey,
    );
    const combinedPublic = UPKEMaterial.updatePublic(
      newPublicKey,
      oldPublicKey,
    );

    return new UPKEMaterial(combinedPublic, combinedPrivate);
  }

  static update(
    pathSecrets: UPKEMaterial,
    oldPublicKey: PublicKey,
    oldPrivateKey: SecretKey,
  ): UPKEMaterial {
    const newPublic = UPKEMaterial.updatePublic(
      pathSecrets.publicKey,
      oldPublicKey,
    );
    const newPrivate = UPKEMaterial.updatePrivate(
      pathSecrets.privateKey,
      oldPrivateKey,
    );
    return new UPKEMaterial(newPublic, newPrivate);
  }

  static updatePublic(newPk: PublicKey, oldPk: PublicKey): PublicKey {
    return UPKEMaterial.updatePublic(newPk, oldPk);
  }

  static updatePrivate(newSk: SecretKey, oldSk: SecretKey): SecretKey {
    return UPKEMaterial.updatePrivate(newSk, oldSk);
  }
}

/**
 * Node secret derivation
 */
export class NodeSecret {
  static derive(pk: PublicKey, sk: SecretKey): Uint8Array {
    const pkBytes = pk.toBytes();
    const skBytes = sk.toBytes();

    const nodeSecret = new Uint8Array(pkBytes.length + skBytes.length);
    nodeSecret.set(pkBytes, 0);
    nodeSecret.set(skBytes, pkBytes.length);

    return nodeSecret;
  }
}

/**
 * Symmetric key operations using AES-256-GCM
 */
export class SymmetricKey {
  static derive(nodeSecret: Uint8Array): Uint8Array {
    const hashed = sha512(nodeSecret);
    const info = new Uint8Array([
      0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9,
    ]);
    return hkdf(sha512, hashed, undefined, info, 32);
  }

  static deriveMessageKey(
    nodeSecret: Uint8Array,
    messageCounter: number,
  ): Uint8Array {
    let key = sha512(nodeSecret);

    // Ratchet forward based on message counter
    for (let i = 0; i < messageCounter; i++) {
      key = sha512(key);
    }

    const info = new Uint8Array([
      0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9,
    ]);
    return hkdf(sha512, key, undefined, info, 32);
  }

  static encrypt(
    message: Uint8Array,
    key: Uint8Array,
  ): { ciphertext: Uint8Array; nonce: Uint8Array } {
    const nonce = getRandomBytes(12);
    const aes = gcm(key, nonce);
    const cipherText = aes.encrypt(message);
    return {
      ciphertext: cipherText,
      nonce,
    };
  }

  static decrypt(
    ciphertext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array,
  ): Uint8Array {
    const aes = gcm(key, nonce);
    return aes.decrypt(ciphertext);
  }
}
