import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {Budget} from '../../types';
import {writeChangeLog} from './changeLogRepository';

export async function getBudgets(monthKey?: string): Promise<Budget[]> {
  const db = await getDB();
  let sql = 'SELECT * FROM budgets WHERE deleted_at IS NULL';
  const params: string[] = [];
  if (monthKey) {
    sql += ' AND month_key = ?';
    params.push(monthKey);
  }
  sql += ' ORDER BY month_key DESC';
  const [res] = await db.executeSql(sql, params);
  const items: Budget[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    items.push(res.rows.item(i));
  }
  return items;
}

export async function setBudget(
  monthKey: string,
  categoryId: string,
  amountMinor: number,
): Promise<Budget> {
  const db = await getDB();
  const now = dayjs().toISOString();

  // Check if budget exists for this month+category
  const [existing] = await db.executeSql(
    'SELECT * FROM budgets WHERE month_key = ? AND category_id = ? AND deleted_at IS NULL',
    [monthKey, categoryId],
  );

  let budget: Budget;

  if (existing.rows.length > 0) {
    const id = existing.rows.item(0).id;
    budget = {...existing.rows.item(0), amount_minor: amountMinor, updated_at: now};
    await db.transaction(async tx => {
      await tx.executeSql(
        'UPDATE budgets SET amount_minor = ?, updated_at = ? WHERE id = ?',
        [amountMinor, now, id],
      );
      await writeChangeLog(tx, 'budget', id, 'upsert', budget);
    });
  } else {
    const id = uuidv4();
    budget = {id, month_key: monthKey, category_id: categoryId, amount_minor: amountMinor, created_at: now, updated_at: now, deleted_at: null};
    await db.transaction(async tx => {
      await tx.executeSql(
        `INSERT INTO budgets (id, month_key, category_id, amount_minor, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [id, monthKey, categoryId, amountMinor, now, now],
      );
      await writeChangeLog(tx, 'budget', id, 'upsert', budget);
    });
  }

  return budget;
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();
  await db.transaction(async tx => {
    await tx.executeSql(
      'UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [now, now, id],
    );
    await writeChangeLog(tx, 'budget', id, 'delete', {id, deleted_at: now});
  });
}

export async function getCategorySpend(
  monthKey: string,
): Promise<Record<string, number>> {
  const db = await getDB();
  const [res] = await db.executeSql(
    `SELECT category_id, COALESCE(SUM(amount_minor), 0) as total
     FROM expenses
     WHERE deleted_at IS NULL AND strftime('%Y-%m', expense_date) = ?
     GROUP BY category_id`,
    [monthKey],
  );
  const result: Record<string, number> = {};
  for (let i = 0; i < res.rows.length; i++) {
    const row = res.rows.item(i);
    result[row.category_id] = row.total;
  }
  return result;
}
