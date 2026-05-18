import dayjs from 'dayjs';
import {Platform} from 'react-native';
import {getDB} from '../../../db/database';
import {saveToDownloads} from './downloadModule';

export const BACKUP_SCHEMA_VERSION = 1;

interface BackupPayload {
  schema_version: number;
  exported_at: string;
  data: {
    members: any[];
    categories: any[];
    category_rules: any[];
    expenses: any[];
    budgets: any[];
    settlements: any[];
    app_config: any[];
  };
}

async function readTable(tableName: string): Promise<any[]> {
  const db = await getDB();
  const [res] = await db.executeSql(`SELECT * FROM ${tableName}`);
  const rows: any[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    rows.push(res.rows.item(i));
  }
  return rows;
}

/**
 * Reads all data tables and returns a JSON string ready for sharing.
 * Includes soft-deleted rows so a restore produces an exact replica.
 * The change_log and sync_packages_applied tables are intentionally
 * excluded — they are device-specific sync bookkeeping, not user data.
 */
export async function exportBackup(): Promise<string> {
  const payload: BackupPayload = {
    schema_version: BACKUP_SCHEMA_VERSION,
    exported_at: dayjs().toISOString(),
    data: {
      members: await readTable('members'),
      categories: await readTable('categories'),
      category_rules: await readTable('category_rules'),
      expenses: await readTable('expenses'),
      budgets: await readTable('budgets'),
      settlements: await readTable('settlements'),
      app_config: await readTable('app_config'),
    },
  };
  return JSON.stringify(payload);
}

/**
 * Parses and validates a backup JSON string, then replaces all current data
 * with the backup contents. The sync tables (change_log, sync_packages_applied)
 * are cleared and left empty — the device will catch up via normal sync.
 */
export async function importBackup(jsonString: string): Promise<void> {
  let payload: BackupPayload;
  try {
    payload = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid backup: not valid JSON.');
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    payload.schema_version !== BACKUP_SCHEMA_VERSION ||
    typeof payload.data !== 'object' ||
    payload.data === null
  ) {
    throw new Error('Invalid backup file or unsupported version.');
  }

  const {data} = payload;
  const requiredKeys = [
    'members',
    'categories',
    'category_rules',
    'expenses',
    'budgets',
    'settlements',
    'app_config',
  ] as const;

  for (const key of requiredKeys) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Invalid backup: missing table "${key}".`);
    }
  }

  const db = await getDB();

  // Delete all rows in FK-safe order (no PRAGMA needed when ordered correctly).
  // Sync tables are cleared too — they are not restored.
  for (const table of [
    'change_log',
    'sync_packages_applied',
    'settlements',
    'expenses',
    'budgets',
    'category_rules',
    'categories',
    'members',
    'app_config',
  ]) {
    await db.executeSql(`DELETE FROM ${table}`);
  }

  // Re-insert in FK-safe order. All tx.executeSql calls must be queued
  // synchronously — react-native-sqlite-storage does not await async
  // transaction callbacks.
  await db.transaction((tx: any) => {
    for (const m of data.members) {
      tx.executeSql(
        'INSERT INTO members (id, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [m.id, m.name, m.role, m.created_at, m.updated_at],
      );
    }

    for (const c of data.categories) {
      tx.executeSql(
        'INSERT INTO categories (id, name, color, icon, is_default, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          c.id,
          c.name,
          c.color,
          c.icon,
          c.is_default ? 1 : 0,
          c.is_archived ? 1 : 0,
          c.created_at,
          c.updated_at,
        ],
      );
    }

    for (const r of data.category_rules) {
      tx.executeSql(
        'INSERT INTO category_rules (id, category_id, pattern, target_field, priority, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          r.id,
          r.category_id,
          r.pattern,
          r.target_field,
          r.priority,
          r.is_enabled ? 1 : 0,
          r.created_at,
          r.updated_at,
        ],
      );
    }

    for (const e of data.expenses) {
      tx.executeSql(
        'INSERT INTO expenses (id, title, note, amount_minor, currency, expense_date, category_id, paid_by_member_id, split_type, split_payload_json, created_by_device_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          e.id,
          e.title,
          e.note ?? null,
          e.amount_minor,
          e.currency,
          e.expense_date,
          e.category_id,
          e.paid_by_member_id,
          e.split_type,
          e.split_payload_json,
          e.created_by_device_id,
          e.created_at,
          e.updated_at,
          e.deleted_at ?? null,
        ],
      );
    }

    for (const b of data.budgets) {
      tx.executeSql(
        'INSERT INTO budgets (id, month_key, category_id, amount_minor, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          b.id,
          b.month_key,
          b.category_id,
          b.amount_minor,
          b.created_at,
          b.updated_at,
          b.deleted_at ?? null,
        ],
      );
    }

    for (const s of data.settlements) {
      tx.executeSql(
        'INSERT INTO settlements (id, amount_minor, paid_by_member_id, received_by_member_id, settlement_date, note, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          s.id,
          s.amount_minor,
          s.paid_by_member_id,
          s.received_by_member_id,
          s.settlement_date,
          s.note ?? null,
          s.created_at,
          s.updated_at,
          s.deleted_at ?? null,
        ],
      );
    }

    for (const cfg of data.app_config) {
      tx.executeSql(
        'INSERT INTO app_config (key, value_json) VALUES (?, ?)',
        [cfg.key, cfg.value_json],
      );
    }
  });
}

/**
 * Exports the backup and saves it as a .json file to the device's
 * Downloads folder (Android only). Returns the saved filename.
 */
export async function saveBackupFile(): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('saveBackupFile is only supported on Android.');
  }
  const json = await exportBackup();
  const filename = `splitsmart-backup-${dayjs().format('YYYY-MM-DD')}.json`;
  return saveToDownloads(filename, json, 'application/json');
}
