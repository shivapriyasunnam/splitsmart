# SplitSmart Claude Build Plan

## Purpose

This document is a detailed handoff plan for building SplitSmart in React Native for Android.

The goal is to give another coding agent enough specificity to implement the app end-to-end without making product-level assumptions that conflict with the agreed requirements.

This document is intentionally more prescriptive than the product spec.

Related product spec:
- See `docs/app-spec.md`

## Non-Negotiable Constraints

The implementation must preserve all of the following:
- Android app built with React Native.
- Fully local-first architecture.
- No custom backend server.
- No app login, user account system, or email/password auth.
- Google authentication exists only for Google Drive access.
- Local SQLite database is the source of truth.
- Google Drive is only for sync transport and encrypted backup storage.
- Manual sync and manual upload must exist.
- Best-effort end-of-day job must upload unsynced changes first, then upload one encrypted full backup snapshot.
- App supports exactly two people in one shared expense space for v1.
- Category must remain editable even when auto-categorization suggests a category.

## Primary Deliverable

Build a usable Android app with these tabs:
- Expenses
- Balances
- Budgets
- Insights
- Settings

The app must support:
- adding, editing, soft deleting expenses
- editable categories
- regex-based auto-categorization
- total owed and total to pay calculations
- settlement recording
- per-category monthly budgets
- spend-vs-budget visualizations
- Google Drive connect/disconnect
- manual upload now
- manual sync now
- daily best-effort EOD upload
- encrypted Drive sync packages and encrypted full backup snapshots

## Recommended Technical Stack

Unless there is a hard integration issue, use the following stack:
- React Native with TypeScript
- React Navigation for app navigation
- SQLite for local persistence
- Zustand or Redux Toolkit for app state that must be shared across screens
- Zod for validation of payloads and sync packages
- React Hook Form for forms if that speeds implementation
- Google Sign-In for Google authentication
- Google Drive REST API for folder/file operations
- Android WorkManager via a React Native bridge for best-effort daily sync/upload jobs
- A maintained chart library for bar/pie charts
- A maintained crypto library or native bridge for AES-GCM encryption and PBKDF2 or Argon2 key derivation
- Day.js or date-fns for date handling
- UUID generation library

If any chosen package is outdated or incompatible, replace it with a current maintained alternative, but preserve architecture and behavior.

## Expected Project Structure

The app should be organized by feature and platform concern, not as a flat file dump.

Recommended structure:

```text
src/
  app/
    navigation/
    providers/
    theme/
  db/
    schema/
    migrations/
    repositories/
    queries/
  features/
    expenses/
      components/
      screens/
      hooks/
      services/
      utils/
    balances/
      components/
      screens/
      services/
    budgets/
      components/
      screens/
      services/
    insights/
      components/
      screens/
      services/
    settings/
      components/
      screens/
      services/
    categories/
      components/
      services/
    sync/
      services/
      crypto/
      drive/
      jobs/
      merge/
      types/
    profile/
      screens/
      services/
  components/
  hooks/
  lib/
  types/
  utils/
```

## Phase Breakdown

Build in the following order.

### Phase 1: Project Setup and App Shell

Tasks:
- Initialize React Native Android project with TypeScript.
- Configure linting, formatting, TypeScript strictness, and path aliases if useful.
- Add bottom tab navigation with placeholder screens:
  - Expenses
  - Balances
  - Budgets
  - Insights
  - Settings
- Add a base theme system with colors, spacing, typography, and reusable card/button/input primitives.
- Set up local environment variable handling for Google API configuration if needed.

Acceptance criteria:
- App launches on Android emulator/device.
- Bottom tabs render and switch correctly.
- Theme primitives exist for buttons, cards, form fields, loading states, and empty states.

### Phase 2: Local Database and Domain Layer

Tasks:
- Add SQLite integration.
- Implement DB initialization and migration runner.
- Create schema for all v1 tables.
- Seed default categories.
- Seed default auto-categorization rules.
- Implement repository/service layer for CRUD and query operations.

