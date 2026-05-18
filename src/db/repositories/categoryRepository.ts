import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {Category, CategoryRule} from '../../types';
import {resolveCategoryColor} from '../../app/theme';

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
  const cat: Category = {id, name, color, icon, is_default: false, is_archived: false, created_at: now, updated_at: now};
  await db.executeSql(
    `INSERT INTO categories (id, name, color, icon, is_default, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    [id, name, color, icon, now, now],
  );
  return cat;
}

export async function updateCategory(
  id: string,
  updates: Partial<Pick<Category, 'name' | 'color' | 'icon' | 'is_archived'>>,
): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const fields = Object.keys(updates)
    .map(k => `${k} = ?`)
    .join(', ');
  const values = [...Object.values(updates), now, id];
  await db.executeSql(
    `UPDATE categories SET ${fields}, updated_at = ? WHERE id = ?`,
    values,
  );
}

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
  await db.executeSql(
    `INSERT INTO category_rules (id, category_id, pattern, target_field, priority, is_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, categoryId, pattern, targetField, priority, now, now],
  );
  return rule;
}

export async function updateCategoryRule(
  id: string,
  updates: Partial<Pick<CategoryRule, 'pattern' | 'target_field' | 'priority' | 'is_enabled' | 'category_id'>>,
): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const entries = Object.entries(updates);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = [...entries.map(([, v]) => v), now, id];
  await db.executeSql(
    `UPDATE category_rules SET ${fields}, updated_at = ? WHERE id = ?`,
    values,
  );
}

export async function deleteCategoryRule(id: string): Promise<void> {
  const db = await getDB();
  await db.executeSql('DELETE FROM category_rules WHERE id = ?', [id]);
}
