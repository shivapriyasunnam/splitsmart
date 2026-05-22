import {SyncPackage, SyncChange} from '../../../types';
import {getDB} from '../../../db/database';
import {
  hasPackageBeenApplied,
  recordPackageApplied,
} from '../../../db/repositories/syncRepository';
import {setConfig} from '../../../db/repositories/configRepository';
import {writeInboundAuditLogInTx} from '../../../db/repositories/changeLogRepository';
import dayjs from 'dayjs';

// react-native-sqlite-storage does NOT await async transaction callbacks —
// the transaction commits as soon as the callback function returns its Promise.
// Fix: split every merge into two phases:
//   Phase 1 (async, outside transaction): read existing rows via db.executeSql.
//   Phase 2 (sync, inside transaction): queue all writes with tx.executeSql
//            without await so they are scheduled before the callback returns.

type SqlStatement = {sql: string; args: any[]};

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

  // Phase 1: determine what SQL each change requires (async reads are fine here).
  const statements: SqlStatement[] = [];
  for (const change of pkg.changes) {
    const stmts = await buildChangeStatements(db, change);
    statements.push(...stmts);
  }

  console.log(`[mergePackage] pkg=${pkg.packageId} changes=${pkg.changes.length} statements=${statements.length}`);
  pkg.changes.forEach(c => {
    const r = c.record as any;
    console.log(`[mergePackage]   change: type=${c.entityType} op=${c.operation} id=${r?.id} date=${r?.expense_date ?? '-'}`);
  });

  // Phase 2: write everything in a synchronous (non-async) transaction callback.
  // We also queue inbound_audit_log inserts for EVERY change in the package —
  // even ones that mergeService decided to skip (out-of-date / no-op) — so the
  // Sync History screen can show "partner edited X" regardless of whether it
  // beat our newer local edit.
  if (statements.length > 0 || pkg.changes.length > 0) {
    try {
      await db.transaction(tx => {
        for (const {sql, args} of statements) {
          tx.executeSql(sql, args);
        }
        for (const change of pkg.changes) {
          const rec = change.record as Record<string, any>;
          writeInboundAuditLogInTx(tx, {
            entityType: change.entityType,
            entityId: change.entityId,
            operation: change.operation,
            record: rec,
            sourceDeviceId: pkg.sourceDeviceId,
            sourceMemberId: pkg.senderMemberId ?? null,
            packageId: pkg.packageId,
            occurredAt: rec?.updated_at ?? rec?.deleted_at ?? null,
          });
        }
      });
      console.log(`[mergePackage] transaction committed, ${statements.length} write(s) + ${pkg.changes.length} audit row(s)`);
    } catch (txErr: any) {
      console.error('[mergePackage] transaction FAILED:', txErr?.message ?? txErr);
      throw txErr;
    }
  } else {
    console.log('[mergePackage] no changes to process — empty package');
  }

  await recordPackageApplied(pkg.packageId, pkg.sourceDeviceId);

  // Pairing: if the sender included their own member ID, store it as the
  // canonical partner member ID. This lets AppProvider and balance screens
  // resolve the correct partner UUID across devices that generated their own
  // UUIDs independently during setup.
  if (pkg.senderMemberId) {
    await setConfig('canonical_partner_member_id', pkg.senderMemberId);
    console.log(`[mergePackage] canonical_partner_member_id set to ${pkg.senderMemberId}`);
  }
}

async function buildChangeStatements(db: any, change: SyncChange): Promise<SqlStatement[]> {
  const record = change.record as Record<string, any>;
  switch (change.entityType) {
    case 'expense':       return buildExpenseStatements(db, record, change.operation);
    case 'budget':        return buildBudgetStatements(db, record, change.operation);
    case 'settlement':    return buildSettlementStatements(db, record, change.operation);
    case 'category':      return buildCategoryStatements(db, record, change.operation);
    case 'category_rule': return buildCategoryRuleStatements(db, record, change.operation);
    case 'member':        return buildMemberStatements(db, record, change.operation);
    default:
      console.warn(`Unknown entity type in sync: ${change.entityType}`);
      return [];
  }
}

