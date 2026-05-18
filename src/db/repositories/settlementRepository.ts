import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {Settlement} from '../../types';
import {writeChangeLogInTx, getNextChangeLogSequence} from './changeLogRepository';

export async function getSettlements(): Promise<Settlement[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM settlements WHERE deleted_at IS NULL ORDER BY settlement_date DESC',
  );
  const items: Settlement[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    items.push(res.rows.item(i));
  }
  return items;
}

export async function createSettlement(
  data: Omit<Settlement, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>,
): Promise<Settlement> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const id = uuidv4();
  const settlement: Settlement = {...data, id, created_at: now, updated_at: now, deleted_at: null};

  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql(
      `INSERT INTO settlements (id, amount_minor, paid_by_member_id, received_by_member_id, settlement_date, note, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [id, data.amount_minor, data.paid_by_member_id, data.received_by_member_id, data.settlement_date, data.note ?? null, now, now],
    );
    writeChangeLogInTx(tx, 'settlement', id, 'upsert', settlement, seq);
  });

  return settlement;
}

export async function softDeleteSettlement(id: string): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql(
      'UPDATE settlements SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [now, now, id],
    );
    writeChangeLogInTx(tx, 'settlement', id, 'delete', {id, deleted_at: now}, seq);
  });
}
