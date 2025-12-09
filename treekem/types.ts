/**
 * Shared type definitions for TreeKEM implementation
 */

export interface Credentials {
  verificationKey: Uint8Array;
  pseudonym: string;
  signature: Uint8Array;
  rsaPublicKey: string;
}

export interface SerializedCredentials {
  verificationKey: string;
  pseudonym: string;
  signature: string;
  rsaPublicKey: string;
}

export interface SerializedTree {
  groupName: string;
  publicKeys: [number, string][];
  privateKeys: [number, string][];
  credentials: [number, SerializedCredentials][]; // Map<number, SerializedCredentials>;
  capacity: number;
  threshold: number;
  admins: number[];
  actionMemberCred: Credentials;
}

export interface UpdateMessage {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export interface WelcomeMessage {
  key: Uint8Array;
  updateMessage: UpdateMessage;
}

export interface UpdateMaterial {
  ancestors: number[];
  publicPathMaterial: Uint8Array[];
  privPathMaterial: { point: Uint8Array; data: Uint8Array }[];
  publicKey: Uint8Array;
  credentials: Credentials;
}

export interface BlankMessage {
  blankedNode: number;
  encryptUnder: number;
  public?: { point: Uint8Array; data: Uint8Array };
  private?: { point: Uint8Array; data: Uint8Array };
}

export interface Ciphertext {
  point: Uint8Array;
  data: Uint8Array;
}
