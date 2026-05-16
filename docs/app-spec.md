# SplitSmart App Spec

## Product Goal

Build an Android app in React Native for two people to track shared expenses, budgets, and balances.

Core constraints:
- Fully usable offline with local-first storage.
- No custom backend server.
- No app login.
- Google Drive is used only as a user-triggered sync and backup transport.
- Each device stores its own local database and can sync through a shared Drive folder.

## Primary User Model

The app is for exactly two people in one shared expense space.

Each device belongs to one member:
- Person A device
- Person B device

Both devices point to the same shared Drive folder for sync.

## Main Features

### 1. Add Expenses

Users can create an expense with:
- title
- optional note
- amount
- currency
- date
- category
- paid by person A or person B
- split type
- optional custom split values

Supported split types:
- equal
- fixed amount
- percentage

For v1, equal split is the default and should cover most cases.

### 2. Categorize Expenses

Each expense belongs to a category.

Base categories for v1:
- Groceries
- Rent
- Dining
- Transport
- Utilities
- Shopping
- Entertainment
- Health
- Travel
- Other

Requirements:
- Category must always be editable by the user.
- App should support auto-categorization based on regex rules applied to title and note.
- Auto-categorization is only a suggestion/default, not a lock.

Examples:
- `uber|ola|taxi|metro` -> Transport
- `swiggy|zomato|restaurant|cafe` -> Dining
- `dmart|bigbasket|grocery|supermarket` -> Groceries
- `netflix|spotify|prime` -> Entertainment

Rule behavior:
- Rules are evaluated in priority order.
- First matching rule wins.
- User can reorder, disable, edit, or delete rules.
- User can override category manually when creating or editing an expense.

### 3. Show Total Owed / Total To Pay

The app must compute balances across both people.

Definitions:
- `total paid by me`: all expenses I paid
- `total paid by partner`: all expenses partner paid
- `my share`: how much I should cover based on split rules
- `partner share`: how much partner should cover based on split rules

Balance formula:
- `net = total_paid_by_me - my_share`

Interpretation:
- If `net > 0`, I should receive money.
- If `net < 0`, I owe money.

UI wording:
- `You should receive: Rs X`
- `You owe: Rs Y`

Also show:
- total shared spend
- total paid by each person
- last sync time

### 4. Category Budgets Tab

Separate tab for budgeting.

Requirements:
- Monthly budget per category.
- Budget can be set independently for each category.
- Optionally allow an overall monthly budget.
- Budget months should be selectable.
- Categories without a budget show as `No budget set`.

Budget data to show:
- category name
- configured budget amount
- spent amount in selected month
- remaining amount
- percent used
- over-budget status

### 5. Spend vs Budget Visualization Tab

Separate insights tab for charts based on combined spending from both people.

Charts should use total combined spending, not per-device-only values.

Recommended v1 visuals:
- bar chart: category spend vs category budget
- donut/pie chart: spend distribution by category
- summary cards: total spent, total budget, remaining budget, overspent categories count

Filters:
- current month by default
- switch month manually

Visualization should clearly show:
- total category spend by both people together
- budget threshold
- remaining or overspent amount

### 6. Drive Authentication Only

There is no app login.

Authentication rules:
- No username/password system inside the app.
- User authenticates only with Google to grant Drive access.
- After Drive authentication, app stores Drive access metadata locally.
- App should support disconnecting and reconnecting Drive.

User identity inside app can be set with a simple local profile:
- my name
- partner name
- my role: person A or person B

This is local app state, not an app account system.

## Tabs / Navigation

Recommended bottom tab structure:
- Expenses
- Balances
- Budgets
- Insights
- Settings

### Expenses Tab
- expense list
- add expense button
- filters by month/category/person
- edit/delete expense

### Balances Tab
- total owed / to pay
- paid by each person
- settlements history
- quick action to record settlement

### Budgets Tab
- category budgets for selected month
- add/edit budget

### Insights Tab
- spend vs budget charts
- category breakdown
- monthly totals

### Settings Tab
- Google Drive connect/disconnect
- shared folder setup
- sync now
- upload now
- sync status
- auto-categorization rules
- export/import backup

## Local Data Model

Recommended local storage: SQLite.

Core tables:

### members
- id
- name
- role
- created_at
- updated_at

### categories
- id
- name
- color
- icon
- is_default
- is_archived
- created_at
- updated_at

