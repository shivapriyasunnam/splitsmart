import {getDB} from '../database';

export async function getConfig<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT value_json FROM app_config WHERE key = ?',
    [key],
  );
  if (res.rows.length === 0) return null;
  try {
    return JSON.parse(res.rows.item(0).value_json) as T;
  } catch {
    return null;
  }
}

export async function setConfig(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  const json = JSON.stringify(value);
  await db.executeSql(
    `INSERT INTO app_config (key, value_json) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
    [key, json],
  );
}

export async function deleteConfig(key: string): Promise<void> {
  const db = await getDB();
  await db.executeSql('DELETE FROM app_config WHERE key = ?', [key]);
}
