import { Credentials } from "@/treekem/types";

export interface Contact {
  id: number;
  verificationKey: Uint8Array;
  pseudonym: string;
  signature: Uint8Array;
  ecdhPublicKey: Uint8Array;
  createdAt: number;
  updatedAt: number;
}

export default interface ContactsRepository {
  create(credentials: Credentials): Promise<Contact>;
  get(id: number): Promise<Contact | null>;
  getByVerificationKey(verificationKey: Uint8Array): Promise<Contact | null>;
  getByPseudonym(pseudonym: string): Promise<Contact[]>;
  getAll(): Promise<Contact[]>;
  update(id: number, credentials: Partial<Credentials>): Promise<Contact>;
  delete(id: number): Promise<void>;
  exists(verificationKey: Uint8Array): Promise<boolean>;
}
