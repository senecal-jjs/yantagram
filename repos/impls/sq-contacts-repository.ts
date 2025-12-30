import { Credentials } from "@/treekem/types";
import { hexStringToUint8Array, uint8ArrayToHexString } from "@/utils/string";
import * as SQLite from "expo-sqlite";
import ContactsRepository, { Contact } from "../specs/contacts-repository";
import Repository from "../specs/repository";

class SQContactsRepository implements ContactsRepository, Repository {
  private db: SQLite.SQLiteDatabase;

  constructor(database: SQLite.SQLiteDatabase) {
    this.db = database;
  }

  async create(
    credentials: Credentials,
    verifiedOob: boolean,
  ): Promise<Contact> {
    const statement = await this.db.prepareAsync(
      `INSERT INTO contacts (verification_key, pseudonym, signature, ecdh_public_key, verified_oob) 
       VALUES ($verificationKey, $pseudonym, $signature, $ecdhPublicKey, $verifiedOob)`,
    );

    try {
      const result = await statement.executeAsync({
        $verificationKey: uint8ArrayToHexString(credentials.verificationKey),
        $pseudonym: credentials.pseudonym,
        $signature: uint8ArrayToHexString(credentials.signature),
        $ecdhPublicKey: uint8ArrayToHexString(credentials.ecdhPublicKey),
        $verifiedOob: verifiedOob ? 1 : 0,
      });

      const insertedId = result.lastInsertRowId;

      // Fetch the created contact
      const contact = await this.get(insertedId);
      if (!contact) {
        throw new Error("Failed to retrieve created contact");
      }

      return contact;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async get(id: number): Promise<Contact | null> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM contacts WHERE id = $id LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        verification_key: string;
        pseudonym: string;
        signature: string;
        ecdh_public_key: string;
        verified_oob: number;
        created_at: number;
        updated_at: number;
      }>({ $id: id });

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      return this.mapRowToContact(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getByVerificationKey(
    verificationKey: Uint8Array,
  ): Promise<Contact | null> {
    const hexKey = uint8ArrayToHexString(verificationKey);
    const statement = await this.db.prepareAsync(
      "SELECT * FROM contacts WHERE verification_key = $verificationKey LIMIT 1",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        verification_key: string;
        pseudonym: string;
        signature: string;
        ecdh_public_key: string;
        verified_oob: number;
        created_at: number;
        updated_at: number;
      }>({ $verificationKey: hexKey });

      const row = await result.getFirstAsync();

      if (!row) {
        return null;
      }

      return this.mapRowToContact(row);
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getByPseudonym(pseudonym: string): Promise<Contact[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM contacts WHERE pseudonym = $pseudonym",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        verification_key: string;
        pseudonym: string;
        signature: string;
        ecdh_public_key: string;
        verified_oob: number;
        created_at: number;
        updated_at: number;
      }>({ $pseudonym: pseudonym });

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToContact(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async getAll(): Promise<Contact[]> {
    const statement = await this.db.prepareAsync(
      "SELECT * FROM contacts ORDER BY created_at DESC",
    );

    try {
      const result = await statement.executeAsync<{
        id: number;
        verification_key: string;
        pseudonym: string;
        signature: string;
        ecdh_public_key: string;
        verified_oob: number;
        created_at: number;
        updated_at: number;
      }>();

      const rows = await result.getAllAsync();

      return rows.map((row) => this.mapRowToContact(row));
    } finally {
      await statement.finalizeAsync();
    }
  }

  async update(
    id: number,
    credentials: Partial<Credentials>,
  ): Promise<Contact> {
    const updates: string[] = [];
    const params: Record<string, any> = { $id: id };

    if (credentials.verificationKey !== undefined) {
      updates.push("verification_key = $verificationKey");
      params.$verificationKey = uint8ArrayToHexString(
        credentials.verificationKey,
      );
    }
    if (credentials.pseudonym !== undefined) {
      updates.push("pseudonym = $pseudonym");
      params.$pseudonym = credentials.pseudonym;
    }
    if (credentials.signature !== undefined) {
      updates.push("signature = $signature");
      params.$signature = uint8ArrayToHexString(credentials.signature);
    }
    if (credentials.ecdhPublicKey !== undefined) {
      updates.push("ecdh_public_key = $ecdhPublicKey");
      params.$ecdhPublicKey = uint8ArrayToHexString(credentials.ecdhPublicKey);
    }

    if (updates.length === 0) {
      const contact = await this.get(id);
      if (!contact) {
        throw new Error(`Contact with id ${id} not found`);
      }
      return contact;
    }

    updates.push("updated_at = strftime('%s', 'now')");

    const statement = await this.db.prepareAsync(
      `UPDATE contacts SET ${updates.join(", ")} WHERE id = $id`,
    );

    try {
      await statement.executeAsync(params);

      const contact = await this.get(id);
      if (!contact) {
        throw new Error(`Contact with id ${id} not found after update`);
      }

      return contact;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async delete(id: number): Promise<void> {
    const statement = await this.db.prepareAsync(
      "DELETE FROM contacts WHERE id = $id",
    );

    try {
      await statement.executeAsync({ $id: id });
    } finally {
      await statement.finalizeAsync();
    }
  }

  async exists(verificationKey: Uint8Array): Promise<boolean> {
    const hexKey = uint8ArrayToHexString(verificationKey);
    const statement = await this.db.prepareAsync(
      "SELECT COUNT(*) as count FROM contacts WHERE verification_key = $verificationKey",
    );

    try {
      const result = await statement.executeAsync<{ count: number }>({
        $verificationKey: hexKey,
      });

      const row = await result.getFirstAsync();

      return (row?.count ?? 0) > 0;
    } finally {
      await statement.finalizeAsync();
    }
  }

  async deleteAll(): Promise<void> {
    const statement = await this.db.prepareAsync("DELETE FROM contacts");

    try {
      await statement.executeAsync();
    } finally {
      await statement.finalizeAsync();
    }
  }

  private mapRowToContact(row: {
    id: number;
    verification_key: string;
    pseudonym: string;
    signature: string;
    ecdh_public_key: string;
    verified_oob: number;
    created_at: number;
    updated_at: number;
  }): Contact {
    return {
      id: row.id,
      verificationKey: hexStringToUint8Array(row.verification_key),
      pseudonym: row.pseudonym,
      signature: hexStringToUint8Array(row.signature),
      ecdhPublicKey: hexStringToUint8Array(row.ecdh_public_key),
      verifiedOob: row.verified_oob === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export default SQContactsRepository;
