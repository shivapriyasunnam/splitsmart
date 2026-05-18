# SplitSmart Claude Bluetooth Sync Plan

## Purpose

This document is a focused handoff plan for adding Bluetooth-based sync to SplitSmart without removing or weakening the existing Google Drive sync and backup model.

This is an additive transport, not a replacement architecture.

Related docs:
- See `docs/app-spec.md`
- See `docs/claude-build-plan.md`

## Product Decision

Keep Google Drive sync exactly as a supported path.

Also add a second sync path that works when both users are physically nearby and want to sync directly over Bluetooth without internet or Drive.

The app must support both:
- Google Drive sync and backup
- Bluetooth nearby sync

Google Drive remains the transport for:
- manual `Upload now`
- manual `Sync now`
- encrypted backup snapshots
- best-effort daily EOD upload and backup

Bluetooth is added for:
- manual nearby device-to-device sync
- offline transfer of encrypted incremental sync packages

Bluetooth is not responsible for:
- backup snapshots
- EOD background jobs
- replacing Drive auth or Drive storage

## Non-Negotiable Constraints

The implementation must preserve all of the following:
- local SQLite remains the source of truth
- merge rules stay deterministic and transport-independent
- sync packages remain encrypted before leaving the device
- Bluetooth must reuse the same logical sync package format used by Drive
- Bluetooth must be manual and user-initiated in v1
- Google Drive flow must keep working after Bluetooth is added
- EOD behavior must stay Drive-based: upload unsynced changes first, then upload one encrypted full backup snapshot
- app still supports exactly two people in one shared expense space for v1

## Core Implementation Decision

Do not build a second sync format for Bluetooth.

Instead:
1. keep the existing encrypted sync package format as the canonical payload
2. keep the existing merge service as the canonical import path
3. add Bluetooth as a second transport adapter that can send and receive those encrypted packages

This keeps the hard logic in one place:
- package creation
- encryption/decryption
- validation
- merge rules
- applied-package deduplication

Only transport should change.

## Recommended Transport Choice

Use Bluetooth Classic on Android for v1, not BLE.

Reasoning:
- sync packages are file-like payloads, not tiny sensor messages
- Bluetooth Classic socket streams are simpler for point-to-point transfer
- throughput is better suited to incremental package transfer than BLE characteristics
- the UX is closer to “find device, connect, send package”

Recommended package direction:
- prefer a maintained React Native library that supports Android Bluetooth Classic RFCOMM server/client sockets, discovery, bonding status, read/write streams, and connection lifecycle callbacks

If the first library choice is incompatible with the current React Native version, replace it with a maintained Android-capable alternative that still provides Classic socket APIs. Do not downgrade to BLE unless Classic is genuinely blocked.

## Existing Repo Constraints That Matter

Current repo structure already has useful seams:
- `src/features/sync/services/syncPackageService.ts` builds and encrypts packages
- `src/features/sync/merge/mergeService.ts` imports and merges packages
- `src/features/sync/drive/driveOps.ts` currently mixes transport behavior with sync orchestration
- `src/db/repositories/changeLogRepository.ts` currently tracks Drive upload state via `uploaded_at`
- `src/features/settings/screens/SettingsScreen.tsx` already exposes manual sync controls

Important warning:

The current `change_log.uploaded_at` field is Drive-specific in practice.

Do not reuse that field as Bluetooth delivery state.

If Bluetooth send marks change log rows as uploaded, the app will break Drive expectations because:
- EOD upload would think those changes were already exported to Drive
- manual Drive upload would skip changes that were only sent over Bluetooth

## Required Architecture Refactor

Before wiring Bluetooth sockets into the UI, separate sync orchestration from transport.

Create a structure like this:

```text
src/features/sync/
  services/
    syncPackageService.ts
    syncOrchestrator.ts
  transport/
    syncTransport.ts
    driveTransport.ts
    bluetoothTransport.ts
```

### `syncOrchestrator.ts`

This module should own the transport-agnostic workflow.

Responsibilities:
- create outbound packages
- load and decrypt inbound packages
- validate payloads
- call merge service
- update sync status
- decide when outbound state can be advanced

