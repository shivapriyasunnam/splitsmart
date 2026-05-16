import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {ALL_TABLES, CREATE_INDEXES} from '../schema/tables';
import {Colors} from '../../app/theme';

const DEFAULT_CATEGORIES = [
  {name: 'Groceries', color: Colors.categoryColors[0], icon: 'cart', is_default: 1},
  {name: 'Rent', color: Colors.categoryColors[1], icon: 'home', is_default: 1},
  {name: 'Dining', color: Colors.categoryColors[2], icon: 'food', is_default: 1},
  {name: 'Transport', color: Colors.categoryColors[3], icon: 'car', is_default: 1},
  {name: 'Utilities', color: Colors.categoryColors[4], icon: 'lightning-bolt', is_default: 1},
  {name: 'Shopping', color: Colors.categoryColors[5], icon: 'shopping', is_default: 1},
  {name: 'Entertainment', color: Colors.categoryColors[6], icon: 'television', is_default: 1},
  {name: 'Health', color: Colors.categoryColors[7], icon: 'heart', is_default: 1},
  {name: 'Travel', color: Colors.categoryColors[8], icon: 'airplane', is_default: 1},
  {name: 'Other', color: Colors.categoryColors[9], icon: 'dots-horizontal', is_default: 1},
];

const DEFAULT_RULES = [
  {categoryName: 'Transport', patterns: ['uber|ola|taxi|metro|auto|rickshaw|rapido|bus|train']},
  {categoryName: 'Dining', patterns: ['swiggy|zomato|restaurant|cafe|coffee|pizza|burger|biryani|food court|dining']},
  {categoryName: 'Groceries', patterns: ['dmart|bigbasket|grocery|supermarket|vegetables|fruits|milk|kirana']},
  {categoryName: 'Entertainment', patterns: ['netflix|spotify|prime|hotstar|zee5|movie|cinema|concert|gaming']},
  {categoryName: 'Health', patterns: ['pharmacy|hospital|doctor|medical|medicine|chemist|apollo|clinic']},
  {categoryName: 'Shopping', patterns: ['amazon|flipkart|myntra|shopping|store|mall|clothes|fashion']},
  {categoryName: 'Utilities', patterns: ['electricity|water bill|gas bill|internet|broadband|mobile bill|recharge|insurance']},
  {categoryName: 'Travel', patterns: ['hotel|flight|irctc|booking|airbnb|oyo|trip|holiday|vacation']},
  {categoryName: 'Rent', patterns: ['rent|maintenance|society|landlord|pg|hostel']},
];

export async function runMigrations(): Promise<void> {
  const database = await getDB();

  // Create all tables
  for (const sql of ALL_TABLES) {
    await database.executeSql(sql);
  }

  // Create indexes
  for (const sql of CREATE_INDEXES) {
    await database.executeSql(sql);
  }

  // Check if default categories exist
  const [result] = await database.executeSql(
    'SELECT COUNT(*) as count FROM categories WHERE is_default = 1',
  );
  const count = result.rows.item(0).count;

  if (count === 0) {
    await seedCategories(database);
  }
}

async function seedCategories(database: any): Promise<void> {
  const now = dayjs().toISOString();

  // Insert categories
  const categoryIds: Record<string, string> = {};
  for (const cat of DEFAULT_CATEGORIES) {
    const id = uuidv4();
    categoryIds[cat.name] = id;
    await database.executeSql(
      `INSERT INTO categories (id, name, color, icon, is_default, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, cat.name, cat.color, cat.icon, cat.is_default, now, now],
    );
  }

  // Insert default rules
  let priority = 1;
  for (const rule of DEFAULT_RULES) {
    const catId = categoryIds[rule.categoryName];
    if (!catId) continue;
    for (const pattern of rule.patterns) {
      const id = uuidv4();
      await database.executeSql(
        `INSERT INTO category_rules (id, category_id, pattern, target_field, priority, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, 'both', ?, 1, ?, ?)`,
        [id, catId, pattern, priority, now, now],
      );
      priority++;
    }
  }
}
