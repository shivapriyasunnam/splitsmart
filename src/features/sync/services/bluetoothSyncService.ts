/**
 * Bluetooth Sync Service — UI-facing orchestration for Bluetooth send/receive.
 *
 * Owns:
 *  - reading and updating BluetoothSyncConfig in app_config
 *  - building outbound packages via the cursor (never via uploaded_at)
 *  - calling bluetoothTransport for socket transfer
 *  - advancing lastSentSequence only after remote ACK
 *  - calling syncOrchestrator for inbound processing
 *  - never touching change_log.uploaded_at or Drive state
 */
import dayjs from 'dayjs';
import {getConfig, setConfig} from '../../../db/repositories/configRepository';
import {BluetoothSyncConfig, SyncStatus, DeviceConfig} from '../../../types';
import {createRawBluetoothSyncPackage} from './syncPackageService';
import {processRawInboundPayload} from './syncOrchestrator';
import {
  BluetoothTransport,
  acceptInboundPackage,
  cancelBluetoothAccept,
  BluetoothAck,
  getBondedDevices,
  discoverDevices,
  requestBluetoothEnabled,
  BluetoothDeviceInfo,
} from '../transport/bluetoothTransport';

export const BT_CONFIG_KEY = 'bluetooth_sync';

// ─── Config helpers ───────────────────────────────────────────────────────────

export async function getBluetoothSyncConfig(): Promise<BluetoothSyncConfig> {
  const saved = await getConfig<BluetoothSyncConfig>(BT_CONFIG_KEY);
  return {
    bondedPeerAddress: saved?.bondedPeerAddress ?? null,
    bondedPeerName: saved?.bondedPeerName ?? null,
    lastSentSequence: saved?.lastSentSequence ?? 0,
    lastTransferAt: saved?.lastTransferAt ?? null,
    lastConnectedDeviceId: saved?.lastConnectedDeviceId ?? null,
  };
}

async function updateBluetoothSyncConfig(
  partial: Partial<BluetoothSyncConfig>,
): Promise<void> {
  const current = await getBluetoothSyncConfig();
  await setConfig(BT_CONFIG_KEY, {...current, ...partial});
}

async function setSyncStatusBluetooth(partial: {
  lastBluetoothTransferAt?: string | null;
  lastBluetoothError?: string | null;
}): Promise<void> {
  const current = await getConfig<SyncStatus>('sync_status');
  await setConfig('sync_status', {...(current ?? {}), ...partial});
}

// ─── Device discovery ─────────────────────────────────────────────────────────

export {getBondedDevices, discoverDevices, requestBluetoothEnabled};
export type {BluetoothDeviceInfo};

/**
 * Persist the chosen peer for future sends.
 */
export async function setPeerDevice(device: BluetoothDeviceInfo): Promise<void> {
  await updateBluetoothSyncConfig({
    bondedPeerAddress: device.address,
    bondedPeerName: device.name,
  });
}

// ─── Send ─────────────────────────────────────────────────────────────────────

export interface BluetoothSendResult {
  success: boolean;
  noChanges?: boolean;
  error?: string;
}

/**
 * Build an encrypted sync package from changes above the Bluetooth cursor and
 * transfer it to the configured peer device.
 *
 * Advances lastSentSequence only after explicit remote ACK.
 * Never modifies change_log.uploaded_at.
 */
export async function sendViaBluetooth(): Promise<BluetoothSendResult> {
  try {
    const btConfig = await getBluetoothSyncConfig();
    if (!btConfig.bondedPeerAddress) {
      return {success: false, error: 'No peer device selected. Choose a device first.'};
    }

    const deviceConfig = await getConfig<DeviceConfig>('device');
    if (!deviceConfig) {
      return {success: false, error: 'Device not configured.'};
    }

    const result = await createRawBluetoothSyncPackage(
      deviceConfig.deviceId,
      `pair_${deviceConfig.deviceId}`,
      btConfig.lastSentSequence,
    );

    if (!result) {
      return {success: true, noChanges: true};
    }

    const filename = `pkg-${result.packageId}.sync`;
    const transport = new BluetoothTransport(btConfig.bondedPeerAddress);
    const transferResult = await transport.sendPackage({
      filename,
      encryptedPayload: result.payload,
      packageId: result.packageId,
    });

    if (!transferResult.success || !transferResult.remoteAcked) {
      const errorMsg = transferResult.error ?? 'Transfer failed or no ACK from receiver';
      await setSyncStatusBluetooth({lastBluetoothError: errorMsg});
      return {success: false, error: errorMsg};
    }

    // Only advance cursor after confirmed ACK
    const now = dayjs().toISOString();
    await updateBluetoothSyncConfig({
      lastSentSequence: result.sequenceTo,
      lastTransferAt: now,
      lastConnectedDeviceId: btConfig.bondedPeerAddress,
    });
    await setSyncStatusBluetooth({lastBluetoothTransferAt: now, lastBluetoothError: null});

    return {success: true};
  } catch (err: any) {
    const errorMsg = err.message ?? 'Bluetooth send failed';
    await setSyncStatusBluetooth({lastBluetoothError: errorMsg});
    return {success: false, error: errorMsg};
  }
}

// ─── Receive ──────────────────────────────────────────────────────────────────

export interface BluetoothReceiveResult {
  success: boolean;
  imported?: number;
  duplicate?: boolean;
  error?: string;
}

/**
 * Enter listening mode and process one inbound sync package.
 * Returns after one package is received or the timeout elapses.
 * Sends ACK to sender only after successful validation and merge.
 */
export async function receiveViaBluetooth(
  timeoutMs = 120_000,
): Promise<BluetoothReceiveResult> {
  try {
    const inbound = await acceptInboundPackage(timeoutMs);

    const result = await processRawInboundPayload(inbound.payload);

    const ack: BluetoothAck = result.imported || result.duplicate
      ? {status: 'ok', packageId: result.packageId}
      : {status: 'error', packageId: result.packageId, error: result.error};

    await inbound.ack(ack);
    await inbound.disconnect();

    if (result.error && !result.duplicate) {
      await setSyncStatusBluetooth({lastBluetoothError: result.error});
      return {success: false, error: result.error};
    }

    const now = dayjs().toISOString();
    await setSyncStatusBluetooth({lastBluetoothTransferAt: now, lastBluetoothError: null});

    return {
      success: true,
      imported: result.imported ? 1 : 0,
      duplicate: result.duplicate,
    };
  } catch (err: any) {
    const errorMsg = err.message ?? 'Bluetooth receive failed';
    await setSyncStatusBluetooth({lastBluetoothError: errorMsg});
    return {success: false, error: errorMsg};
  }
}

export {cancelBluetoothAccept};
