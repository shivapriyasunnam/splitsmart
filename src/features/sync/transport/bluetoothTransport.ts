/**
 * Bluetooth Classic transport adapter.
 *
 * Uses react-native-bluetooth-classic RFCOMM sockets.
 *
 * Wire format:
 *   Every message is a single JSON line terminated with '\n'.
 *   Senders open a fresh socket per message, write the line, and disconnect.
 *   Receivers run an always-on accept loop and process one connection at a
 *   time (see bluetoothListener.ts).
 *
 * Read strategy:
 *   - Server (accept side): event-driven via onDataReceived plus a polled
 *     device.read() fallback — onDataReceived is unreliable on some Android
 *     versions even for accept-side connections.
 *   - Client (connectToDevice side): write-only. onDataReceived does NOT fire
 *     for client-initiated connections in react-native-bluetooth-classic, and
 *     device.read() returns empty because the library's background thread
 *     consumes the stream bytes first. The protocol works around this by
 *     never reading on the client side — responses come back via the other
 *     device connecting to us.
 */
import RNBluetoothClassic, {BluetoothDevice} from 'react-native-bluetooth-classic';
import {SyncTransport, OutboundTransferResult, InboundPayload} from './syncTransport';

export const SERVICE_NAME = 'SplitSmartSync';
// Standard Bluetooth Serial Port Profile UUID.
// connectToDevice() defaults to this UUID on Android; accept() must use the
// same UUID or the remote connection will be refused with
// "read failed, socket might closed or timeout, read ret: -1".
export const SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB';
// Each connectToDevice attempt is capped at 8s. Budget arithmetic for the
// listener-based bidirectional flow:
//   4 attempts × 8s + 3 retry waits × 2s = 38s max before giving up.
// This must stay well under the initiator's syncViaBluetooth timeout (90s)
// so the receiver's reply retries don't outlive the sender's patience.
export const CONNECT_TIMEOUT_MS = 8_000;
// How many times to retry connectToDevice before giving up.
// On physical Android devices the receiver's SDP registration takes 1-3s to
// propagate after accept() is called — the first attempt often fails with
// "read failed, socket might closed or timeout, read ret: -1" for exactly
// this reason. Retrying after a short delay reliably resolves it.
export const MAX_CONNECT_RETRIES = 4;
export const CONNECT_RETRY_DELAY_MS = 2_000;
// How long the receiver waits for the sender's data line after connecting.
export const READ_TIMEOUT_MS = 30_000;
// Delay after write() before disconnect() on the sender side.
// write() returns as soon as bytes enter the OS RFCOMM buffer, NOT after they
// are actually transmitted over the air. Disconnecting immediately causes
// Android to close the socket before the bytes leave the device, so the
// receiver's accept() returns but onDataReceived never fires (read timeout).
// Waiting gives the radio layer time to flush the buffer.
export const WRITE_FLUSH_DELAY_MS = 1_500;

export interface BluetoothAck {
  status: 'ok' | 'error';
  packageId: string;
  error?: string;
}

export interface BluetoothDeviceInfo {
  address: string;
  name: string;
  bonded?: boolean;
}

/**
 * Envelope used by the listener-based bidirectional protocol. Every wire
 * message is one of these, serialized as a single JSON line.
 *
 *  - `sync_data`: carries a sync package. If `respondWith` is true, the
 *    receiver should send back its own sync_data with `respondWith: false`.
 */
export interface BluetoothEnvelope {
  type: 'sync_data';
  from: string;            // Sender's display name (for toast on receiver)
  deviceId: string;        // Sender's app deviceId (for logging / future use)
  respondWith: boolean;    // True if receiver should send back their own package
  package: unknown;        // Parsed SyncPackage object (validated downstream)
}

// ─── Permission helpers (Android only) ───────────────────────────────────────

/**
 * Returns a list of bonded (paired) Bluetooth Classic devices.
 * Throws if Bluetooth is disabled.
 */
