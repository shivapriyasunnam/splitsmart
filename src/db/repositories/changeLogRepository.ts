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

// Called inside a transaction
export async function writeChangeLog(
  tx: any,
  entityType: EntityType,
  entityId: string,
  operation: ChangeOperation,
  record: object,
): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const id = uuidv4();
  const seq = await getNextSequence();
  await tx.executeSql(
    `INSERT INTO change_log (id, entity_type, entity_id, operation, record_json, local_sequence, created_at, uploaded_at, package_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [id, entityType, entityId, operation, JSON.stringify(record), seq, now],
  );
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
