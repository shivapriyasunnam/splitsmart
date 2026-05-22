/**
 * Bluetooth Sync Service — UI-facing orchestration for Bluetooth send/receive.
 *
 * Owns:
 *  - reading and updating BluetoothSyncConfig in app_config
 *  - building outbound packages via the cursor (never via uploaded_at)
 *  - calling bluetoothTransport for socket transfer
 *  - advancing lastSentSequence only after successful send
 *  - never touching change_log.uploaded_at or Drive state
 *
 * Bidirectional sync uses the always-on listener (bluetoothListener.ts):
 *   1. User taps "Sync Changes" → we send one envelope to partner with
 *      `respondWith: true`
 *   2. Partner's listener processes the package and sends back its own
 *      with `respondWith: false`
 *   3. Our listener receives the response and emits `sync_received`
 *   4. syncViaBluetooth resolves when the event fires (or times out)
 */
import dayjs from 'dayjs';
import {DeviceEventEmitter, EmitterSubscription} from 'react-native';
import {getConfig, setConfig} from '../../../db/repositories/configRepository';
import {BluetoothSyncConfig, SyncStatus, DeviceConfig, Profile} from '../../../types';
import {createRawBluetoothSyncPackage, buildSyncPackage} from './syncPackageService';
import {
  BluetoothTransport,
  acceptInboundPackage,
  cancelBluetoothAccept,
  sendEnvelope,
  BluetoothAck,
  BluetoothEnvelope,
  getBondedDevices,
  discoverDevices,
  requestBluetoothEnabled,
  BluetoothDeviceInfo,
} from '../transport/bluetoothTransport';
import {processRawInboundPayload} from './syncOrchestrator';
import {bluetoothListener, BT_SYNC_EVENT, BluetoothSyncEvent} from './bluetoothListener';

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

// ─── Legacy one-way send (kept for compatibility, not wired to UI) ────────────

