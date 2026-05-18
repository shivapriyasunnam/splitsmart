# Bluetooth Sync Debugging Log

## Goal

Send local change log entries from Device A to Device B over Bluetooth Classic (RFCOMM), without requiring Google Drive. The flow is:

1. Receiver (Device B) taps **Receive via Bluetooth** → enters `accept()` listen mode
2. Sender (Device A) taps **Send via Bluetooth** → connects, writes two lines (envelope JSON + payload JSON), waits for ACK
3. Receiver reads both lines, merges the sync package into its DB, writes ACK back
4. Sender reads ACK, advances `lastSentSequence` cursor, disconnects

---

## Bugs Fixed

### 1. "No Changes" even after adding a new expense

**Symptom:** `sendViaBluetooth` returned `noChanges: true` every time regardless of new data.

**Root cause A — partial config deserialization:**
`getBluetoothSyncConfig()` used `saved ?? defaults`, which only falls back if `saved` is entirely `null`. If the config was stored before `lastSentSequence` was added to the schema, `saved` exists but `saved.lastSentSequence` is `undefined`. `getChangesAfterSequence(undefined)` binds `NULL` to the SQL parameter, and `WHERE local_sequence > NULL` is always false in SQLite → 0 rows.

**Fix:** Changed to per-field defaults (`saved?.lastSentSequence ?? 0`) so existing partial configs are filled in correctly.

**Root cause B (the real one) — `change_log` table was completely empty:**
Debug logging revealed `total rows in change_log: 0` despite expenses existing in the DB. `react-native-sqlite-storage` does **not** await async callbacks passed to `db.transaction()`. When an `async tx => { await tx.executeSql(...); await writeChangeLog(...) }` callback runs:
1. The first `await tx.executeSql(INSERT)` suspends the async function and returns a Promise to the library
2. The library sees the callback has "returned" and **commits the transaction** with just that one queued statement
3. The async function resumes and calls `writeChangeLog` against an already-closed transaction — silently discarded

This affected `createExpense`, `updateExpense`, `softDeleteExpense`, `upsertMember`, `setBudget`, `deleteBudget`, `createSettlement`, `softDeleteSettlement`.

**Fix:** Replaced all `async tx =>` transaction callbacks with synchronous `tx =>` callbacks. Added `writeChangeLogInTx()` (a synchronous fire-and-forget wrapper) so both `tx.executeSql` calls are queued before the transaction commits. Pre-fetched any data needed inside the callback (e.g. current expense record) **before** opening the transaction to avoid `db.executeSql` deadlocks inside the callback.

---

### 2. "Not connected to `<MAC>`" / `java.io.IOException: read failed, socket might closed or timeout, read ret: -1`

**Symptom A:** Sender reported "Not connected" immediately.

**Root cause:** Android RFCOMM socket isn't fully ready for writes immediately after `connectToDevice` resolves.

**Fix:** Added 200ms delay after `connectToDevice` before the first `device.write()`.

**Symptom B:** Same `read failed` error persisted after the delay was added.

**Root cause:** `accept()` was called without an explicit UUID. The library derives an arbitrary UUID from `serviceName`, while `connectToDevice` connects to the standard **SPP UUID** (`00001101-0000-1000-8000-00805F9B34FB`) by default. The two sides were listening/connecting on completely different UUIDs — Android refused the connection at the socket layer.

**Fix:** Pass `uuid: '00001101-0000-1000-8000-00805F9B34FB'` explicitly to `accept()` so both sides agree.

**Symptom C:** During an earlier attempt, `accept()` was changed from `secure_socket: false` to `charset: 'utf-8'` (accidentally replacing rather than adding). This switched the receiver to a secure RFCOMM socket, which Android rejects without full BT authentication.

**Fix:** Keep both `secure_socket: false` and `charset: 'utf-8'` on both `accept()` and `connectToDevice()`.

---

### 3. "Malformed UTF-8 data" on receiver

