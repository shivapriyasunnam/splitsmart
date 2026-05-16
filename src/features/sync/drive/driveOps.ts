import dayjs from 'dayjs';
import {getConfig, setConfig} from '../../../db/repositories/configRepository';
import {
  getAccessToken,
  silentSignIn,
  uploadFileToDrive,
  listFilesInFolder,
  downloadFileFromDrive,
  setupDriveFolders,
} from './driveService';
import {
  createEncryptedSyncPackage,
  finalizePackageUpload,
  getSyncPackageFilename,
} from '../services/syncPackageService';
import {decrypt, deserializeEncrypted, encrypt, serializeEncrypted} from '../crypto/encryptionService';
import {mergePackage} from '../merge/mergeService';
import {DriveConfig, SyncStatus, SyncPackage, Profile, DeviceConfig} from '../../../types';
import {getAllCategories} from '../../../db/repositories/categoryRepository';
import {getExpenses} from '../../../db/repositories/expenseRepository';
import {getBudgets} from '../../../db/repositories/budgetRepository';
import {getSettlements} from '../../../db/repositories/settlementRepository';
import {getMembers} from '../../../db/repositories/memberRepository';

async function getPassphrase(): Promise<string | null> {
  const enc = await getConfig<{passphraseHash: string}>('encryption');
  return enc?.passphraseHash ?? null; // In real app, use keychain
}

async function getOrRefreshToken(): Promise<string | null> {
  let token = await getAccessToken();
  if (!token) {
    token = await silentSignIn();
  }
  return token;
}

export async function performUpload(): Promise<{success: boolean; error?: string}> {
  try {
    const driveConfig = await getConfig<DriveConfig>('drive');
    if (!driveConfig?.connected || !driveConfig.deviceFolderId) {
      return {success: false, error: 'Drive not connected'};
    }

    const profile = await getConfig<Profile>('profile');
    const deviceConfig = await getConfig<DeviceConfig>('device');
    if (!profile || !deviceConfig) {
      return {success: false, error: 'Profile not set up'};
    }

    const passphrase = await getPassphrase();
    if (!passphrase) {
      return {success: false, error: 'Encryption not configured'};
    }

    const token = await getOrRefreshToken();
    if (!token) {
      return {success: false, error: 'Google Drive authentication required'};
    }

    // Get the changes folder
    const changesFolderKey = `${driveConfig.deviceFolderId}_changes`;
    let changesFolderId = await getConfig<string>('changes_folder_id');

    if (!changesFolderId) {
      const {changesFolderId: cfId} = await setupDriveFolders(deviceConfig.deviceId, token);
      changesFolderId = cfId;
      await setConfig('changes_folder_id', changesFolderId);
    }

    const result = await createEncryptedSyncPackage(
      deviceConfig.deviceId,
      `pair_${deviceConfig.deviceId}`, // In production this would be a shared pair ID
      passphrase,
    );

    if (!result) {
      return {success: true}; // No changes to upload
    }

    const filename = getSyncPackageFilename(result.packageId);
    await uploadFileToDrive(filename, result.encryptedData, changesFolderId, token);
    await finalizePackageUpload(result.changeIds, result.packageId);

    const now = dayjs().toISOString();
    await setConfig('sync_status', {
      ...(await getConfig<SyncStatus>('sync_status') ?? {}),
      lastUploadAt: now,
      lastUploadError: null,
    });

    return {success: true};
  } catch (err: any) {
    const errorMsg = err.message ?? 'Upload failed';
    await setConfig('sync_status', {
      ...(await getConfig<SyncStatus>('sync_status') ?? {}),
      lastUploadError: errorMsg,
    });
    return {success: false, error: errorMsg};
  }
}