export async function getBondedDevices(): Promise<BluetoothDeviceInfo[]> {
  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabled) {
    throw new Error('Bluetooth is disabled. Please enable Bluetooth and try again.');
  }
  const devices = await RNBluetoothClassic.getBondedDevices();
  return devices.map(d => ({address: d.address, name: d.name, bonded: true}));
}

/**
 * Discovers nearby devices (requires BLUETOOTH_SCAN / BLUETOOTH permission).
 * Returns all found devices. May take several seconds.
 */
export async function discoverDevices(): Promise<BluetoothDeviceInfo[]> {
  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabled) {
    throw new Error('Bluetooth is disabled. Please enable Bluetooth and try again.');
  }
  const devices = await RNBluetoothClassic.startDiscovery();
  return devices.map(d => ({address: d.address, name: d.name, bonded: d.bonded === true}));
}

/**
 * Request that Bluetooth be enabled. Resolves true if the user enables it.
 */
export async function requestBluetoothEnabled(): Promise<boolean> {
  return RNBluetoothClassic.requestBluetoothEnabled();
}

// ─── Buffer helpers ───────────────────────────────────────────────────────────

/**
 * Poll buf.data every 50 ms until a complete message is available, then return
 * it.
 *
 * react-native-bluetooth-classic's default DelimitedStringDeviceConnection
 * strips the '\n' delimiter BEFORE delivering data via onDataReceived/read().
 * The complete JSON arrives WITHOUT '\n', so we must also return non-empty
 * buffer content as a finished message (not only '\n'-terminated lines).
 *
 * The caller is responsible for attaching onDataReceived to fill buf BEFORE
 * calling this, so there is zero window in which arriving bytes can be missed.
 */
export function waitForLine(
  buf: {data: string},
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tryConsume = (): string | null => {
      // '\n'-terminated path: safety net if raw mode or library behaviour changes.
      const nl = buf.data.indexOf('\n');
      if (nl !== -1) {
        const line = buf.data.slice(0, nl);
        buf.data = buf.data.slice(nl + 1);
        return line;
      }
      // Default DelimitedStringDeviceConnection strips '\n' before delivering
      // the message via onDataReceived / read().  A non-empty buffer IS the
      // complete message.
      if (buf.data.length > 0) {
        const line = buf.data;
        buf.data = '';
        return line;
      }
      return null;
    };

    // Data may have already arrived before this function was called.
    const immediate = tryConsume();
    if (immediate !== null) { resolve(immediate); return; }

    const interval = setInterval(() => {
      const line = tryConsume();
      if (line !== null) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve(line);
      }
    }, 50);

    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Bluetooth read timed out'));
    }, timeoutMs);
  });
}

// ─── BluetoothTransport (legacy one-way send, used by sendViaBluetooth) ──────

export class BluetoothTransport implements SyncTransport {
  readonly id = 'bluetooth' as const;

  constructor(private readonly peerAddress: string) {}

  async sendPackage(args: {
    filename: string;
    encryptedPayload: string;
    packageId: string;
  }): Promise<OutboundTransferResult> {
    const ok = await sendLine(this.peerAddress, args.encryptedPayload);
    return ok.success
      ? {success: true, remoteAcked: true}
      : {success: false, remoteAcked: false, error: ok.error};
  }

  async receivePackages(): Promise<InboundPayload[]> {
    return [];
  }
}

/**
 * Connect to `peerAddress` and write a single line terminated with '\n'.
 * Retries on transient errors. Disconnects after WRITE_FLUSH_DELAY_MS so the
 * radio has time to actually transmit before the socket closes.
 */