export interface BluetoothSendResult {
  success: boolean;
  noChanges?: boolean;
  error?: string;
}

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

    const myMemberId = await getConfig<string>('my_member_id');

    const result = await createRawBluetoothSyncPackage(
      deviceConfig.deviceId,
      `pair_${deviceConfig.deviceId}`,
      btConfig.lastSentSequence,
      myMemberId ?? undefined,
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

// ─── Legacy one-shot receive (kept for compatibility, not wired to UI) ────────

export interface BluetoothReceiveResult {
  success: boolean;
  imported?: number;
  duplicate?: boolean;
  error?: string;
}

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

// ─── Bidirectional sync (listener-based) ──────────────────────────────────────

export interface BluetoothBidirectionalResult {
  success: boolean;
  sentChanges: boolean;
  importedChanges: boolean;
  error?: string;
}

/**
 * One-tap bidirectional sync.
 *
 * Only the initiator taps this button — the partner doesn't need to do
 * anything as long as their app is running with Bluetooth on (their listener
 * handles the request automatically).
 *
 * Flow:
 *   1. Build our outbound package (empty if no local changes).
 *   2. Send a sync_data envelope to the partner with `respondWith: true`.
 *   3. The partner's listener processes our package and sends back their own.
 *   4. Our listener emits `sync_received` when the partner's response lands.
 *   5. Resolve with success.
 *
 * If the partner is offline or their app is closed, step 2 fails or step 4
 * times out, and we surface the error.
 */
export async function syncViaBluetooth(
  timeoutMs = 90_000,
): Promise<BluetoothBidirectionalResult> {
  try {
    const btConfig = await getBluetoothSyncConfig();
    if (!btConfig.bondedPeerAddress) {
      return {
        success: false, sentChanges: false, importedChanges: false,
        error: 'No peer device selected. Choose a device first.',
      };
    }

    const deviceConfig = await getConfig<DeviceConfig>('device');
    if (!deviceConfig) {
      return {
        success: false, sentChanges: false, importedChanges: false,
        error: 'Device not configured.',
      };
    }

    // Ensure our listener is running so we can receive the partner's reply.
    // If it isn't (e.g. listener wasn't started yet on app boot), start it.
    if (!bluetoothListener.isRunning()) {
      bluetoothListener.start();
    }

    const profile = await getConfig<Profile>('profile');
    const myMemberId = await getConfig<string>('my_member_id');

    // Build outbound package — even if empty, we still send so the partner
    // knows we want to sync.
    const outbound = await createRawBluetoothSyncPackage(
      deviceConfig.deviceId,
      `pair_${deviceConfig.deviceId}`,
      btConfig.lastSentSequence,
      myMemberId ?? undefined,
    );

    let pkgObj: unknown;
    let outboundSequenceTo = btConfig.lastSentSequence;
    const hasOutgoingChanges = !!outbound;

    if (outbound) {
      pkgObj = JSON.parse(outbound.payload);
      outboundSequenceTo = outbound.sequenceTo;
    } else {
      pkgObj = buildSyncPackage(
        [],
        deviceConfig.deviceId,
        `pair_${deviceConfig.deviceId}`,
        myMemberId ?? undefined,
      );
    }

    const envelope: BluetoothEnvelope = {
      type: 'sync_data',
      from: profile?.myName ?? 'partner',
      deviceId: deviceConfig.deviceId,
      respondWith: true,
      package: pkgObj,
    };

    // Subscribe to the response BEFORE sending, so we don't miss a fast reply.
    const responsePromise = waitForSyncResponse(timeoutMs);

    const sendResult = await sendEnvelope(btConfig.bondedPeerAddress, envelope);
    if (!sendResult.success) {
      responsePromise.cancel();
      const errorMsg = sendResult.error ?? 'Failed to reach partner device';
      await setSyncStatusBluetooth({lastBluetoothError: errorMsg});
      return {success: false, sentChanges: false, importedChanges: false, error: errorMsg};
    }

    // Send succeeded — advance our cursor so we don't resend these changes.
    const now = dayjs().toISOString();
    await updateBluetoothSyncConfig({
      lastSentSequence: outboundSequenceTo,
      lastTransferAt: now,
      lastConnectedDeviceId: btConfig.bondedPeerAddress,
    });

    // Wait for the partner's reply via the listener event.
    const response = await responsePromise.promise;
    if (!response) {
      const errorMsg = 'Partner did not respond. Make sure their app is open with Bluetooth on.';
      await setSyncStatusBluetooth({lastBluetoothError: errorMsg});
      return {
        success: false, sentChanges: hasOutgoingChanges, importedChanges: false,
        error: errorMsg,
      };
    }

    await setSyncStatusBluetooth({lastBluetoothTransferAt: dayjs().toISOString(), lastBluetoothError: null});

    return {
      success: true,
      sentChanges: hasOutgoingChanges,
      importedChanges: response.importedChanges,
    };
  } catch (err: any) {
    const errorMsg = err.message ?? 'Bluetooth sync failed';
    await setSyncStatusBluetooth({lastBluetoothError: errorMsg});
    return {success: false, sentChanges: false, importedChanges: false, error: errorMsg};
  }
}

/**
 * Wait for the next `sync_received` event from the listener, or null on timeout.
 * Returns a cancellable handle so the caller can give up early (e.g. if the
 * initial send failed).
 */
function waitForSyncResponse(
  timeoutMs: number,
): {promise: Promise<BluetoothSyncEvent | null>; cancel: () => void} {
  let sub: EmitterSubscription | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const promise = new Promise<BluetoothSyncEvent | null>(resolve => {
    sub = DeviceEventEmitter.addListener(BT_SYNC_EVENT, (event: BluetoothSyncEvent) => {
      if (settled) return;
      if (event.type !== 'sync_received') return;
      // Only treat responses (wasRequest=false) as our partner's reply. An
      // incoming `wasRequest=true` event means the partner started their own
      // independent sync — let the listener handle it, don't conflate it
      // with our outstanding request.
      if (event.wasRequest) return;
      settled = true;
      if (timer) clearTimeout(timer);
      sub?.remove();
      resolve(event);
    });
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      sub?.remove();
      resolve(null);
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      sub?.remove();
    },
  };
}