### `syncTransport.ts`

Define a small transport interface so Drive and Bluetooth can both implement it.

Example shape:

```ts
interface OutboundTransferResult {
  success: boolean;
  remoteAcked: boolean;
  remoteDeviceId?: string;
  error?: string;
}

interface InboundPayload {
  encryptedPayload: string;
  transportMetadata?: Record<string, unknown>;
}

interface SyncTransport {
  id: 'drive' | 'bluetooth';
  sendPackage(args: {filename: string; encryptedPayload: string}): Promise<OutboundTransferResult>;
  receivePackages(args?: Record<string, unknown>): Promise<InboundPayload[]>;
}
```

Do not over-abstract beyond what the current app needs.

## Delivery State Design

This is the main design point Claude must get right.

There are now two different concerns:
- whether a change has been exported to Drive
- whether a change has been sent to the partner over Bluetooth

Those cannot share one boolean or one timestamp.

### Minimum Safe Approach

Keep existing `change_log.uploaded_at` and `package_id` semantics for Drive export only.

Add separate Bluetooth cursor state in local config.

Recommended config key:
- `bluetooth_sync`

Suggested shape:

```json
{
  "bondedPeerAddress": null,
  "bondedPeerName": null,
  "lastSentSequence": 0,
  "lastReceivedAt": null,
  "lastConnectedDeviceId": null
}
```

Bluetooth send should build a package from:
- all `change_log` rows where `local_sequence > bluetooth_sync.lastSentSequence`

After a successful Bluetooth send with explicit receiver acknowledgement:
- advance `lastSentSequence` to the package `sequenceRange.to`

Do not modify `change_log.uploaded_at` during Bluetooth transfer.

This preserves Drive upload behavior while allowing Bluetooth incremental sync.

### Why This Approach Is Good Enough For v1

Because v1 has exactly two devices in one pair.

If Bluetooth is later extended to support multiple peers, move from a single cursor to a per-peer transfer table. Do not add that complexity now unless implementation forces it.

## Shared Package Format

Bluetooth must send the same encrypted package contents that Drive would upload.

That means Bluetooth should reuse:
- `buildSyncPackage`
- encryption service
- package validation
- `mergePackage`

Recommended additions:
- add a helper that can create a package from a sequence cursor, not only from `uploaded_at IS NULL`
- keep the current Drive helper for unsynced Drive uploads

Suggested service split:
- `createEncryptedDriveSyncPackage()` for Drive upload path
- `createEncryptedBluetoothSyncPackage(lastSentSequence)` for Bluetooth send path

Both should produce the same logical package payload type.

## Bluetooth Transfer Protocol

Keep the transport simple and explicit.

### Sender Flow

1. User taps `Send via Bluetooth`
2. App ensures Bluetooth is enabled and permissions are granted
3. App discovers nearby devices or lists bonded devices
4. User selects partner device
5. App builds encrypted sync package from Bluetooth cursor
6. App opens Classic socket connection
7. App sends a small metadata envelope first
8. App sends encrypted package bytes
9. Receiver validates and replies with an ACK containing `packageId`
10. Only after ACK does sender advance `bluetooth_sync.lastSentSequence`
11. UI shows success or actionable failure

### Receiver Flow

1. User taps `Receive via Bluetooth`
2. App enters listening mode as a Classic socket server
3. Optional: app prompts user to make device discoverable for a short window
4. Sender connects
5. Receiver reads metadata envelope and payload
6. Receiver decrypts payload locally
7. Receiver validates JSON shape with Zod before merge
8. Receiver checks `packageId` dedupe
9. Receiver merges package transactionally
10. Receiver returns ACK only after successful validation and merge
11. UI shows imported result count

### Metadata Envelope

Keep envelope small and transport-only.

Suggested shape:

```json
{
  "protocolVersion": 1,
  "payloadType": "splitsmart-sync-package",
  "filename": "2026-05-16T23-59-00Z_pkg-uuid.sync.enc",
  "packageId": "uuid",
  "sourceDeviceId": "device_uuid",
  "byteLength": 12345,
  "sha256": "optional_checksum"
}
```