Required tables:
- members
- categories
- category_rules
- expenses
- budgets
- settlements
- change_log
- sync_packages_applied
- app_config

Implementation notes:
- Use UUIDs for entity IDs.
- Use minor currency units for all money storage.
- Use ISO timestamps in UTC for sync-related timestamps.
- Use soft deletes via `deleted_at` where deletion should propagate.
- Add indexes on query-heavy fields such as:
  - expenses.expense_date
  - expenses.category_id
  - expenses.paid_by_member_id
  - budgets.month_key
  - change_log.local_sequence
  - change_log.uploaded_at

Acceptance criteria:
- Fresh install initializes DB successfully.
- Default categories and regex rules are created once.
- CRUD operations work for expenses, budgets, category rules, and settlements.
- Migrations are idempotent and versioned.

### Phase 3: Local Setup Flow

Tasks:
- Build an initial setup flow shown only when local profile is incomplete.
- Collect:
  - my name
  - partner name
  - my role: person A or person B
  - default currency
  - shared couple passphrase for encryption
- Persist this in local configuration.
- Allow revisiting and editing profile settings later.

Implementation notes:
- This is not login.
- Do not create remote accounts.
- Couple passphrase should never be stored as raw plaintext if avoidable.
- Store derived or protected key material securely where possible.

Acceptance criteria:
- First-time user can complete setup and enter app.
- Profile values are accessible throughout app.
- App can compute which local device maps to which member role.

### Phase 4: Expenses Feature

Tasks:
- Build expenses list screen.
- Build add expense screen.
- Build edit expense screen.
- Support soft delete.
- Support filters by:
  - month
  - category
  - paid by member
- Sort by newest date first by default.
- Show monthly total for visible list.

Expense fields:
- title
- note
- amount
- currency
- expense date
- category
- paid by
- split type
- split payload

v1 split behavior:
- Must support equal split fully.
- Also design DB fields to support fixed amount and percentage.
- UI for fixed amount and percentage can be included if implementation remains stable.
- If not implemented in v1 UI, keep schema ready and default to equal split only.

Validation rules:
- title required
- amount required and > 0
- category required
- paid by required
- date required

Acceptance criteria:
- User can create, edit, delete, and view expenses offline.
- Expense list updates immediately after local writes.
- Expense persists across app restart.

### Phase 5: Categories and Auto-Categorization

Tasks:
- Build category management UI in Settings or a dedicated sub-screen.
- Support create/edit/archive category.
- Build category rules management UI.
- Support add/edit/delete/enable-disable/reorder rules.
- Implement regex matching against title, note, or both.
- Apply first matching rule in priority order when creating/editing expense.
- Keep category editable by user after suggestion.

Implementation notes:
- Invalid regex patterns must be rejected or safely handled.
- Editing a rule must not silently rewrite historical expenses.
- Auto-categorization should trigger on title and note changes.
- If user manually changes category, that chosen value is what gets saved.

Acceptance criteria:
- Default rules prefill category suggestions for matching titles.
- User can override suggestion before saving.
- Rule order affects match result.
- Disabled rules do not participate.

### Phase 6: Balances and Settlements

Tasks:
- Implement balance calculation service.
- Build balances screen with high-level summary cards.
- Show:
  - total shared spend
  - total paid by me
  - total paid by partner
  - my share
  - partner share
  - I owe amount or I should receive amount
  - last sync time
- Build settlement recording flow.
- Show settlement history.

Required math behavior:
- For each expense, derive each member's share based on split rule.
- Compute net contribution for each member.
- Apply settlements to reduce outstanding balances.

Example equal split:
- expense amount 1000
- paid by me
- my share 500
- partner share 500
- net result: I should receive 500 before settlements

Acceptance criteria:
- Balances update immediately after adding/editing expenses.
- Settlements adjust the open balance correctly.
- Numbers remain consistent across app restart and sync import.

### Phase 7: Budgets

Tasks:
- Build budgets tab for monthly category budgets.
- Add month selector.
- Show each category with:
  - budget amount
  - current spend in selected month
  - remaining amount
  - percent used
  - over-budget state