### category_rules
- id
- category_id
- pattern
- target_field
- priority
- is_enabled
- created_at
- updated_at

`target_field` values:
- title
- note
- both

### expenses
- id
- title
- note
- amount_minor
- currency
- expense_date
- category_id
- paid_by_member_id
- split_type
- split_payload_json
- created_by_device_id
- created_at
- updated_at
- deleted_at

Store money in minor units to avoid floating point issues.

### budgets
- id
- month_key
- category_id
- amount_minor
- created_at
- updated_at
- deleted_at

Example `month_key`:
- `2026-05`

### settlements
- id
- amount_minor
- paid_by_member_id
- received_by_member_id
- settlement_date
- note
- created_at
- updated_at
- deleted_at

### change_log
- id
- entity_type
- entity_id
- operation
- record_json
- local_sequence
- created_at
- uploaded_at
- package_id

### sync_packages_applied
- id
- package_id
- source_device_id
- applied_at

### app_config
- key
- value_json

## Auto-Categorization Logic

Suggested create/edit expense flow:
1. User enters title.
2. App checks enabled regex rules against title and note.
3. First matching rule preselects category.
4. User can keep it or change it manually.
5. Manual category choice is saved on the expense.

Important rule:
- Editing a rule does not silently rewrite old expenses.

Optional v2:
- bulk re-apply rules to uncategorized expenses only
- bulk re-apply rules to selected date range after user confirmation

## Balance Calculation

For each expense:
- derive how much each member should pay
- compare that with who actually paid

For a simple equal split between two people:
- amount = 1000
- paid by A
- A share = 500
- B share = 500
- A net contribution = +500
- B net contribution = -500

Overall balance is the sum across all expenses and settlements.

Settlements reduce open balances.

## Google Drive Sync Model

Drive is used for transport and backup, not as the live source of truth.

Each device has:
- full local DB
- local change log
- device-specific Drive subfolder

Shared Drive folder structure:

```text
SplitSmart/
  devices/
    device_A/
      changes/
      backups/
    device_B/
      changes/
      backups/
```

### Manual Actions

`Upload now`
- package all local unsynced changes
- encrypt package
- upload to current device's `changes/` folder
- mark uploaded changes locally

`Sync now`
- fetch new change packages from partner device folder
- decrypt packages
- merge into local DB
- record imported package IDs

### End-of-Day Job

Best-effort daily job should:
1. upload any unsynced changes
2. upload one encrypted full local snapshot backup

If the scheduled job is missed, run it on next app open.

### Backup vs Sync

- Change packages are for merging and day-to-day sync.
- Full snapshot is for disaster recovery and device restore.
- Full snapshot should not replace incremental sync.

## Merge Strategy

Use deterministic merge rules:
- records are identified by UUID
- updates use `updated_at`
- soft deletes use `deleted_at`
- newer record wins
- delete wins against older updates

This is sufficient for a two-person expense app in v1.

## Encryption

Files uploaded to Drive should be encrypted.

Recommended approach:
- shared couple passphrase entered during initial setup
- derive a symmetric key locally
- encrypt sync packages and backups before upload

Drive stores ciphertext only.

## Authentication Approach

No app login is needed.

Required auth only:
- Google sign-in for Drive access

Suggested flow:
1. User installs app.
2. User sets local profile and pair metadata.
3. User signs in with Google.
4. User selects or creates the shared Drive folder.
5. User runs `Upload now` or `Sync now` manually.

## Recommended React Native Stack

For implementation:
- React Native for Android app
- SQLite for local DB
- React Navigation for tabs
- Google Sign-In for Drive auth
- Google Drive REST API for uploads/downloads
- chart library for insights tab
- WorkManager bridge for best-effort Android daily upload job

## V1 Scope

Include in v1:
- local-first expense CRUD
- editable categories
- regex-based auto-categorization
- balances screen
- budget-by-category tab
- insights tab with spend vs budget
- Google Drive auth
- manual upload now
- manual sync now
- daily best-effort upload of unsynced changes and full encrypted backup

Defer from v1 unless needed:
- recurring expenses
- OCR receipt scanning
- push notifications
- multi-currency conversion
- more than two members
- real-time collaborative sync

## Open Implementation Notes

Important practical constraints:
- Android background scheduling is best-effort, not exact at midnight.
- Drive sync should be designed to retry safely.
- Uploaded package tracking must be idempotent to avoid duplicate imports.
- Conflict handling should remain explicit and deterministic.
