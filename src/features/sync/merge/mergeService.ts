import {SyncPackage, SyncChange} from '../../../types';
import {getDB} from '../../../db/database';
import {
  hasPackageBeenApplied,
  recordPackageApplied,
} from '../../../db/repositories/syncRepository';
import dayjs from 'dayjs';

/**
 * Merge a sync package into the local database.
 * Uses last-write-wins based on updated_at.
 * Soft deletes (deleted_at) win over older active records.
 */
export async function mergePackage(pkg: SyncPackage): Promise<void> {
  const alreadyApplied = await hasPackageBeenApplied(pkg.packageId);
  if (alreadyApplied) {
    console.log(`Package ${pkg.packageId} already applied, skipping.`);
    return;
  }

  const db = await getDB();

  await db.transaction(async tx => {
    for (const change of pkg.changes) {
      await applyChange(tx, change);
    }
  });

  await recordPackageApplied(pkg.packageId, pkg.sourceDeviceId);
}

async function applyChange(tx: any, change: SyncChange): Promise<void> {
  const record = change.record as Record<string, any>;

  switch (change.entityType) {
    case 'expense':
      await mergeExpense(tx, record, change.operation);
      break;
    case 'budget':
      await mergeBudget(tx, record, change.operation);
      break;
    case 'settlement':
      await mergeSettlement(tx, record, change.operation);
      break;
    case 'category':
      await mergeCategory(tx, record, change.operation);
      break;
    case 'category_rule':
      await mergeCategoryRule(tx, record, change.operation);
      break;
    case 'member':
      await mergeMember(tx, record, change.operation);
      break;
    default:
      console.warn(`Unknown entity type in sync: ${change.entityType}`);
  }
}

async function getExistingUpdatedAt(tx: any, table: string, id: string): Promise<string | null> {
  const [res] = await tx.executeSql(
    `SELECT updated_at FROM ${table} WHERE id = ?`,
    [id],
  );
  if (res.rows.length === 0) return null;
  return res.rows.item(0).updated_at;
}

function isNewer(incomingAt: string, existingAt: string | null): boolean {
  if (!existingAt) return true;
  return dayjs(incomingAt).isAfter(dayjs(existingAt));
}

async function mergeExpense(tx: any, record: any, op: string): Promise<void> {
  const existing = await getExistingUpdatedAt(tx, 'expenses', record.id);

  if (op === 'delete') {
    if (isNewer(record.updated_at ?? record.deleted_at, existing)) {
      await tx.executeSql(
        'UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?',
        [record.deleted_at, record.updated_at ?? record.deleted_at, record.id],
      );
    }
    return;
  }

  if (!isNewer(record.updated_at, existing)) return;

  if (!existing) {
    await tx.executeSql(
      `INSERT OR REPLACE INTO expenses
        (id, title, note, amount_minor, currency, expense_date, category_id, paid_by_member_id,
         split_type, split_payload_json, created_by_device_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id, record.title, record.note ?? null, record.amount_minor,
        record.currency, record.expense_date, record.category_id,
        record.paid_by_member_id, record.split_type,
        record.split_payload_json ?? '{}', record.created_by_device_id,
        record.created_at, record.updated_at, record.deleted_at ?? null,
      ],
    );
  } else {
    await tx.executeSql(
      `UPDATE expenses SET title=?, note=?, amount_minor=?, currency=?, expense_date=?,
       category_id=?, paid_by_member_id=?, split_type=?, split_payload_json=?,
       updated_at=?, deleted_at=? WHERE id=?`,
      [
        record.title, record.note ?? null, record.amount_minor, record.currency,
        record.expense_date, record.category_id, record.paid_by_member_id,
        record.split_type, record.split_payload_json ?? '{}',
        record.updated_at, record.deleted_at ?? null, record.id,
      ],
    );
  }
}

async function mergeBudget(tx: any, record: any, op: string): Promise<void> {
  const existing = await getExistingUpdatedAt(tx, 'budgets', record.id);
  if (op === 'delete') {
    if (isNewer(record.updated_at ?? record.deleted_at, existing)) {
      await tx.executeSql(
        'UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE id = ?',
        [record.deleted_at, record.updated_at ?? record.deleted_at, record.id],
      );
    }
    return;
  }
  if (!isNewer(record.updated_at, existing)) return;
  if (!existing) {
    await tx.executeSql(
      `INSERT OR REPLACE INTO budgets (id, month_key, category_id, amount_minor, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.month_key, record.category_id, record.amount_minor, record.created_at, record.updated_at, record.deleted_at ?? null],
    );
  } else {
    await tx.executeSql(
      'UPDATE budgets SET amount_minor=?, updated_at=?, deleted_at=? WHERE id=?',
      [record.amount_minor, record.updated_at, record.deleted_at ?? null, record.id],
    );
  }
}