- Support add/edit/remove monthly category budget.
- Optionally support overall monthly budget if implementation is straightforward.

Implementation notes:
- Categories without budget should show `No budget set`.
- Spend calculations should use both members' combined local data after sync.
- Budget rows should be easy to scan and color-coded for healthy/warning/over budget states.

Acceptance criteria:
- User can set budget per category for a specific month.
- Budgets persist locally.
- Spend totals reflect expense data accurately.

### Phase 8: Insights and Charts

Tasks:
- Build insights tab.
- Add month filter.
- Add summary cards:
  - total spent
  - total budget
  - remaining budget
  - overspent categories count
- Add bar chart for category spend vs budget.
- Add donut or pie chart for spend by category.
- Optionally add trend strip or monthly comparison if time allows, but not required for v1.

Implementation notes:
- Charts must use combined data after sync, not per-device-only assumptions.
- Empty states must render gracefully when there is no data.
- Category colors should be reused consistently between budgets and charts.

Acceptance criteria:
- Insights render without crashing for empty and populated datasets.
- Chart totals match computed budget/spend services.

### Phase 9: Google Authentication and Drive Setup

Tasks:
- Integrate Google Sign-In.
- Request only the scopes needed for Drive operations.
- Build Drive connection flow in Settings.
- Allow user to create or select the shared app folder in Drive.
- Store Drive folder metadata locally.
- Add disconnect/reconnect flow.

Implementation notes:
- No in-app login system.
- Google auth is only to access Drive files.
- The app must work offline even if Drive is disconnected.
- Any access token handling should be delegated to maintained auth libraries when possible.

Drive folder structure requirement:

```text
SplitSmart/
  devices/
    <device_id>/
      changes/
      backups/
```

Also store or derive partner device folder identity so sync knows where to look for incoming packages.

Acceptance criteria:
- User can connect Google account.
- App can create or find shared Drive folder.
- App can disconnect without breaking local app usage.

### Phase 10: Sync Package Generation and Upload

Tasks:
- Implement change logging on all sync-relevant mutations.
- Generate incremental sync packages from unsynced change_log rows.
- Encrypt packages before upload.
- Upload encrypted packages to current device's Drive `changes/` folder.
- Mark uploaded rows with package metadata only after successful upload.
- Expose `Upload now` in Settings.

Sync package requirements:
- package ID UUID
- source device ID
- pair ID
- created timestamp
- sequence metadata or cursor metadata
- list of changes

Each change entry should include:
- entity type
- entity ID
- operation
- serialized record payload
- updated timestamp

Implementation notes:
- Upload must be idempotent where possible.
- Failure during upload must not mark changes as uploaded.
- Package naming should be sortable by time.
- Example filename:
  - `2026-05-16T23-59-00Z_pkg-uuid.sync.enc`

Acceptance criteria:
- Editing local data creates change log entries.
- `Upload now` creates encrypted package and uploads to Drive.
- Uploaded rows are marked correctly.
- Retry after failure does not corrupt state.

### Phase 11: Sync Download and Merge

Tasks:
- Implement `Sync now` action.
- Fetch partner device change packages from Drive.
- Skip already applied package IDs.
- Download and decrypt new packages.
- Validate payload shape.
- Merge changes into local DB in a transaction.
- Record package as applied after successful merge.
- Update sync metadata and last sync time.

Merge rules:
- Records are identified by UUID.
- Compare `updated_at`.
- Newer record wins.
- Soft delete via `deleted_at` wins over older active version.
- Ignore duplicate package import if already applied.

Implementation notes:
- Merge must be deterministic.
- Do not duplicate expenses or budgets on repeated sync.
- Sync should be safe to rerun.

Acceptance criteria:
- Device A can upload changes.
- Device B can sync and see imported changes.
- Re-running sync does not duplicate records.
- Conflict resolution is deterministic and stable.

### Phase 12: Full Backup Snapshot and Restore Readiness

Tasks:
- Implement full encrypted local snapshot export.
- Upload snapshot to Drive `backups/` folder.
- Keep snapshot separate from incremental sync packages.
- Add basic local restore/export hooks if practical, even if full restore UI is deferred.