export async function performSync(partnerDeviceFolderId: string): Promise<{success: boolean; error?: string; imported: number}> {
  try {
    const driveConfig = await getConfig<DriveConfig>('drive');
    if (!driveConfig?.connected) {
      return {success: false, error: 'Drive not connected', imported: 0};
    }

    const passphrase = await getPassphrase();
    if (!passphrase) {
      return {success: false, error: 'Encryption not configured', imported: 0};
    }

    const token = await getOrRefreshToken();
    if (!token) {
      return {success: false, error: 'Drive auth required', imported: 0};
    }

    // Find partner's changes folder
    const files = await listFilesInFolder(partnerDeviceFolderId, token, '.sync.enc');
    // Sort by name (timestamp-prefixed)
    files.sort((a, b) => a.name.localeCompare(b.name));

    let imported = 0;
    const {hasPackageBeenApplied} = await import('../../../db/repositories/syncRepository');

    for (const file of files) {
      try {
        const content = await downloadFileFromDrive(file.id, token);
        const payload = deserializeEncrypted(content);
        const plaintext = decrypt(payload, passphrase);
        const pkg = JSON.parse(plaintext) as SyncPackage;

        const alreadyApplied = await hasPackageBeenApplied(pkg.packageId);
        if (!alreadyApplied) {
          await mergePackage(pkg);
          imported++;
        }
      } catch (err) {
        console.warn(`Failed to apply package from file ${file.name}:`, err);
      }
    }

    const now = dayjs().toISOString();
    await setConfig('sync_status', {
      ...(await getConfig<SyncStatus>('sync_status') ?? {}),
      lastSyncAt: now,
      lastSyncError: null,
    });

    return {success: true, imported};
  } catch (err: any) {
    const errorMsg = err.message ?? 'Sync failed';
    await setConfig('sync_status', {
      ...(await getConfig<SyncStatus>('sync_status') ?? {}),
      lastSyncError: errorMsg,
    });
    return {success: false, error: errorMsg, imported: 0};
  }
}

export async function performBackupSnapshot(passphrase: string): Promise<{success: boolean; error?: string}> {
  try {
    const driveConfig = await getConfig<DriveConfig>('drive');
    const deviceConfig = await getConfig<DeviceConfig>('device');
    if (!driveConfig?.connected || !deviceConfig) {
      return {success: false, error: 'Drive not connected'};
    }

    const token = await getOrRefreshToken();
    if (!token) {
      return {success: false, error: 'Drive auth required'};
    }

    // Gather all local data
    const members = await getMembers();
    const categories = await getAllCategories();
    const expenses = await getExpenses();
    const budgets = await getBudgets();
    const settlements = await getSettlements();

    const snapshot = {
      version: 1,
      deviceId: deviceConfig.deviceId,
      createdAt: dayjs().toISOString(),
      members,
      categories,
      expenses,
      budgets,
      settlements,
    };

    const serialized = JSON.stringify(snapshot);
    const encrypted = encrypt(serialized, passphrase);
    const encryptedData = serializeEncrypted(encrypted);

    // Get backups folder
    let backupsFolderId = await getConfig<string>('backups_folder_id');
    if (!backupsFolderId) {
      const folders = await setupDriveFolders(deviceConfig.deviceId, token);
      backupsFolderId = folders.backupsFolderId;
      await setConfig('backups_folder_id', backupsFolderId);
    }

    const ts = dayjs().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
    const filename = `${ts}_backup.snap.enc`;
    await uploadFileToDrive(filename, encryptedData, backupsFolderId, token);

    return {success: true};
  } catch (err: any) {
    return {success: false, error: err.message ?? 'Backup failed'};
  }
}

/**
 * Best-effort EOD job: upload unsynced changes first, then backup.
 */
export async function runEODJob(): Promise<void> {
  const passphrase = await getPassphrase();
  if (!passphrase) return;

  await performUpload();
  await performBackupSnapshot(passphrase);

  await setConfig('sync_status', {
    ...(await getConfig<SyncStatus>('sync_status') ?? {}),
    lastEODAt: dayjs().toISOString(),
  });
}