The actual encrypted payload remains the source of truth.

## Security Requirements

Bluetooth does not relax encryption requirements.

Requirements:
- always transfer encrypted package contents, never plaintext JSON
- continue using the shared couple passphrase for package encryption/decryption
- validate decrypted payload shape before merge
- reject payloads that fail checksum, decryption, schema validation, or package dedupe checks

Optional but useful:
- show local and remote device IDs before confirming first Bluetooth sync
- persist the chosen peer address locally after first successful pairing

Do not rely on Bluetooth pairing alone for security. Pairing helps transport, but package encryption remains mandatory.

## Android Permissions And Platform Work

Claude must handle Android Bluetooth permission differences carefully.

Required work:
- update Android manifest for Bluetooth permissions
- request runtime permissions for Android 12+
- handle older Android discovery permissions if needed by chosen library
- prompt to enable Bluetooth if disabled
- prompt for discoverable mode only when receiving

Typical Android concerns to cover:
- `BLUETOOTH_SCAN`
- `BLUETOOTH_CONNECT`
- `BLUETOOTH_ADVERTISE` only if required by the library or discoverable flow
- location permission only if actually required on the Android/API combination used by the library

Keep permission prompts contextual. Do not request everything on app startup.

## UI Requirements

Add Bluetooth controls to Settings without removing existing Drive controls.

Recommended Settings sections:
- `Google Drive`
- `Bluetooth Sync`
- `Sync Status`

### Bluetooth Section Must Include

- Bluetooth status: on or off
- paired/selected partner device name if known
- button: `Send via Bluetooth`
- button: `Receive via Bluetooth`
- button: `Pair or Choose Device`
- last Bluetooth transfer time
- last Bluetooth error message if present

### UX Rules

- sending and receiving should be separate explicit actions in v1
- do not try to automatically infer both sides from one tap
- receiving mode should show a waiting state and allow cancel
- if there are no new local changes above the Bluetooth cursor, show `No new changes to send`
- if a duplicate package is received, show a safe informational result, not an error

## Proposed Type And Config Changes

Add a Bluetooth config type.

Suggested type:

```ts
export interface BluetoothSyncConfig {
  bondedPeerAddress: string | null;
  bondedPeerName: string | null;
  lastSentSequence: number;
  lastTransferAt: string | null;
  lastConnectedDeviceId: string | null;
}
```

Extend sync status conservatively.

Suggested additions:

```ts
lastBluetoothTransferAt: string | null;
lastBluetoothError: string | null;
```

Avoid rewriting all existing status handling unless necessary.

## File-Level Implementation Plan

### Add

- `src/features/sync/transport/syncTransport.ts`
- `src/features/sync/transport/bluetoothTransport.ts`
- `src/features/sync/services/syncOrchestrator.ts`
- `src/features/sync/services/bluetoothSyncService.ts` if a thin UI-facing wrapper helps
- `src/features/sync/types/bluetooth.ts` if transport types get noisy

### Update

- `src/features/sync/services/syncPackageService.ts`
  - add cursor-based package creation for Bluetooth
  - keep Drive-specific package creation intact
- `src/features/sync/drive/driveOps.ts`
  - move generic sync orchestration logic out so Drive becomes a transport adapter, not the owner of all sync logic
- `src/features/settings/screens/SettingsScreen.tsx`
  - add Bluetooth controls and state
- `src/types/index.ts`
  - add Bluetooth config/status types
- config repository usage under `app_config`
  - persist Bluetooth peer selection and cursor state
- Android native config files
  - manifest permissions
  - any library-specific setup

## Implementation Order

Execute in this order.

### Phase 1: Transport Refactor

Tasks:
- extract transport-agnostic sync orchestration from current Drive ops
- keep existing Drive behavior passing after refactor
- define transport interface

Acceptance criteria:
- manual Drive upload still works
- manual Drive sync still works
- no behavioral regression in merge flow

### Phase 2: Bluetooth State Model

Tasks:
- add Bluetooth config storage in `app_config`
- add cursor-based change selection
- add Bluetooth-specific status fields