Implementation notes:
- Snapshot is for disaster recovery, not routine merge sync.
- Retention policy can keep latest N snapshots per device if easy to implement.
- At minimum, latest snapshot should overwrite or coexist predictably.

Acceptance criteria:
- App can generate encrypted full backup file.
- Backup uploads to Drive successfully.
- Backup flow does not interfere with normal sync packages.

### Phase 13: End-of-Day Background Job

Tasks:
- Integrate WorkManager-backed best-effort daily job.
- Job sequence must be:
  1. upload any unsynced changes
  2. upload one encrypted full backup snapshot
- If job window is missed, app should run catch-up logic on next app open after the intended schedule boundary.
- Expose last EOD run status in Settings.

Implementation notes:
- Do not promise exact midnight execution.
- Present this in UI as daily automatic upload or daily backup sync, not exact-time sync.
- Make the job safe to rerun.

Acceptance criteria:
- Background job can be scheduled.
- Manual simulation/testing path exists.
- Missed schedule is recovered on next app open.

### Phase 14: Settings Screen Completion

Tasks:
- Build settings sections for:
  - local profile
  - currency and preferences
  - category rule management entry point
  - Drive connection status
  - shared folder metadata
  - sync now
  - upload now
  - last sync time
  - last upload time
  - last EOD run status
  - export/import backup entry points if implemented
- Add loading and error states for Drive operations.
- Add clear user-facing status messages.

Acceptance criteria:
- Settings acts as the operational control center for sync and configuration.
- User can understand whether Drive is connected and when last sync/upload occurred.

### Phase 15: Quality, Error Handling, and Polish

Tasks:
- Add empty states, skeletons, retry states, and non-blocking error messaging.
- Add confirmation flows for destructive actions.
- Ensure app still works fully locally if Drive is unavailable.
- Verify offline behavior explicitly.
- Add input sanitization and defensive parsing for regex, JSON payloads, and Drive file contents.
- Add testing coverage for critical logic.

Test priority areas:
- balance calculations
- auto-categorization rule ordering and overrides
- budget calculations
- sync package generation
- merge conflict handling
- idempotent sync import
- EOD sequencing

Acceptance criteria:
- Core business logic has automated coverage.
- App is resilient to partial failures and offline state.

## Detailed Data Model Guidance

The following is the expected logical schema.

### members
Fields:
- id: UUID
- name: string
- role: `A` or `B`
- created_at
- updated_at

Notes:
- Only two active members for v1.

### categories
Fields:
- id: UUID
- name: string
- color: string hex
- icon: string token name
- is_default: boolean
- is_archived: boolean
- created_at
- updated_at

### category_rules
Fields:
- id: UUID
- category_id: FK categories.id
- pattern: string regex pattern
- target_field: `title` | `note` | `both`
- priority: integer
- is_enabled: boolean
- created_at
- updated_at

Notes:
- Lower priority number can mean higher precedence, or vice versa, but use one consistent rule and document it.

### expenses
Fields:
- id: UUID
- title: string
- note: nullable string
- amount_minor: integer
- currency: string
- expense_date: ISO date string
- category_id: FK categories.id
- paid_by_member_id: FK members.id
- split_type: `equal` | `fixed_amount` | `percentage`
- split_payload_json: JSON string
- created_by_device_id: string
- created_at
- updated_at
- deleted_at nullable

### budgets
Fields:
- id: UUID
- month_key: `YYYY-MM`
- category_id: FK categories.id
- amount_minor: integer
- created_at
- updated_at
- deleted_at nullable

Constraint:
- unique active budget per `month_key + category_id`

### settlements
Fields:
- id: UUID
- amount_minor: integer
- paid_by_member_id
- received_by_member_id
- settlement_date
- note
- created_at
- updated_at
- deleted_at nullable

### change_log
Fields:
- id: UUID
- entity_type
- entity_id
- operation: `upsert` | `delete`
- record_json
- local_sequence: integer autoincrement or monotonic sequence
- created_at
- uploaded_at nullable
- package_id nullable

