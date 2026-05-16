import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {Expense} from '../../types';
import {writeChangeLog} from './changeLogRepository';
import {getConfig} from './configRepository';

export interface ExpenseFilters {
  monthKey?: string;
  categoryId?: string;
  paidByMemberId?: string;
}

export async function getExpenses(filters?: ExpenseFilters): Promise<Expense[]> {
  const db = await getDB();
  let sql = 'SELECT * FROM expenses WHERE deleted_at IS NULL';
  const params: string[] = [];

  if (filters?.monthKey) {
    sql += " AND strftime('%Y-%m', expense_date) = ?";
    params.push(filters.monthKey);
  }
  if (filters?.categoryId) {
    sql += ' AND category_id = ?';
    params.push(filters.categoryId);
  }
  if (filters?.paidByMemberId) {
    sql += ' AND paid_by_member_id = ?';
    params.push(filters.paidByMemberId);
  }

  sql += ' ORDER BY expense_date DESC, created_at DESC';
  const [res] = await db.executeSql(sql, params);
  const items: Expense[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    items.push(res.rows.item(i));
  }
  return items;
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  if (res.rows.length === 0) return null;
  return res.rows.item(0);
}

export async function createExpense(
  data: Omit<Expense, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'created_by_device_id'>,
): Promise<Expense> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const id = uuidv4();
  const deviceConfig = await getConfig<{deviceId: string}>('device');
  const deviceId = deviceConfig?.deviceId ?? 'unknown';

  const expense: Expense = {
    ...data,
    id,
    created_by_device_id: deviceId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.transaction(async tx => {
    await tx.executeSql(
      `INSERT INTO expenses (id, title, note, amount_minor, currency, expense_date, category_id, paid_by_member_id,
        split_type, split_payload_json, created_by_device_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        expense.id, expense.title, expense.note ?? null, expense.amount_minor,
        expense.currency, expense.expense_date, expense.category_id,
        expense.paid_by_member_id, expense.split_type, expense.split_payload_json,
        expense.created_by_device_id, expense.created_at, expense.updated_at,
      ],
    );
    await writeChangeLog(tx, 'expense', id, 'upsert', expense);
  });

  return expense;
}

export async function updateExpense(
  id: string,
  data: Partial<Omit<Expense, 'id' | 'created_at' | 'created_by_device_id'>>,
): Promise<Expense | null> {
  const db = await getDB();
  const now = dayjs().toISOString();
  data.updated_at = now;

  const fields = Object.keys(data)
    .map(k => `${k} = ?`)
    .join(', ');
  const values = [...Object.values(data), id];

  await db.transaction(async tx => {
    await tx.executeSql(`UPDATE expenses SET ${fields} WHERE id = ?`, values);
    const updated = await getExpenseById(id);
    if (updated) {
      await writeChangeLog(tx, 'expense', id, 'upsert', updated);
    }
  });

  return getExpenseById(id);
}

export async function softDeleteExpense(id: string): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();
  await db.transaction(async tx => {
    await tx.executeSql(
      'UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [now, now, id],
    );
    const expense = await db.executeSql(
      'SELECT * FROM expenses WHERE id = ?',
      [id],
    );
    const row = expense[0].rows.item(0);
    if (row) {
      await writeChangeLog(tx, 'expense', id, 'delete', row);
    }
  });
}

export async function getMonthlyTotal(monthKey: string): Promise<number> {
  const db = await getDB();
  const [res] = await db.executeSql(
    "SELECT COALESCE(SUM(amount_minor), 0) as total FROM expenses WHERE deleted_at IS NULL AND strftime('%Y-%m', expense_date) = ?",
    [monthKey],
  );
  return res.rows.item(0).total;
}
