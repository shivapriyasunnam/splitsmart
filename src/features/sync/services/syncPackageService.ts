import {v4 as uuidv4} from 'uuid';
import dayjs from 'dayjs';
import {SyncPackage, SyncChange, ChangeLogEntry} from '../../../types';
import {
  getUnsyncedChanges,
  getChangesAfterSequence,
  markChangesAsUploaded,
} from '../../../db/repositories/changeLogRepository';
import {encrypt, serializeEncrypted} from '../crypto/encryptionService';

/**
 * Build a sync package from a list of change log entries.
 */
export function buildSyncPackage(
  changes: ChangeLogEntry[],
  sourceDeviceId: string,
  pairId: string,
): SyncPackage {
  if (changes.length === 0) {
    return {
      packageId: uuidv4(),
      sourceDeviceId,
      pairId,
      createdAt: dayjs().toISOString(),
      sequenceRange: {from: 0, to: 0},
      changes: [],
    };
  }

  const fromSeq = changes[0].local_sequence;
  const toSeq = changes[changes.length - 1].local_sequence;

  const syncChanges: SyncChange[] = changes.map(entry => ({
    entityType: entry.entity_type,
    entityId: entry.entity_id,
    operation: entry.operation,
    record: JSON.parse(entry.record_json),
  }));

  return {
    packageId: uuidv4(),
    sourceDeviceId,
    pairId,
    createdAt: dayjs().toISOString(),
    sequenceRange: {from: fromSeq, to: toSeq},
    changes: syncChanges,
  };
}

/**
 * Get the filename for a sync package file.
 * Format: 2026-05-16T23-59-00Z_pkg-<uuid>.sync.enc
 */
export function getSyncPackageFilename(packageId: string): string {
  const timestamp = dayjs().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
  return `${timestamp}_pkg-${packageId}.sync.enc`;
}

/**
 * Create an encrypted sync package from Drive-unsynced changes (uploaded_at IS NULL).
 * Returns null if there are no changes.
 */
export async function createEncryptedDriveSyncPackage(
  sourceDeviceId: string,
  pairId: string,
  passphrase: string,
): Promise<{encryptedData: string; packageId: string; changeIds: string[]} | null> {
  const changes = await getUnsyncedChanges();
  if (changes.length === 0) return null;

  const pkg = buildSyncPackage(changes, sourceDeviceId, pairId);
  const serialized = JSON.stringify(pkg);
  const encrypted = encrypt(serialized, passphrase);
  const encryptedData = serializeEncrypted(encrypted);

  return {
    encryptedData,
    packageId: pkg.packageId,
    changeIds: changes.map(c => c.id),
  };
}

/** @deprecated use createEncryptedDriveSyncPackage */
export const createEncryptedSyncPackage = createEncryptedDriveSyncPackage;

/**
 * Mark changes as uploaded after successful Drive upload.
 */
export async function finalizePackageUpload(
  changeIds: string[],
  packageId: string,
): Promise<void> {
  await markChangesAsUploaded(changeIds, packageId);
}

/**
 * Create an encrypted sync package from changes above a Bluetooth cursor sequence.
 * Does NOT touch uploaded_at — Drive upload state is preserved.
 * Returns null if there are no new changes above the cursor.
 */
export async function createEncryptedBluetoothSyncPackage(
  sourceDeviceId: string,
  pairId: string,
  passphrase: string,
  lastSentSequence: number,
): Promise<{encryptedData: string; packageId: string; sequenceTo: number} | null> {
  const changes = await getChangesAfterSequence(lastSentSequence);
  if (changes.length === 0) return null;

  const pkg = buildSyncPackage(changes, sourceDeviceId, pairId);
  const serialized = JSON.stringify(pkg);
  const encrypted = encrypt(serialized, passphrase);
  const encryptedData = serializeEncrypted(encrypted);

  return {
    encryptedData,
    packageId: pkg.packageId,
    sequenceTo: pkg.sequenceRange.to,
  };
}

/**
 * Create a plaintext (unencrypted) Bluetooth sync package.
 * Use this when encryption is not required — payload is raw JSON.
 * Returns null if there are no new changes above the cursor.
 */
export async function createRawBluetoothSyncPackage(
  sourceDeviceId: string,
  pairId: string,
  lastSentSequence: number,
): Promise<{payload: string; packageId: string; sequenceTo: number} | null> {
  const changes = await getChangesAfterSequence(lastSentSequence);
  if (changes.length === 0) return null;

  const pkg = buildSyncPackage(changes, sourceDeviceId, pairId);
  return {
    payload: JSON.stringify(pkg),
    packageId: pkg.packageId,
    sequenceTo: pkg.sequenceRange.to,
  };
}
