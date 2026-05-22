import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {getDB} from '../database';
import {ALL_TABLES, CREATE_INDEXES} from '../schema/tables';

// Default categories use FIXED UUIDs so every device seeds with the same IDs.
// Without this, each fresh install generated its own random UUIDs for the
// defaults — meaning budgets/expenses created on one device referenced
// category_ids that didn't exist on the partner's device, and the budget UI
// (which renders by joining categories → budgets on id) silently dropped any
// row whose category wasn't local. See migrateDefaultCategoryIds below for
// the matching one-time migration that normalizes already-seeded installs.
const DEFAULT_CATEGORIES = [
  {id: 'a0000000-0000-4000-8000-000000000001', name: 'Groceries',     color: 'palette:0', icon: 'cart',              is_default: 1},
  {id: 'a0000000-0000-4000-8000-000000000002', name: 'Rent',          color: 'palette:1', icon: 'home',              is_default: 1},
  {id: 'a0000000-0000-4000-8000-000000000003', name: 'Dining',        color: 'palette:2', icon: 'food',              is_default: 1},
  {id: 'a0000000-0000-4000-8000-000000000004', name: 'Transport',     color: 'palette:3', icon: 'car',               is_default: 1},
  {id: 'a0000000-0000-4000-8000-000000000005', name: 'Utilities',     color: 'palette:4', icon: 'lightning-bolt',    is_default: 1},
  {id: 'a0000000-0000-4000-8000-000000000006', name: 'Shopping',      color: 'palette:5', icon: 'shopping',          is_default: 1},
  {id: 'a0000000-0000-4000-8000-000000000007', name: 'Entertainment', color: 'palette:6', icon: 'television',        is_default: 1},
  {id: 'a0000000-0000-4000-8000-000000000008', name: 'Health',        color: 'palette:7', icon: 'heart',             is_default: 1},
  {id: 'a0000000-0000-4000-8000-000000000009', name: 'Travel',        color: 'palette:8', icon: 'airplane',          is_default: 1},
  {id: 'a0000000-0000-4000-8000-00000000000a', name: 'Other',         color: 'palette:9', icon: 'dots-horizontal',   is_default: 1},
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
  } else {
    await migrateCategoryColorsToPaletteKeys(database);
    await migrateDefaultCategoryIds(database);
  }
}

/**
 * One-time migration: rewrite default-category UUIDs to the fixed values in
 * DEFAULT_CATEGORIES.
 *
 * Before this migration, every device generated its own random UUIDs for the
 * default categories via uuidv4(), so Device A's "Groceries" ≠ Device B's
 * "Groceries". Cross-device sync of budgets/expenses then referenced
 * category_ids that didn't exist on the partner — the rows landed in the DB
 * but were invisible in the UI (BudgetsScreen joins by category id).
 *
 * The migration:
 *   1. For each default category, look up the existing row by name.
 *   2. If its id differs from the target fixed id, rewrite the id and
 *      cascade the change to every table that references it (expenses,
 *      budgets, category_rules) AND to record_json inside change_log so
 *      pending unsynced entries also point at the new id.
 *   3. Mark the migration complete in app_config so it doesn't re-run.
 */
async function migrateDefaultCategoryIds(database: any): Promise<void> {
  const [migrated] = await database.executeSql(
    "SELECT value_json FROM app_config WHERE key = 'migration_v3_default_category_ids'",
  );
  if (migrated.rows.length > 0) return;

  for (const cat of DEFAULT_CATEGORIES) {
    const [existing] = await database.executeSql(
      'SELECT id FROM categories WHERE is_default = 1 AND name = ?',
      [cat.name],
    );
    if (existing.rows.length === 0) continue;

    const currentId = existing.rows.item(0).id;
    if (currentId === cat.id) continue;

    // If a row with the target id somehow already exists (e.g. a partial prior
    // migration), prefer keeping the existing target row and just remap all
    // references from currentId → cat.id, then delete the duplicate.
    const [conflict] = await database.executeSql(
      'SELECT id FROM categories WHERE id = ?',
      [cat.id],
    );
    const targetExists = conflict.rows.length > 0;

    // Cascade references first so we don't dangle while updating the id.
    await database.executeSql(
      'UPDATE expenses SET category_id = ? WHERE category_id = ?',
      [cat.id, currentId],
    );
    await database.executeSql(
      'UPDATE budgets SET category_id = ? WHERE category_id = ?',
      [cat.id, currentId],
    );
    await database.executeSql(
      'UPDATE category_rules SET category_id = ? WHERE category_id = ?',
      [cat.id, currentId],
    );

    // Rewrite any UUID occurrences inside change_log.record_json so pending
    // (un-uploaded) entries carry the new id when they sync. SQL REPLACE on a
    // 36-char UUID is safe — UUIDs are unique enough not to false-match.
    await database.executeSql(
      'UPDATE change_log SET record_json = REPLACE(record_json, ?, ?) WHERE record_json LIKE ?',
      [currentId, cat.id, `%${currentId}%`],
    );
    // Also remap entity_id for change_log rows that target this category.
    await database.executeSql(
      'UPDATE change_log SET entity_id = ? WHERE entity_type = ? AND entity_id = ?',
      [cat.id, 'category', currentId],
    );

    if (targetExists) {
      await database.executeSql('DELETE FROM categories WHERE id = ?', [currentId]);
    } else {
      await database.executeSql(
        'UPDATE categories SET id = ? WHERE id = ?',
        [cat.id, currentId],
      );
    }
  }

  await database.executeSql(
    "INSERT INTO app_config (key, value_json) VALUES ('migration_v3_default_category_ids', 'true')",
  );
}

// One-time migration: replace any baked-in hex color values on default categories
// with palette keys so they dynamically reflect the theme going forward.
async function migrateCategoryColorsToPaletteKeys(database: any): Promise<void> {
  const [migrated] = await database.executeSql(
    "SELECT value_json FROM app_config WHERE key = 'migration_v2_palette_colors'",
  );
  if (migrated.rows.length > 0) return;

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    await database.executeSql(
      'UPDATE categories SET color = ? WHERE is_default = 1 AND name = ?',
      [`palette:${i}`, DEFAULT_CATEGORIES[i].name],
    );
  }
  await database.executeSql(
    "INSERT INTO app_config (key, value_json) VALUES ('migration_v2_palette_colors', 'true')",
  );
}

async function seedCategories(database: any): Promise<void> {
  const now = dayjs().toISOString();

  // Insert categories using their fixed IDs so every device gets identical
  // category UUIDs from day one (see DEFAULT_CATEGORIES comment).
  const categoryIds: Record<string, string> = {};
  for (const cat of DEFAULT_CATEGORIES) {
    categoryIds[cat.name] = cat.id;
    await database.executeSql(
      `INSERT INTO categories (id, name, color, icon, is_default, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [cat.id, cat.name, cat.color, cat.icon, cat.is_default, now, now],
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
