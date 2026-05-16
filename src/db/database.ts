import SQLite, {SQLiteDatabase} from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

let db: SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLiteDatabase> {
  if (db) {
    return db;
  }
  db = await SQLite.openDatabase({
    name: 'splitsmart.db',
    location: 'default',
  });
  return db;
}

export async function closeDB(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
