import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {ChangeLogEntry, EntityType, ChangeOperation} from '../../types';

let sequenceCounter = 0;

async function getNextSequence(): Promise<number> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT COALESCE(MAX(local_sequence), 0) + 1 as next_seq FROM change_log',
  );
  return res.rows.item(0).next_seq;
}

/**
 * Write a change log entry inside an existing transaction.
 * Uses a pre-fetched sequence number to avoid calling db.executeSql
 * inside the transaction (which deadlocks with react-native-sqlite-storage).
 * Call getNextChangeLogSequence() BEFORE opening the transaction and pass it here.
 */
export async function getNextChangeLogSequence(): Promise<number> {
  return getNextSequence();
}

/**
 * Queue a change log INSERT inside a transaction callback.
 *
 * IMPORTANT: react-native-sqlite-storage does NOT await async transaction
 * callbacks. All tx.executeSql calls inside a transaction must be queued
 * synchronously (without await) so they are included before the transaction
 * commits. Call this function directly — do NOT await it — from a non-async
 * transaction callback. seq must be fetched before the transaction opens via
 * getNextChangeLogSequence().
 */
export function writeChangeLogInTx(
  tx: any,
  entityType: EntityType,
  entityId: string,
  operation: ChangeOperation,
  record: object,
  seq: number,
): void {
  const now = dayjs().toISOString();
  const id = uuidv4();
  tx.executeSql(
    `INSERT INTO change_log (id, entity_type, entity_id, operation, record_json, local_sequence, created_at, uploaded_at, package_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [id, entityType, entityId, operation, JSON.stringify(record), seq, now],
  );
}

/** @deprecated Use writeChangeLogInTx with a non-async transaction callback. */
export async function writeChangeLog(
  tx: any,
  entityType: EntityType,
  entityId: string,
  operation: ChangeOperation,
  record: object,
  seq?: number,
): Promise<void> {
  writeChangeLogInTx(tx, entityType, entityId, operation, record, seq ?? (await getNextSequence()));
}

export async function getUnsyncedChanges(): Promise<ChangeLogEntry[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM change_log WHERE uploaded_at IS NULL ORDER BY local_sequence ASC',
  );
  const items: ChangeLogEntry[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    items.push(res.rows.item(i));
  }
  return items;
}

export async function markChangesAsUploaded(
  ids: string[],
  packageId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const now = dayjs().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await db.executeSql(
    `UPDATE change_log SET uploaded_at = ?, package_id = ? WHERE id IN (${placeholders})`,
    [now, packageId, ...ids],
  );
}

export async function getChangeLogRange(
  fromSeq: number,
  toSeq: number,
): Promise<ChangeLogEntry[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM change_log WHERE local_sequence >= ? AND local_sequence <= ? ORDER BY local_sequence ASC',
    [fromSeq, toSeq],
  );
  const items: ChangeLogEntry[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    items.push(res.rows.item(i));
  }
  return items;
}

/**
 * Get all change log entries with local_sequence > afterSequence.
 * Used by Bluetooth sync to build packages from a cursor, without touching Drive upload state.
 */
export async function getChangesAfterSequence(
  afterSequence: number,
): Promise<ChangeLogEntry[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM change_log WHERE local_sequence > ? ORDER BY local_sequence ASC',
    [afterSequence],
  );
  const items: ChangeLogEntry[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    items.push(res.rows.item(i));
  }
  return items;
}