export async function sendLine(
  peerAddress: string,
  line: string,
): Promise<{success: true} | {success: false; error: string}> {
  let lastError = 'Bluetooth send failed';

  for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
    let device: BluetoothDevice | null = null;
    try {
      device = await Promise.race([
        RNBluetoothClassic.connectToDevice(peerAddress, {uuid: SPP_UUID, charset: 'utf-8', secure_socket: false}),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS),
        ),
      ]);

      // Android RFCOMM sockets need a brief moment to fully settle after the
      // connectToDevice promise resolves before writes will succeed.
      await new Promise<void>(r => setTimeout(r, 500));

      await device.write(line + '\n');

      // Wait for the RFCOMM buffer to actually transmit before disconnecting.
      // write() resolves when bytes enter the OS buffer, not when they leave
      // the radio. Disconnecting immediately drops the socket before the
      // receiver sees any data.
      await new Promise<void>(r => setTimeout(r, WRITE_FLUSH_DELAY_MS));

      return {success: true};
    } catch (err: any) {
      lastError = err.message ?? 'Bluetooth send failed';
      if (attempt < MAX_CONNECT_RETRIES) {
        await new Promise<void>(r => setTimeout(r, CONNECT_RETRY_DELAY_MS));
      }
    } finally {
      if (device) {
        try { await device.disconnect(); } catch { /* ignore */ }
      }
    }
  }

  return {success: false, error: lastError};
}

/**
 * Convenience wrapper: JSON.stringify an envelope and send it as one line.
 */
export async function sendEnvelope(
  peerAddress: string,
  envelope: BluetoothEnvelope,
): Promise<{success: true} | {success: false; error: string}> {
  return sendLine(peerAddress, JSON.stringify(envelope));
}

// ─── Receiver side (legacy single-package accept, used by receiveViaBluetooth)

export interface ReceivedPackage {
  payload: InboundPayload;
  /** Call this to send ACK back to sender upon successful merge */
  ack(result: BluetoothAck): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Enter server/accept mode for exactly one connection.
 * Returns a single ReceivedPackage when a sender connects and delivers a package.
 * The caller must call pkg.disconnect() when done.
 *
 * Used by the legacy one-shot receive path. The new bidirectional flow uses
 * the always-on listener (see bluetoothListener.ts).
 */
export async function acceptInboundPackage(
  timeoutMs = 120_000,
): Promise<ReceivedPackage> {
  await RNBluetoothClassic.cancelAccept().catch(() => {});

  const device: BluetoothDevice = await Promise.race([
    RNBluetoothClassic.accept({serviceName: SERVICE_NAME, uuid: SPP_UUID, charset: 'utf-8', secure_socket: false}),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        RNBluetoothClassic.cancelAccept().catch(() => {});
        reject(new Error('No incoming connection within timeout'));
      }, timeoutMs),
    ),
  ]);

  const readBuf = {data: ''};

  const subscription = device.onDataReceived((event: {data: string}) => {
    readBuf.data += event.data;
  });

  const readFallbackInterval = setInterval(() => {
    (device as any).read().then((chunk: string | null | undefined) => {
      if (chunk && chunk.length > 0) {
        readBuf.data += chunk;
      }
    }).catch(() => {/* ignore read errors */});
  }, 100);

  try {
    const payloadLine = await waitForLine(readBuf, READ_TIMEOUT_MS);
    clearInterval(readFallbackInterval);
    const encryptedPayload = payloadLine.trim();

    if (!encryptedPayload) {
      throw new Error('Receiver: empty payload from sender');
    }

    return {
      payload: {encryptedPayload},
      ack: async (_result: BluetoothAck) => {},
      disconnect: async () => {
        subscription.remove();
        await device.disconnect().catch(() => {});
      },
    };
  } catch (err) {
    clearInterval(readFallbackInterval);
    subscription.remove();
    await device.disconnect().catch(() => {});
    throw err;
  }
}

/**
 * Cancel any pending accept (listening) state.
 */
export async function cancelBluetoothAccept(): Promise<void> {
  await RNBluetoothClassic.cancelAccept();
}
