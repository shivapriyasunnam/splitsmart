import {getDB} from '../database';
import {SyncPackageApplied} from '../../types';
import dayjs from 'dayjs';
import {v4 as uuidv4} from 'uuid';

export async function hasPackageBeenApplied(packageId: string): Promise<boolean> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT COUNT(*) as count FROM sync_packages_applied WHERE package_id = ?',
    [packageId],
  );
  return res.rows.item(0).count > 0;
}

export async function recordPackageApplied(
  packageId: string,
  sourceDeviceId: string,
): Promise<void> {
  const db = await getDB();
  const now = dayjs().toISOString();
  const id = uuidv4();
  await db.executeSql(
    `INSERT OR IGNORE INTO sync_packages_applied (id, package_id, source_device_id, applied_at)
     VALUES (?, ?, ?, ?)`,
    [id, packageId, sourceDeviceId, now],
  );
}

export async function getAppliedPackages(): Promise<SyncPackageApplied[]> {
  const db = await getDB();
  const [res] = await db.executeSql(
    'SELECT * FROM sync_packages_applied ORDER BY applied_at DESC LIMIT 100',
  );
  const items: SyncPackageApplied[] = [];
  for (let i = 0; i < res.rows.length; i++) {
    items.push(res.rows.item(i));
  }
  return items;
}
