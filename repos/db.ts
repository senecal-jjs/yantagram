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

  let { user_version: currentDbVersion } = await db.getFirstAsync<{
    user_version: number;
  }>("PRAGMA user_version");

  console.log(`current db version ${currentDbVersion}`);

  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentDbVersion === 0) {
    console.log("migrating");
    await db.execAsync(`
PRAGMA journal_mode = 'wal';
CREATE TABLE messages (id TEXT PRIMARY KEY NOT NULL, sender TEXT NOT NULL, contents TEXT NOT NULL, timestamp INTEGER NOT NULL, is_relay INTEGER NOT NULL, original_sender TEXT, is_private INTEGER NOT NULL, recipient_nickname TEXT, sender_peer_id TEXT, delivery_status INTEGER);
`);
    currentDbVersion = 1;
  }
  // if (currentDbVersion === 1) {
  //   Add more migrations
  // }
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export { getDB, migrateDb };
