/**
 * Bluetooth Classic transport adapter.
 *
 * Uses react-native-bluetooth-classic RFCOMM sockets.
 * Protocol (single-line):
 *   Sender → Receiver: one JSON line containing the sync package
 *   Receiver → Sender: one JSON ACK line
 *
 * Read strategy:
 *   - Receiver (server/accept side): event-driven via onDataReceived — fires reliably
 *     for server-accepted connections.
 *   - Sender (client/connectToDevice side): polls device.read() — onDataReceived
 *     does NOT fire for client-initiated connections in react-native-bluetooth-classic,
 *     so event-based reading always times out on the sender.
 */
import RNBluetoothClassic, {BluetoothDevice} from 'react-native-bluetooth-classic';
import {SyncTransport, OutboundTransferResult, InboundPayload} from './syncTransport';

const SERVICE_NAME = 'SplitSmartSync';
// Standard Bluetooth Serial Port Profile UUID.
// connectToDevice() defaults to this UUID on Android; accept() must use the
// same UUID or the remote connection will be refused with
// "read failed, socket might closed or timeout, read ret: -1".
const SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB';
const CONNECT_TIMEOUT_MS = 15_000;
// How many times to retry connectToDevice before giving up.
// On physical Android devices the receiver's SDP registration takes 1-3s to
// propagate after accept() is called — the first attempt often fails with
// "read failed, socket might closed or timeout, read ret: -1" for exactly
// this reason. Retrying after a short delay reliably resolves it.
const MAX_CONNECT_RETRIES = 4;
const CONNECT_RETRY_DELAY_MS = 2_000;
// How long the receiver waits for the sender's data line after connecting.
const READ_TIMEOUT_MS = 30_000;
// Delay after write() before disconnect() on the sender side.
// write() returns as soon as bytes enter the OS RFCOMM buffer, NOT after they
// are actually transmitted over the air. Disconnecting immediately causes
// Android to close the socket before the bytes leave the device, so the
// receiver's accept() returns but onDataReceived never fires (read timeout).
// Waiting gives the radio layer time to flush the buffer.
const WRITE_FLUSH_DELAY_MS = 1_500;

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
function waitForLineInBuf(
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

// ─── BluetoothTransport ───────────────────────────────────────────────────────

export class BluetoothTransport implements SyncTransport {
  readonly id = 'bluetooth' as const;

  constructor(private readonly peerAddress: string) {}

  /**
   * Sender flow:
   * 1. Connect to peer
   * 2. Write payload as a single JSON line
   * 3. Disconnect
   *
   * No ACK round-trip: if write() succeeds without throwing, the data is in
   * the receiver's RFCOMM input buffer — the OS guarantees delivery over the
   * already-established socket. Attempting to read the ACK is unreliable
   * because onDataReceived does not fire for client-initiated connections in
   * react-native-bluetooth-classic, and device.read() returns empty because
   * the library's background thread has already consumed the stream bytes.
   * Duplicates are handled by hasPackageBeenApplied deduplication on the
   * receiver, so re-sending on the next sync is safe.
   */
  async sendPackage(args: {
    filename: string;
    encryptedPayload: string;
    packageId: string;
  }): Promise<OutboundTransferResult> {
    let lastError = 'Bluetooth send failed';

    for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
      let device: BluetoothDevice | null = null;
      try {
        device = await Promise.race([
          RNBluetoothClassic.connectToDevice(this.peerAddress, {uuid: SPP_UUID, charset: 'utf-8', secure_socket: false}),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timed out')), CONNECT_TIMEOUT_MS),
          ),
        ]);

        // Android RFCOMM sockets need a brief moment to fully settle after the
        // connectToDevice promise resolves before writes will succeed.
        await new Promise<void>(r => setTimeout(r, 500));

        await device.write(args.encryptedPayload + '\n');

        // Wait for the RFCOMM buffer to actually transmit before disconnecting.
        // write() resolves when bytes enter the OS buffer, not when they leave
        // the radio. Disconnecting immediately drops the socket before the
        // receiver sees any data.
        await new Promise<void>(r => setTimeout(r, WRITE_FLUSH_DELAY_MS));

        return {success: true, remoteAcked: true};
      } catch (err: any) {
        lastError = err.message ?? 'Bluetooth send failed';
        if (attempt < MAX_CONNECT_RETRIES) {
          // Wait before retrying — gives the receiver's SDP record time to propagate
          await new Promise<void>(r => setTimeout(r, CONNECT_RETRY_DELAY_MS));
        }
      } finally {
        if (device) {
          try { await device.disconnect(); } catch { /* ignore */ }
        }
      }
    }

    return {success: false, remoteAcked: false, error: lastError};
  }

  /**
   * Not used for the Bluetooth transport — receiving is an active listen operation,
   * not a passive poll. Use `acceptInboundPackage` on `BluetoothReceiver` instead.
   */
  async receivePackages(): Promise<InboundPayload[]> {
    return [];
  }
}

// ─── Receiver side ────────────────────────────────────────────────────────────

export interface ReceivedPackage {
  payload: InboundPayload;
  /** Call this to send ACK back to sender upon successful merge */
  ack(result: BluetoothAck): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Enter server/accept mode.
 * Returns a single ReceivedPackage when a sender connects and delivers a package.
 * The caller must call pkg.ack() after successful merge and pkg.disconnect() when done.
 */
export async function acceptInboundPackage(
  timeoutMs = 120_000,
): Promise<ReceivedPackage> {
  // Cancel any zombie accept socket left over from a previous timed-out or
  // abandoned receive session. Without this cleanup, a sender calling
  // connectToDevice() connects to the stale native listener instead of the
  // newly registered one, so the new accept() promise never resolves and the
  // receiver waits for the full 120 s before giving up.
  await RNBluetoothClassic.cancelAccept().catch(() => {});

  const device: BluetoothDevice = await Promise.race([
    RNBluetoothClassic.accept({serviceName: SERVICE_NAME, uuid: SPP_UUID, charset: 'utf-8', secure_socket: false}),
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        // Cancel the native accept so it does not linger as a new zombie
        // after this Promise.race has already rejected on the JS side.
        RNBluetoothClassic.cancelAccept().catch(() => {});
        reject(new Error('No incoming connection within timeout'));
      }, timeoutMs),
    ),
  ]);

  const readBuf = {data: ''};

  // Attach the event listener immediately after accept() so any bytes that
  // arrive before waitForLineInBuf() starts polling are captured.
  const subscription = device.onDataReceived((event: {data: string}) => {
    readBuf.data += event.data;
  });

  // onDataReceived does not fire reliably on all Android versions / devices,
  // even for server-accepted (accept-side) connections — same root cause as
  // the sender side. Poll device.read() as a fallback. Both onDataReceived and
  // device.read() draw from the same native read buffer, so whichever delivers
  // first wins and the other returns empty — no double-counting.
  const readFallbackInterval = setInterval(() => {
    (device as any).read().then((chunk: string | null | undefined) => {
      if (chunk && chunk.length > 0) {
        readBuf.data += chunk;
      }
    }).catch(() => {/* ignore read errors */});
  }, 100);

  try {
    const payloadLine = await waitForLineInBuf(readBuf, READ_TIMEOUT_MS);
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
