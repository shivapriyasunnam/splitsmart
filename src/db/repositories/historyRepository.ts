/**
 * Sync history — unified view of local mutations + remote merges.
 *
 * Local edits come from `change_log` (writes you originated on this device).
 * Remote edits come from `inbound_audit_log` (rows you received from a partner
 * via sync). The two tables are intentionally separate so the sync cursor
 * (change_log.local_sequence) doesn't bounce remote changes back to the
 * partner, but for display we union them and sort by when the change actually
 * happened — falling back to applied/created time when an absolute occurred_at
 * isn't available.
 */
import {getDB} from '../database';
import {EntityType, ChangeOperation} from '../../types';

export type HistorySource = 'local' | 'remote';

export interface HistoryEntry {
  id: string;
  source: HistorySource;
  entityType: EntityType;
  entityId: string;
  operation: ChangeOperation;
  record: any;
  /** ISO timestamp. For local entries: change_log.created_at.
   *  For remote: record.updated_at if present, else applied_at. */
  occurredAt: string;
  /** The device that originated the change. */
  sourceDeviceId: string | null;
  /** The member who made the change (their canonical id). */
  sourceMemberId: string | null;
  /** Sync package id (remote only). */
  packageId: string | null;
}

/**
 * Returns the most recent N history entries across both local and remote
 * sources, newest first.
 */
export async function getCombinedHistory(limit = 200): Promise<HistoryEntry[]> {
  const db = await getDB();

  const [localRes] = await db.executeSql(
    `SELECT id, entity_type, entity_id, operation, record_json, created_at, package_id
       FROM change_log
       ORDER BY local_sequence DESC
       LIMIT ?`,
    [limit],
  );

  const [remoteRes] = await db.executeSql(
    `SELECT id, entity_type, entity_id, operation, record_json,
            source_device_id, source_member_id, package_id, occurred_at, applied_at
       FROM inbound_audit_log
       ORDER BY applied_at DESC
       LIMIT ?`,
    [limit],
  );

  const entries: HistoryEntry[] = [];

  for (let i = 0; i < localRes.rows.length; i++) {
    const row = localRes.rows.item(i);
    let parsed: any = null;
    try { parsed = JSON.parse(row.record_json); } catch { /* ignore */ }
    entries.push({
      id: row.id,
      source: 'local',
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      record: parsed,
      occurredAt: row.created_at,
      sourceDeviceId: null,
      sourceMemberId: null,
      packageId: row.package_id ?? null,
    });
  }

  for (let i = 0; i < remoteRes.rows.length; i++) {
    const row = remoteRes.rows.item(i);
    let parsed: any = null;
    try { parsed = JSON.parse(row.record_json); } catch { /* ignore */ }
    entries.push({
      id: row.id,
      source: 'remote',
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      record: parsed,
      occurredAt: row.occurred_at ?? row.applied_at,
      sourceDeviceId: row.source_device_id,
      sourceMemberId: row.source_member_id,
      packageId: row.package_id,
    });
  }

  entries.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return entries.slice(0, limit);
}
