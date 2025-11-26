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
        is_relay INTEGER NOT NULL, 
        original_sender TEXT,
        is_private INTEGER NOT NULL,
        recipient_nickname TEXT,
        sender_peer_id TEXT,
        delivery_status INTEGER
      );

      CREATE TABLE IF NOT EXISTS fragments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fragment_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        version INTEGER NOT NULL,
        type INTEGER NOT NULL,
        sender_id TEXT NOT NULL,
        recipient_id TEXT,
        timestamp INTEGER NOT NULL,
        payload BLOB NOT NULL,
        signature TEXT,
        allowed_hops INTEGER NOT NULL,
        route BLOB NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX idx_fragments_fragment_id ON fragments(fragment_id);

      CREATE TABLE IF NOT EXISTS outgoing_messages (
        id TEXT PRIMARY KEY NOT NULL,
        sender TEXT NOT NULL,
        contents TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        is_relay INTEGER NOT NULL,
        original_sender TEXT,
        is_private INTEGER NOT NULL,
        recipient_nickname TEXT,
        sender_peer_id TEXT,
        delivery_status INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
`);
    currentDbVersion = 1;
  }
  // if (currentDbVersion === 1) {
  //   Add more migrations
  // }
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export { getDB, migrateDb };
