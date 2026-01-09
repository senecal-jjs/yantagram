import * as SQLite from "expo-sqlite";
import { SQLiteDatabase } from "expo-sqlite";

const DB_NAME = "bitchat.db";
let expoDb: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!expoDb) {
    expoDb = await SQLite.openDatabaseAsync(DB_NAME);

    // run migrations here if needed
    // await migrateDbIfNeeded(expoDb);
  }
  return expoDb;
}

async function migrateDb(db: SQLiteDatabase) {
  const DATABASE_VERSION = 1;

  const result = await db.getFirstAsync<{
    user_version: number;
  }>("PRAGMA user_version");

  let currentDbVersion = result?.user_version ?? 0;

  console.log(`current db version ${currentDbVersion}`);

  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentDbVersion === 0) {
    console.log("migrating");
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY NOT NULL, 
        sender TEXT NOT NULL, 
        contents TEXT NOT NULL, 
        timestamp INTEGER NOT NULL,
        group_id TEXT,
        was_read INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX idx_messages_sender ON messages(sender);
      CREATE INDEX idx_messages_group_id ON messages(group_id);
      CREATE INDEX idx_messages_was_read ON messages(was_read);

      CREATE TABLE IF NOT EXISTS fragments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fragment_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        version INTEGER NOT NULL,
        type INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        payload BLOB NOT NULL,
        allowed_hops INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000))
      );
      
      CREATE INDEX idx_fragments_fragment_id ON fragments(fragment_id);

      CREATE TABLE IF NOT EXISTS outgoing_messages (
        id TEXT PRIMARY KEY NOT NULL,
        sender TEXT NOT NULL,
        contents TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        group_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000)),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        verification_key string NOT NULL,
        pseudonym TEXT NOT NULL,
        signature string NOT NULL,
        ecdh_public_key string NOT NULL,
        verified_oob INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000)),
        updated_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000)),
        UNIQUE(verification_key)
      );
      
      CREATE INDEX idx_contacts_pseudonym ON contacts(pseudonym);

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        admin INTEGER NOT NULL DEFAULT 0,
        last_active_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000)),
        created_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000)),
        updated_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000))
      );
      
      CREATE INDEX idx_groups_name ON groups(name);
      CREATE INDEX idx_groups_last_active_at ON groups(last_active_at);

      CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        contact_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000)),
        PRIMARY KEY (group_id, contact_id),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      );
      
      CREATE INDEX idx_group_members_group_id ON group_members(group_id);
      CREATE INDEX idx_group_members_contact_id ON group_members(contact_id);

      CREATE TABLE IF NOT EXISTS incoming_packets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        type INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        payload BLOB NOT NULL,
        payload_hash number,
        allowed_hops INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000))
      );
      
      CREATE INDEX idx_incoming_packets_timestamp ON incoming_packets(timestamp);
      CREATE INDEX idx_incoming_packets_type ON incoming_packets(type);
      CREATE INDEX idx_incoming_packets_created_at ON incoming_packets(created_at);

      CREATE TABLE IF NOT EXISTS relay_packets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        type INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        payload BLOB NOT NULL,
        allowed_hops INTEGER NOT NULL,
        relayed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000))
      );
      
      CREATE INDEX idx_relay_packets_timestamp ON relay_packets(timestamp);
      CREATE INDEX idx_relay_packets_type ON relay_packets(type);
      CREATE INDEX idx_relay_packets_created_at ON relay_packets(created_at);
      CREATE INDEX idx_relay_packets_relayed ON relay_packets(relayed);

      CREATE TABLE IF NOT EXISTS connected_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_uuid TEXT NOT NULL UNIQUE,
        last_seen_rssi INTEGER,
        is_connected INTEGER NOT NULL DEFAULT 0,
        last_seen_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000)),
        created_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000)),
        updated_at INTEGER NOT NULL DEFAULT (round(unixepoch('subsec') * 1000))
      );
      
      CREATE INDEX idx_connected_devices_device_uuid ON connected_devices(device_uuid);
      CREATE INDEX idx_connected_devices_is_connected ON connected_devices(is_connected);
      CREATE INDEX idx_connected_devices_last_seen_at ON connected_devices(last_seen_at);
`);
    currentDbVersion = 1;
  }

  // if (currentDbVersion === 2) {
  //   Add more migrations
  // }
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export { getDB, migrateDb };
