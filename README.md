# SplitSmart

A local-first expense-splitting app for two people, built with React Native. No backend server, no account system — expenses, budgets, and balances live on-device in SQLite and sync privately between two phones via Google Drive or Bluetooth.

---

## Features

- **Expense tracking** — add, edit, and delete shared expenses with flexible split types (equal, fixed amount, percentage)
- **Auto-categorization** — regex rules automatically suggest a category from the expense title; rules are user-editable and run in priority order
- **Balances** — real-time net balance calculation showing who owes whom and by how much; supports recording settlements
- **Budgets** — per-category monthly budgets with spent / remaining / over-budget tracking
- **Insights** — bar and pie charts showing spend vs. budget by category for any selected month
- **Google Drive sync** — manual upload/sync via a shared Drive folder; all packages are AES-encrypted before leaving the device
- **Bluetooth sync** — direct device-to-device sync over Bluetooth Classic when both phones are nearby
- **Background upload** — best-effort daily job (WorkManager on Android) uploads unsynced changes and a full encrypted backup
- **Sync history** — log of every inbound and outbound sync operation with timestamps and package IDs
- **Fully offline** — all features work without internet; sync is always user-triggered or a background best-effort

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React Native 0.85 (TypeScript) |
| Local storage | SQLite via `react-native-sqlite-storage` |
| State management | Zustand |
| Navigation | React Navigation (bottom tabs + native stack) |
| Forms & validation | React Hook Form + Zod |
| Encryption | CryptoJS — AES-256-CBC + PBKDF2 (100k iterations, SHA-256) |
| Charts | react-native-chart-kit + react-native-svg |
| Animations | Lottie |
| Auth | Google Sign-In for Drive OAuth only |
| Background jobs | react-native-background-fetch (WorkManager bridge on Android) |
| Bluetooth | react-native-bluetooth-classic |

---

## Architecture

### Local-first data model

Each device owns a full SQLite database. All writes produce a row in a `change_log` table that captures the entity type, operation, and full record snapshot. This log is the source of truth for sync — nothing is sent until the user (or the background job) explicitly packages and uploads it.

### Sync pipeline

The sync flow is transport-agnostic. A `SyncTransport` interface abstracts delivery:

```
change_log  →  SyncPackageService  →  encrypt  →  Transport (Drive or BT)
                                                          ↓
                                     decrypt  →  Zod validate  →  MergeService
```

1. **Build** — unsynced `change_log` rows are bundled into a `SyncPackage` with a UUID, device ID, and sequence range.
2. **Encrypt** — the package JSON is encrypted with AES-256-CBC using a key derived from the shared passphrase via PBKDF2.
3. **Deliver** — the ciphertext is uploaded to the device's subfolder in the shared Drive folder, or sent over a Bluetooth socket.
4. **Receive** — the partner device fetches, decrypts, and Zod-validates the package before touching the database.
5. **Merge** — a deterministic last-write-wins merge by `updated_at` applies changes; `deleted_at` soft-deletes win over older updates. Already-applied package IDs are deduped via `sync_packages_applied`.

### Drive folder layout

```
SplitSmart/
  devices/
    device_A/
      changes/     ← incremental sync packages from A
      backups/     ← full encrypted snapshots from A
    device_B/
      changes/
      backups/
```

### Balance calculation

For each expense the app derives each member's share from the split rule, then aggregates:

```
net = total_paid_by_me - my_share
net > 0  →  partner owes you
net < 0  →  you owe partner
```

Settlements are additive and reduce the open balance.

---

## Project Structure

```
src/
  app/
    navigation/       # AppNavigator, tab and stack setup
    providers/        # AppProvider, Zustand store root
    theme/            # colours, typography, spacing tokens
  components/         # shared UI components
  db/
    migrations/       # schema migration runner
    repositories/     # one file per table (expenses, budgets, members, …)
    schema/           # CREATE TABLE definitions
  features/
    auth/             # login screen, hardcoded user config
    balances/         # balance screen + balance service
    budgets/          # budgets screen + budget service
    categories/       # auto-categorization service
    expenses/         # expense list + add/edit screen
    insights/         # charts screen
    settings/         # settings screen, backup/restore, sync history
    sync/
      crypto/         # AES encrypt/decrypt, PBKDF2 key derivation
      drive/          # Drive REST API operations
      merge/          # deterministic merge logic
      jobs/           # end-of-day background upload job
      services/       # sync orchestrator, package builder, BT listener
      transport/      # SyncTransport interface, Drive + BT implementations
  types/              # shared TypeScript types
```

---

## Getting Started

### Prerequisites

- Node >= 22
- Java 17 (`brew install openjdk@17`)
- Android Studio with SDK Platform 34 + Build-Tools 34
- Environment variables in `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
```

### Install dependencies

```bash
npm install
```

### Configure users

Edit `src/features/auth/constants/users.ts` to set your own display names, usernames, passwords, and shared encryption passphrase before use.

### Run on Android

```bash
# Terminal 1 — Metro bundler
npm start

# Terminal 2 — build and install
npm run android
```

### Run on iOS

```bash
bundle install
bundle exec pod install
npm run ios
```

### Google Drive sync setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com) and enable the **Google Drive API**.
2. Create an OAuth 2.0 client ID for Android (package name: `com.splitsmart`).
3. Get the SHA-1 fingerprint: `cd android && ./gradlew signingReport`
4. Add the SHA-1 to your OAuth client, download `google-services.json`, and place it at `android/app/google-services.json`.

---

## Tests

```bash
# All unit tests
npm test

# Individual service tests
npx jest balanceService         # balance math
npx jest categorizationService  # auto-categorization regex
npx jest budgetService          # budget rows + summary
npx jest encryptionService      # AES encrypt/decrypt round-trip
npx jest mergeService           # sync merge logic (DB mocked)
npx jest eodSequence            # upload-before-backup ordering

# With coverage
npx jest --coverage
```

---

## Building an APK

```bash
# Debug
cd android && ./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk

# Release
cd android && ./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk

# Install directly on a connected device
adb install android/app/build/outputs/apk/debug/app-debug.apk
```