async function mergeSettlement(tx: any, record: any, op: string): Promise<void> {
  const existing = await getExistingUpdatedAt(tx, 'settlements', record.id);
  if (op === 'delete') {
    if (isNewer(record.updated_at ?? record.deleted_at, existing)) {
      await tx.executeSql(
        'UPDATE settlements SET deleted_at = ?, updated_at = ? WHERE id = ?',
        [record.deleted_at, record.updated_at ?? record.deleted_at, record.id],
      );
    }
    return;
  }
  if (!isNewer(record.updated_at, existing)) return;
  if (!existing) {
    await tx.executeSql(
      `INSERT OR REPLACE INTO settlements
        (id, amount_minor, paid_by_member_id, received_by_member_id, settlement_date, note, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.amount_minor, record.paid_by_member_id, record.received_by_member_id, record.settlement_date, record.note ?? null, record.created_at, record.updated_at, record.deleted_at ?? null],
    );
  } else {
    await tx.executeSql(
      'UPDATE settlements SET amount_minor=?, settlement_date=?, note=?, updated_at=?, deleted_at=? WHERE id=?',
      [record.amount_minor, record.settlement_date, record.note ?? null, record.updated_at, record.deleted_at ?? null, record.id],
    );
  }
}

async function mergeCategory(tx: any, record: any, op: string): Promise<void> {
  const existing = await getExistingUpdatedAt(tx, 'categories', record.id);
  if (op === 'delete') return; // Don't delete categories on sync (soft archive only)
  if (!isNewer(record.updated_at, existing)) return;
  if (!existing) {
    await tx.executeSql(
      `INSERT OR REPLACE INTO categories (id, name, color, icon, is_default, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.name, record.color, record.icon, record.is_default ? 1 : 0, record.is_archived ? 1 : 0, record.created_at, record.updated_at],
    );
  } else {
    await tx.executeSql(
      'UPDATE categories SET name=?, color=?, icon=?, is_archived=?, updated_at=? WHERE id=?',
      [record.name, record.color, record.icon, record.is_archived ? 1 : 0, record.updated_at, record.id],
    );
  }
}

async function mergeCategoryRule(tx: any, record: any, op: string): Promise<void> {
  const existing = await getExistingUpdatedAt(tx, 'category_rules', record.id);
  if (op === 'delete') {
    if (isNewer(record.updated_at ?? dayjs().toISOString(), existing)) {
      await tx.executeSql('DELETE FROM category_rules WHERE id = ?', [record.id]);
    }
    return;
  }
  if (!isNewer(record.updated_at, existing)) return;
  if (!existing) {
    await tx.executeSql(
      `INSERT OR REPLACE INTO category_rules (id, category_id, pattern, target_field, priority, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.category_id, record.pattern, record.target_field, record.priority, record.is_enabled ? 1 : 0, record.created_at, record.updated_at],
    );
  } else {
    await tx.executeSql(
      'UPDATE category_rules SET pattern=?, target_field=?, priority=?, is_enabled=?, updated_at=? WHERE id=?',
      [record.pattern, record.target_field, record.priority, record.is_enabled ? 1 : 0, record.updated_at, record.id],
    );
  }
}

async function mergeMember(tx: any, record: any, op: string): Promise<void> {
  const existing = await getExistingUpdatedAt(tx, 'members', record.id);
  if (op === 'delete') return; // Never delete members on sync
  if (!isNewer(record.updated_at, existing)) return;
  if (!existing) {
    await tx.executeSql(
      `INSERT OR REPLACE INTO members (id, name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [record.id, record.name, record.role, record.created_at, record.updated_at],
    );
  } else {
    await tx.executeSql(
      'UPDATE members SET name=?, updated_at=? WHERE id=?',
      [record.name, record.updated_at, record.id],
    );
  }
}