Notes:
- A change log entry should be created for every sync-relevant create/update/delete.
- Use DB transaction so entity write and change_log write succeed/fail together.

### sync_packages_applied
Fields:
- id: UUID
- package_id: unique
- source_device_id
- applied_at

### app_config
Fields:
- key: unique string
- value_json: string

Suggested keys:
- `profile`
- `device`
- `drive`
- `sync_status`
- `encryption`
- `preferences`

## Balance Logic Requirements

Implement a pure service for balance math so it can be unit tested independently of UI.

For each expense:
- determine total amount
- derive member shares from split rule
- compare shares against payer
- accumulate net positions

For two people, a simple formulation is:
- payer contributes full amount at time of spend
- each person owes their share
- member net = paid_total - owed_total

Then apply settlements:
- if I paid settlement to partner, reduce what partner is owed or increase what I owe accordingly

UI rules:
- only one of these primary labels should be prominent at a time:
  - `You owe`
  - `You should receive`
- if near zero, show `All settled up`

Define a small tolerance only if needed for non-integer conversions, though minor units should avoid this.

## Budget Logic Requirements

Budget calculations must be month-specific.

For selected month:
- sum expense amounts grouped by category
- compare grouped spend against category budget
- compute remaining = budget - spend
- compute percent used = spend / budget when budget > 0

Edge handling:
- if no budget set, do not divide by zero
- if spend exceeds budget, remaining should be negative or show overspent amount clearly

## Auto-Categorization Requirements

Implement a pure categorization helper:
- input: title, note, rules
- output: matching category ID or null

Rules behavior:
- only enabled rules are evaluated
- order by priority
- first match wins
- regex should be case-insensitive unless explicitly configured otherwise
- invalid regex should not crash app

UI behavior:
- suggestion should update while editing title/note
- user override must be respected
- auto suggestion should never silently revert a manual category selection during the same edit session once the user has intentionally changed it

Recommended approach:
- keep a local form flag like `categoryManuallyEdited`
- only auto-apply suggestion while false

## Sync Package Specification

Use encrypted JSON packages for incremental sync.

Logical payload structure:

```json
{
  "packageId": "uuid",
  "sourceDeviceId": "device_uuid",
  "pairId": "pair_uuid",
  "createdAt": "2026-05-16T23:59:00Z",
  "sequenceRange": {
    "from": 101,
    "to": 145
  },
  "changes": [
    {
      "entityType": "expense",
      "entityId": "expense_uuid",
      "operation": "upsert",
      "record": {
        "id": "expense_uuid",
        "title": "Dinner",
        "amount_minor": 1240,
        "updated_at": "2026-05-16T21:00:00Z",
        "deleted_at": null
      }
    }
  ]
}
```

Requirements:
- Package must be self-describing enough to debug and validate.
- All records must include `updated_at` and identifier fields needed for merge.
- Encryption wraps the serialized package before Drive upload.

## Encryption Requirements

Encrypt both incremental sync packages and full snapshot backups before storing on Drive.

Requirements:
- Symmetric encryption shared by the two users via couple passphrase.
- Derive key locally.
- Prefer AES-GCM for authenticated encryption.
- Store enough metadata to decrypt later, such as IV and KDF params.
- Never upload plaintext sync package or plaintext DB snapshot to Drive.

Implementation notes:
- Use secure platform storage for sensitive local secrets when possible.
- Document what is stored locally vs derived from passphrase.

## Drive Integration Requirements

Drive is a file transport layer only.

Required operations:
- connect account
- create/find app folder
- create/find current device folder
- upload change package
- upload backup snapshot
- list partner change packages
- download package contents
- optionally list available backups

Behavior requirements:
- app must tolerate expired auth and allow reconnect
- local app must remain usable when Drive calls fail
- Drive errors must not corrupt local DB state
- sync package imports must be transactional

## Suggested UI Screens and Details

### Expenses Screen
Must include:
- monthly selector or current month header
- list of expenses
- filter chips or modal filters
- FAB or clear CTA for add expense
- row fields: title, category, date, amount, paid by