async function getExistingUpdatedAt(db: any, table: string, id: string): Promise<string | null> {
  const [res] = await db.executeSql(
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

async function buildExpenseStatements(db: any, record: any, op: string): Promise<SqlStatement[]> {
  const existing = await getExistingUpdatedAt(db, 'expenses', record.id);

  if (op === 'delete') {
    if (!isNewer(record.updated_at ?? record.deleted_at, existing)) return [];
    return [{
      sql: 'UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ?',
      args: [record.deleted_at, record.updated_at ?? record.deleted_at, record.id],
    }];
  }

  if (!isNewer(record.updated_at, existing)) return [];

  if (!existing) {
    return [{
      sql: `INSERT OR REPLACE INTO expenses
        (id, title, note, amount_minor, currency, expense_date, category_id, paid_by_member_id,
         split_type, split_payload_json, created_by_device_id, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        record.id, record.title, record.note ?? null, record.amount_minor,
        record.currency, record.expense_date, record.category_id,
        record.paid_by_member_id, record.split_type,
        record.split_payload_json ?? '{}', record.created_by_device_id,
        record.created_at, record.updated_at, record.deleted_at ?? null,
      ],
    }];
  }
  return [{
    sql: `UPDATE expenses SET title=?, note=?, amount_minor=?, currency=?, expense_date=?,
       category_id=?, paid_by_member_id=?, split_type=?, split_payload_json=?,
       updated_at=?, deleted_at=? WHERE id=?`,
    args: [
      record.title, record.note ?? null, record.amount_minor, record.currency,
      record.expense_date, record.category_id, record.paid_by_member_id,
      record.split_type, record.split_payload_json ?? '{}',
      record.updated_at, record.deleted_at ?? null, record.id,
    ],
  }];
}

async function buildBudgetStatements(db: any, record: any, op: string): Promise<SqlStatement[]> {
  const existing = await getExistingUpdatedAt(db, 'budgets', record.id);
  if (op === 'delete') {
    if (!isNewer(record.updated_at ?? record.deleted_at, existing)) return [];
    return [{
      sql: 'UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE id = ?',
      args: [record.deleted_at, record.updated_at ?? record.deleted_at, record.id],
    }];
  }
  if (!isNewer(record.updated_at, existing)) return [];
  if (!existing) {
    return [{
      sql: `INSERT OR REPLACE INTO budgets (id, month_key, category_id, amount_minor, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [record.id, record.month_key, record.category_id, record.amount_minor, record.created_at, record.updated_at, record.deleted_at ?? null],
    }];
  }
  return [{
    sql: 'UPDATE budgets SET amount_minor=?, updated_at=?, deleted_at=? WHERE id=?',
    args: [record.amount_minor, record.updated_at, record.deleted_at ?? null, record.id],
  }];
}

async function buildSettlementStatements(db: any, record: any, op: string): Promise<SqlStatement[]> {
  const existing = await getExistingUpdatedAt(db, 'settlements', record.id);
  if (op === 'delete') {
    if (!isNewer(record.updated_at ?? record.deleted_at, existing)) return [];
    return [{
      sql: 'UPDATE settlements SET deleted_at = ?, updated_at = ? WHERE id = ?',
      args: [record.deleted_at, record.updated_at ?? record.deleted_at, record.id],
    }];
  }
  if (!isNewer(record.updated_at, existing)) return [];
  if (!existing) {
    return [{
      sql: `INSERT OR REPLACE INTO settlements
        (id, amount_minor, paid_by_member_id, received_by_member_id, settlement_date, note, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [record.id, record.amount_minor, record.paid_by_member_id, record.received_by_member_id, record.settlement_date, record.note ?? null, record.created_at, record.updated_at, record.deleted_at ?? null],
    }];
  }
  return [{
    sql: 'UPDATE settlements SET amount_minor=?, settlement_date=?, note=?, updated_at=?, deleted_at=? WHERE id=?',
    args: [record.amount_minor, record.settlement_date, record.note ?? null, record.updated_at, record.deleted_at ?? null, record.id],
  }];
}

async function buildCategoryStatements(db: any, record: any, op: string): Promise<SqlStatement[]> {
  if (op === 'delete') return []; // Don't delete categories on sync (soft archive only)
  const existing = await getExistingUpdatedAt(db, 'categories', record.id);
  if (!isNewer(record.updated_at, existing)) return [];
  if (!existing) {
    return [{
      sql: `INSERT OR REPLACE INTO categories (id, name, color, icon, is_default, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [record.id, record.name, record.color, record.icon, record.is_default ? 1 : 0, record.is_archived ? 1 : 0, record.created_at, record.updated_at],
    }];
  }
  return [{
    sql: 'UPDATE categories SET name=?, color=?, icon=?, is_archived=?, updated_at=? WHERE id=?',
    args: [record.name, record.color, record.icon, record.is_archived ? 1 : 0, record.updated_at, record.id],
  }];
}

async function buildCategoryRuleStatements(db: any, record: any, op: string): Promise<SqlStatement[]> {
  const existing = await getExistingUpdatedAt(db, 'category_rules', record.id);
  if (op === 'delete') {
    if (!isNewer(record.updated_at ?? dayjs().toISOString(), existing)) return [];
    return [{sql: 'DELETE FROM category_rules WHERE id = ?', args: [record.id]}];
  }
  if (!isNewer(record.updated_at, existing)) return [];
  if (!existing) {
    return [{
      sql: `INSERT OR REPLACE INTO category_rules (id, category_id, pattern, target_field, priority, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [record.id, record.category_id, record.pattern, record.target_field, record.priority, record.is_enabled ? 1 : 0, record.created_at, record.updated_at],
    }];
  }
  return [{
    sql: 'UPDATE category_rules SET pattern=?, target_field=?, priority=?, is_enabled=?, updated_at=? WHERE id=?',
    args: [record.pattern, record.target_field, record.priority, record.is_enabled ? 1 : 0, record.updated_at, record.id],
  }];
}

async function buildMemberStatements(db: any, record: any, op: string): Promise<SqlStatement[]> {
  if (op === 'delete') return []; // Never delete members on sync
  const existing = await getExistingUpdatedAt(db, 'members', record.id);
  if (!isNewer(record.updated_at, existing)) return [];
  if (!existing) {
    return [{
      sql: `INSERT OR REPLACE INTO members (id, name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      args: [record.id, record.name, record.role, record.created_at, record.updated_at],
    }];
  }
  return [{
    sql: 'UPDATE members SET name=?, updated_at=? WHERE id=?',
    args: [record.name, record.updated_at, record.id],
  }];
}
