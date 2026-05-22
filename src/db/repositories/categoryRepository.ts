import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {Category, CategoryRule} from '../../types';
import {resolveCategoryColor} from '../../app/theme';
import {writeChangeLogInTx, getNextChangeLogSequence} from './changeLogRepository';

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getAllCategories(): Promise<Category[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM categories WHERE is_archived = 0 ORDER BY is_default DESC, name ASC',
  );
  const items: Category[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    const row = res.rows.item(i);
    items.push({...row, color: resolveCategoryColor(row.color)});
  }
  return items;
}

export async function getCategoryById(id: string): Promise<Category | null> {
  const db = await getDB();
  const [res] = await db.executeSql('SELECT * FROM categories WHERE id = ?', [id]);
  if (res.rows.length === 0) return null;
  const row = res.rows.item(0);
  return {...row, color: resolveCategoryColor(row.color)};
}

export async function createCategory(
  name: string,
  color: string,
  icon: string,
): Promise<Category> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const id = uuidv4();
  const cat: Category = {
    id, name, color, icon,
    is_default: false, is_archived: false,
    created_at: now, updated_at: now,
  };
  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql(
      `INSERT INTO categories (id, name, color, icon, is_default, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      [id, name, color, icon, now, now],
    );
    writeChangeLogInTx(tx, 'category', id, 'upsert', cat, seq);
  });
  return cat;
}

export async function updateCategory(
  id: string,
  updates: Partial<Pick<Category, 'name' | 'color' | 'icon' | 'is_archived'>>,
): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();

  // Read the current row first so we can write a complete record into
  // change_log — the receiver's mergeService rewrites every column from the
  // payload, so partial records would clobber unspecified fields with NULL.
  const [existing] = await db.executeSql(
    'SELECT * FROM categories WHERE id = ?',
    [id],
  );
  if (existing.rows.length === 0) return;
  const current = existing.rows.item(0);

  const merged: Category = {
    ...current,
    ...updates,
    is_default: !!current.is_default,
    is_archived: updates.is_archived !== undefined ? !!updates.is_archived : !!current.is_archived,
    updated_at: now,
  };

  const fieldEntries = Object.entries(updates);
  const setClause = fieldEntries.map(([k]) => `${k} = ?`).join(', ');
  const setValues = fieldEntries.map(([, v]) =>
    typeof v === 'boolean' ? (v ? 1 : 0) : v,
  );

  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql(
      `UPDATE categories SET ${setClause}, updated_at = ? WHERE id = ?`,
      [...setValues, now, id],
    );
    writeChangeLogInTx(tx, 'category', id, 'upsert', merged, seq);
  });
}

/**
 * Archives the category (soft-delete). Synced as an `upsert` with
 * is_archived=1 because mergeService treats `delete` ops on categories as
 * no-ops — archival is the supported lifecycle.
 */
export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();

  const [existing] = await db.executeSql(
    'SELECT * FROM categories WHERE id = ?',
    [id],
  );
  if (existing.rows.length === 0) return;
  const current = existing.rows.item(0);

  const archived: Category = {
    ...current,
    is_default: !!current.is_default,
    is_archived: true,
    updated_at: now,
  };

  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql(
      'UPDATE categories SET is_archived = 1, updated_at = ? WHERE id = ?',
      [now, id],
    );
    writeChangeLogInTx(tx, 'category', id, 'upsert', archived, seq);
  });
}

// ─── Category Rules ───────────────────────────────────────────────────────────

export async function getCategoryRules(): Promise<CategoryRule[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM category_rules ORDER BY priority ASC',
  );
  const items: CategoryRule[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    const row = res.rows.item(i);
    items.push({...row, is_enabled: row.is_enabled === 1});
  }
  return items;
}

export async function createCategoryRule(
  categoryId: string,
  pattern: string,
  targetField: 'title' | 'note' | 'both',
  priority: number,
): Promise<CategoryRule> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const id = uuidv4();
  const rule: CategoryRule = {
    id, category_id: categoryId, pattern, target_field: targetField,
    priority, is_enabled: true, created_at: now, updated_at: now,
  };
  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql(
      `INSERT INTO category_rules (id, category_id, pattern, target_field, priority, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, categoryId, pattern, targetField, priority, now, now],
    );
    writeChangeLogInTx(tx, 'category_rule', id, 'upsert', rule, seq);
  });
  return rule;
}

export async function updateCategoryRule(
  id: string,
  updates: Partial<Pick<CategoryRule, 'pattern' | 'target_field' | 'priority' | 'is_enabled' | 'category_id'>>,
): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();

  const [existing] = await db.executeSql(
    'SELECT * FROM category_rules WHERE id = ?',
    [id],
  );
  if (existing.rows.length === 0) return;
  const current = existing.rows.item(0);

  const merged: CategoryRule = {
    ...current,
    ...updates,
    is_enabled: updates.is_enabled !== undefined ? !!updates.is_enabled : current.is_enabled === 1,
    updated_at: now,
  };

  const fieldEntries = Object.entries(updates);
  const setClause = fieldEntries.map(([k]) => `${k} = ?`).join(', ');
  const setValues = fieldEntries.map(([, v]) =>
    typeof v === 'boolean' ? (v ? 1 : 0) : v,
  );

  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql(
      `UPDATE category_rules SET ${setClause}, updated_at = ? WHERE id = ?`,
      [...setValues, now, id],
    );
    writeChangeLogInTx(tx, 'category_rule', id, 'upsert', merged, seq);
  });
}

export async function deleteCategoryRule(id: string): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const seq = await getNextChangeLogSequence();
  await db.transaction(tx => {
    tx.executeSql('DELETE FROM category_rules WHERE id = ?', [id]);
    writeChangeLogInTx(tx, 'category_rule', id, 'delete', {id, updated_at: now}, seq);
  });
}
