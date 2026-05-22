/**
 * Always-on Bluetooth sync listener.
 *
 * Runs an accept() loop while Bluetooth is on and a partner is paired. Each
 * connection delivers a single JSON envelope (see BluetoothEnvelope). For a
 * `sync_data` envelope:
 *   - the inbound package is merged via the sync orchestrator
 *   - a `sync_received` event is emitted (subscribers can show a toast)
 *   - if the sender set `respondWith: true`, we send back our own sync_data
 *     with `respondWith: false` so changes flow both directions in one tap
 *
 * Lifecycle: call start() once partner+BT are configured, stop() when either
 * goes away. The loop self-recovers from accept() errors with a 1s backoff.
 */
import RNBluetoothClassic, {BluetoothDevice} from 'react-native-bluetooth-classic';
import {DeviceEventEmitter} from 'react-native';
import dayjs from 'dayjs';

import {getConfig, setConfig} from '../../../db/repositories/configRepository';
import {BluetoothSyncConfig, SyncStatus, DeviceConfig, Profile} from '../../../types';
import {createRawBluetoothSyncPackage, buildSyncPackage} from './syncPackageService';
import {processRawInboundPayload} from './syncOrchestrator';
import {
  SERVICE_NAME,
  SPP_UUID,
  READ_TIMEOUT_MS,
  waitForLine,
  sendEnvelope,
  BluetoothEnvelope,
} from '../transport/bluetoothTransport';

export const BT_SYNC_EVENT = 'bt_sync_event';

export type BluetoothSyncEvent =
  | {
      type: 'sync_received';
      from: string;
      importedChanges: boolean;
      /**
       * True if the sender initiated this sync (respondWith=true on the
       * envelope). False if this is a response to a sync we initiated.
       * UI uses this to decide whether to show the "X synced with you" toast:
       * we only toast on incoming *requests*, not on responses to our own
       * outbound sync (those already get an Alert in the sync flow).
       */
      wasRequest: boolean;
      error?: string;
    };

const BT_CONFIG_KEY = 'bluetooth_sync';

class BluetoothListenerService {
  private running = false;
  private currentDevice: BluetoothDevice | null = null;

  isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Fire-and-forget — the loop handles its own errors.
    this.loop().catch(err => {
      console.warn('[btListener] loop crashed:', err);
      this.running = false;
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    try {
      await RNBluetoothClassic.cancelAccept();
    } catch {
      /* ignore */
    }
    if (this.currentDevice) {
      try { await this.currentDevice.disconnect(); } catch { /* ignore */ }
      this.currentDevice = null;
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let device: BluetoothDevice | null = null;
      try {
        // Cancel any stale accept first so a previous zombie listener cannot
        // intercept the new connection.
        await RNBluetoothClassic.cancelAccept().catch(() => {});

        device = await RNBluetoothClassic.accept({
          serviceName: SERVICE_NAME,
          uuid: SPP_UUID,
          charset: 'utf-8',
          secure_socket: false,
        });

        if (!this.running) {
          await device.disconnect().catch(() => {});
          return;
        }

        this.currentDevice = device;
        await this.handleIncoming(device);
      } catch (err) {
        if (!this.running) return;
        console.warn('[btListener] accept error:', err);
        // Avoid a tight retry loop if Bluetooth is in a bad state.
        await new Promise<void>(r => setTimeout(r, 1000));
      } finally {
        if (device) {
          try { await device.disconnect(); } catch { /* ignore */ }
        }
        this.currentDevice = null;
      }
    }
  }

  /**
   * Read one envelope from `device` and process it. Caller is responsible
   * for disconnecting the device after this returns.
   */
  private async handleIncoming(device: BluetoothDevice): Promise<void> {
    const readBuf = {data: ''};
    const subscription = device.onDataReceived((event: {data: string}) => {
      readBuf.data += event.data;
    });
    const pollInterval = setInterval(() => {
      (device as any).read().then((chunk: string | null | undefined) => {
        if (chunk && chunk.length > 0) readBuf.data += chunk;
      }).catch(() => { /* ignore */ });
    }, 100);

    let line: string;
    try {
      line = (await waitForLine(readBuf, READ_TIMEOUT_MS)).trim();
    } finally {
      clearInterval(pollInterval);
      subscription.remove();
    }

    if (!line) {
      console.warn('[btListener] empty payload');
      return;
    }

    let envelope: BluetoothEnvelope;
    try {
      envelope = JSON.parse(line);
    } catch (err) {
      console.warn('[btListener] invalid JSON envelope:', err);
      return;
    }

    if (envelope.type !== 'sync_data') {
      console.warn('[btListener] unknown envelope type:', envelope.type);
      return;
    }

    // Only auto-accept connections from the paired partner. Anything else is
    // ignored — we still drain the connection but skip processing.
    const btConfig = await getConfig<BluetoothSyncConfig>(BT_CONFIG_KEY);
    const partnerAddress = btConfig?.bondedPeerAddress?.toUpperCase() ?? null;
    const senderAddress = device.address?.toUpperCase() ?? null;
    if (!partnerAddress || partnerAddress !== senderAddress) {
      console.warn('[btListener] ignoring connection from unpaired device', senderAddress);
      return;
    }

    // Process incoming package
    const inboundJson = JSON.stringify(envelope.package);
    const result = await processRawInboundPayload({encryptedPayload: inboundJson});

    const now = dayjs().toISOString();
    const syncStatus = await getConfig<SyncStatus>('sync_status');
    await setConfig('sync_status', {
      ...(syncStatus ?? {}),
      lastBluetoothTransferAt: now,
      lastBluetoothError: result.error ?? null,
    });

    const importedChanges = !!(result.imported && !result.duplicate);

    DeviceEventEmitter.emit(BT_SYNC_EVENT, {
      type: 'sync_received',
      from: envelope.from || 'partner',
      importedChanges,
      wasRequest: envelope.respondWith === true,
      error: result.error,
    } satisfies BluetoothSyncEvent);

    // If the sender asked for a response, send our own sync_data back.
    // We disconnect from the inbound socket first (caller's finally will do
    // that) before opening a fresh outbound connection — RFCOMM does not
    // multiplex reliably on the same socket in this library.
    if (envelope.respondWith) {
      // Detach the inbound socket before initiating outbound so the radio
      // isn't juggling both endpoints simultaneously.
      try { await device.disconnect(); } catch { /* ignore */ }
      this.currentDevice = null;

      // Let the Android RFCOMM stack quiesce before opening a new outbound
      // socket back to the same peer. Without this, the first connectToDevice
      // tends to hang for the full CONNECT_TIMEOUT_MS, pushing the retry chain
      // past the initiator's wait window so they see "partner did not respond"
      // even though we did send.
      await new Promise<void>(r => setTimeout(r, 1000));

      await this.sendResponse();
    }
  }

  /**
   * Build and send our own sync_data back to the paired partner. Reads the
   * partner BT address from BluetoothSyncConfig (more reliable than the
   * disconnected device.address) and falls back to nothing if unset.
   */
  private async sendResponse(): Promise<void> {
    try {
      const deviceConfig = await getConfig<DeviceConfig>('device');
      if (!deviceConfig) return;

      const btConfig = await getConfig<BluetoothSyncConfig>(BT_CONFIG_KEY);
      const peerAddress = btConfig?.bondedPeerAddress;
      if (!peerAddress) {
        console.warn('[btListener] sendResponse: no paired partner address');
        return;
      }

      const profile = await getConfig<Profile>('profile');
      const myMemberId = await getConfig<string>('my_member_id');
      const lastSentSequence = btConfig?.lastSentSequence ?? 0;

      const outbound = await createRawBluetoothSyncPackage(
        deviceConfig.deviceId,
        `pair_${deviceConfig.deviceId}`,
        lastSentSequence,
        myMemberId ?? undefined,
      );

      let pkgObj: unknown;
      let outboundSequenceTo = lastSentSequence;
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
        respondWith: false,
        package: pkgObj,
      };

      console.log('[btListener] sending response to', peerAddress);
      const result = await sendEnvelope(peerAddress, envelope);
      if (result.success) {
        console.log('[btListener] response sent successfully');
        await setConfig(BT_CONFIG_KEY, {
          ...(btConfig ?? {}),
          lastSentSequence: outboundSequenceTo,
          lastTransferAt: dayjs().toISOString(),
          lastConnectedDeviceId: peerAddress,
        });
      } else {
        console.warn('[btListener] response send failed:', result.error);
        const syncStatus = await getConfig<SyncStatus>('sync_status');
        await setConfig('sync_status', {
          ...(syncStatus ?? {}),
          lastBluetoothError: `Reply send failed: ${result.error}`,
        });
      }
    } catch (err: any) {
      console.warn('[btListener] sendResponse threw:', err);
    }
  }
}

export const bluetoothListener = new BluetoothListenerService();