### Add/Edit Expense Screen
Must include:
- title input
- note input
- amount input
- date picker
- category picker
- paid-by selector
- split type selector
- auto-categorization suggestion behavior
- save and delete actions

### Balances Screen
Must include:
- main balance card
- breakdown cards
- settlement CTA
- settlement history list

### Record Settlement Screen
Must include:
- amount input
- date picker
- payer and receiver
- optional note
- save action

### Budgets Screen
Must include:
- month selector
- category budget rows
- edit budget action
- progress bar or percent display

### Insights Screen
Must include:
- month selector
- summary cards
- spend vs budget chart
- spend distribution chart

### Settings Screen
Must include:
- profile section
- Drive auth section
- shared folder status
- upload now button
- sync now button
- sync status card
- auto-categorization rules entry point
- backup controls if available

## Sync Status Model

Track and expose these local metadata values:
- last successful upload time
- last successful sync time
- last successful EOD run time
- last upload error message
- last sync error message
- last applied package ID or timestamp

This should be visible in Settings and available for debugging.

## Error Handling Requirements

Must handle gracefully:
- invalid regex rule
- Drive auth revoked
- Drive folder missing
- encryption failure
- decrypt failure for corrupted package
- duplicate package import
- partial upload failure
- app offline during sync attempt
- background task skipped by Android

Behavior guidance:
- fail safe, not destructive
- keep local data usable
- surface actionable message to user
- allow retry

## Testing Expectations

At minimum add automated tests for:
- balance computation
- settlement adjustment logic
- budget aggregation
- auto-categorization matching and priority
- manual category override behavior
- sync package creation from change_log
- merge logic with newer update wins
- delete vs stale update behavior
- applied-package deduplication
- EOD sequence order: unsynced changes upload before backup

If E2E coverage is feasible, include a smoke flow for:
- create expense
- upload now
- sync on second device
- verify imported expense appears

## Suggested Build Order for Claude

Execute in this exact order unless a dependency issue forces minor reordering:
1. Scaffold project and navigation shell.
2. Add theme primitives and shared UI components.
3. Implement SQLite DB, migrations, and repositories.
4. Build local setup/profile flow.
5. Implement expenses CRUD.
6. Implement categories and regex auto-categorization.
7. Implement balances and settlements.
8. Implement budgets.
9. Implement insights.
10. Integrate Google auth and Drive folder setup.
11. Implement change logging and upload now.
12. Implement sync now download and merge.
13. Implement full encrypted backup snapshot upload.
14. Implement EOD WorkManager flow and catch-up-on-open.
15. Add tests, polish, and failure handling.

## Definition of Done

The app is done for v1 when all of the following are true:
- User can use the app fully offline for local expense tracking.
- User can add/edit/delete expenses and categorize them.
- Regex rules can auto-suggest categories and remain editable.
- Balances screen correctly shows owed/receivable state.
- Budgets tab supports monthly category budgets.
- Insights tab shows combined spend vs budget visualizations.
- User can authenticate Google Drive without any app login.
- User can manually upload unsynced changes to Drive.
- User can manually sync and merge partner changes from Drive.
- Daily best-effort EOD flow uploads unsynced changes first and then one encrypted backup snapshot.
- All sync and backup files stored on Drive are encrypted.
- App remains functional if Drive is unavailable.

## Explicit Non-Goals for v1

Do not add these unless specifically requested later:
- multi-user groups larger than two people
- real-time sync
- server-hosted APIs
- push notifications from a backend
- receipt OCR
- scan-to-category ML features
- complex debt simplification across many members
- web app or iOS target as part of v1

## Instruction to Implementation Agent

When building, prefer correctness and deterministic data behavior over flashy UI or premature abstraction.

Do not replace the local-first architecture with Firebase, Supabase, or any other hosted backend.
Do not introduce app-level login.
Do not make Drive the primary database.
Do not skip change_log just because full backups exist.
Do not remove manual upload and manual sync controls.
Do not make category auto-categorization non-editable.

If a package choice changes, preserve the same product behavior and data guarantees.