**Symptom:** Receiver threw a UTF-8 error when processing the second `device.read()`.

**Root cause:** The original `readWithTimeout` polled `device.available()` then called `device.read()`. On a fast connection, both the envelope line and payload line arrived before the first `read()` call — so `read()` returned both lines concatenated. The second `read()` call then hit an empty/broken socket state and the Java layer threw the UTF-8 error.

**Fix:** Replaced `readWithTimeout` with a buffered `readLine(device, timeout, sharedBuf)` that accumulates chunks and splits on the first `\n`, leaving any remainder in `sharedBuf` for the next `readLine` call.

---

### 4. Performance — removed encryption for Bluetooth

**Symptom:** "Bluetooth read timed out" on sender (an earlier instance).

**Root cause:** PBKDF2 at 100,000 iterations on a mid-range Android takes 15–30 seconds to decrypt. The sender waited 30s for the ACK, receiver was still mid-decryption.

**Fix:** Removed encryption from the Bluetooth path entirely:
- Added `createRawBluetoothSyncPackage` (raw JSON, no PBKDF2/AES)
- Added `processRawInboundPayload` (JSON parse + Zod validate, no decrypt)
- `bluetoothSyncService` now uses both — no passphrase required
- Drive sync path is unchanged and still fully encrypted
- Read timeout raised to 90s as a safety margin

---

## Current State — Still Failing: "Bluetooth read timed out"

**Symptom:** Sender connects successfully, writes both lines, but times out (90s) waiting for the ACK. Receiver either never sends the ACK, or sends it after the sender has already disconnected.

**Most likely root cause:** `react-native-bluetooth-classic` runs a native background thread per connection that continuously reads bytes off the `InputStream` and fires `onDataReceived` JS events. Once that thread has consumed the bytes, `device.available()` returns 0.

The current `readLine` uses `onDataReceived` events (fixed in last iteration) on the **receiver** side. However the **sender** also calls `readLine` to wait for the ACK — and the problem may be that `onDataReceived` is not fired on the sender's device connection (only on accept-side connections), or the event subscription is not set up before the ACK write arrives.

**Things to investigate next:**

1. **Does `onDataReceived` work on the client/sender side?** The library may only emit this event for server-side (accepted) connections, not for client-initiated connections via `connectToDevice`. If so, the sender needs a different read strategy — possibly `device.read()` in a tight retry loop, or using the library's stream/delimiter mode.

2. **Is the receiver actually processing and calling `ack()`?** Add a log on the receiver before `inbound.ack(ack)` is called to confirm the receive side completes.

3. **Does the ACK write actually flush?** Even with the 800ms `ACK_FLUSH_DELAY_MS`, the sender may disconnect its end first. Confirm the sender's `readLine` is still awaiting when the receiver calls `ack()`.

4. **Alternative: use the library's built-in delimiter mode** — configure a newline delimiter at connection time so the library reassembles complete lines natively and delivers them as discrete events, rather than raw byte chunks.

---

## File Map

| File | Role |
|---|---|
| `src/features/sync/transport/bluetoothTransport.ts` | RFCOMM send/receive, `readLine`, `acceptInboundPackage` |
| `src/features/sync/services/bluetoothSyncService.ts` | UI-facing orchestration, cursor management |
| `src/features/sync/services/syncPackageService.ts` | Build raw/encrypted packages from change_log |
| `src/features/sync/services/syncOrchestrator.ts` | Decrypt/validate/merge inbound payloads |
| `src/db/repositories/changeLogRepository.ts` | `writeChangeLogInTx`, `getChangesAfterSequence` |
| `src/db/repositories/expenseRepository.ts` | Fixed async transaction bug |
| `src/db/repositories/memberRepository.ts` | Fixed async transaction bug |
| `src/db/repositories/budgetRepository.ts` | Fixed async transaction bug |
| `src/db/repositories/settlementRepository.ts` | Fixed async transaction bug |