Acceptance criteria:
- app can compute Bluetooth outbound changes independently of Drive upload state
- Drive upload state remains unchanged after Bluetooth operations

### Phase 3: Android Bluetooth Integration

Tasks:
- install chosen Bluetooth Classic package
- wire manifest and runtime permissions
- implement enable/discover/pair/connect/listen helpers

Acceptance criteria:
- app can list nearby or bonded devices
- app can enter listening mode
- app can open a socket connection to selected device

### Phase 4: Bluetooth Send/Receive

Tasks:
- send encrypted package over socket
- receive encrypted package over socket
- implement ACK-based completion
- advance Bluetooth cursor only after ACK

Acceptance criteria:
- sender can transfer a package successfully
- receiver can decrypt and merge it successfully
- duplicate receive does not create duplicate rows

### Phase 5: Settings UI

Tasks:
- add Bluetooth Sync section
- add choose device, send, receive, status, and error states
- keep Drive section unchanged except for any small shared status cleanup

Acceptance criteria:
- user can complete nearby sync from Settings without developer tools
- loading, cancel, and error states are visible and understandable

### Phase 6: Tests And Verification

Tasks:
- add unit tests for cursor-based package selection
- add tests for sender cursor advancement only after ACK
- add tests for duplicate package handling
- add tests to prove Bluetooth send does not affect Drive upload state

Acceptance criteria:
- critical sync behavior is covered
- regression tests exist for transport separation

## Validation And Schema Rules

On Bluetooth receive:
- deserialize envelope
- deserialize encrypted payload format
- decrypt using couple passphrase
- parse JSON
- validate package schema with Zod
- verify `packageId` exists
- verify sequence metadata is coherent
- only then call merge

If any step fails:
- do not ACK success
- do not write partial merge state
- show a retryable error to the user

## Error Handling Requirements

Must handle gracefully:
- Bluetooth disabled
- permission denied
- no nearby devices found
- pairing or connection failure
- connection dropped mid-transfer
- checksum mismatch if used
- decryption failure
- malformed package
- already-applied package
- no new local changes to send

Behavior guidance:
- keep local DB usable at all times
- never advance Bluetooth cursor on partial failure
- never modify Drive upload markers during Bluetooth sync
- allow retry without corrupting state

## Important Do-Not-Do List

Do not do any of the following:
- do not replace Drive sync with Bluetooth
- do not use Bluetooth to send plaintext package JSON
- do not mark `change_log.uploaded_at` during Bluetooth send
- do not duplicate merge logic in a Bluetooth-specific merge path
- do not make Bluetooth part of EOD job scheduling
- do not make receiving automatic in the background for v1
- do not add multi-peer or group sync abstractions that the current product does not need

## Recommended Manual Test Matrix

Test at minimum:

1. Device A creates expenses offline, sends via Bluetooth, Device B receives, merged rows appear.
2. Device B receives the same package twice, no duplicates appear.
3. Device A sends via Bluetooth, then still runs Drive upload, and Drive upload still includes those changes.
4. Device A has no new changes beyond Bluetooth cursor, send action reports no-op cleanly.
5. Transfer fails before ACK, sender cursor does not advance.
6. Receiver cannot decrypt with current passphrase, import fails safely.
7. Existing Drive `Upload now` and `Sync now` still behave as before.

## Acceptance Criteria

Bluetooth sync is done for v1 when all of the following are true:
- user can manually send new local changes to the partner device over Bluetooth when both devices are nearby
- receiver can manually listen, receive, decrypt, validate, and merge the package
- package deduplication still works
- Drive sync continues to work unchanged
- Bluetooth send does not interfere with Drive upload state or EOD backup flow
- all transmitted Bluetooth sync payloads are encrypted
- Settings clearly exposes Bluetooth sync controls and status

## Instruction To Claude

Implement Bluetooth as a second transport over the same sync package and merge pipeline.

Prioritize transport separation first. If the code keeps Drive upload state entangled with Bluetooth delivery state, the feature will be unstable.

The clean path is:
- shared package format
- shared encryption
- shared merge
- separate transport adapters
- separate delivery state

That is the bar for this feature.