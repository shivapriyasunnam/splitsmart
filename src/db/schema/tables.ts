export const CREATE_MEMBERS_TABLE = `
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('A','B')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_CATEGORIES_TABLE = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_CATEGORY_RULES_TABLE = `
  CREATE TABLE IF NOT EXISTS category_rules (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT NOT NULL,
    pattern TEXT NOT NULL,
    target_field TEXT NOT NULL CHECK(target_field IN ('title','note','both')),
    priority INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  );
`;

export const CREATE_EXPENSES_TABLE = `
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    note TEXT,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    expense_date TEXT NOT NULL,
    category_id TEXT NOT NULL,
    paid_by_member_id TEXT NOT NULL,
    split_type TEXT NOT NULL DEFAULT 'equal' CHECK(split_type IN ('equal','fixed_amount','percentage')),
    split_payload_json TEXT NOT NULL DEFAULT '{}',
    created_by_device_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(category_id) REFERENCES categories(id),
    FOREIGN KEY(paid_by_member_id) REFERENCES members(id)
  );
`;

export const CREATE_BUDGETS_TABLE = `
  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY NOT NULL,
    month_key TEXT NOT NULL,
    category_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  );
`;

export const CREATE_SETTLEMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY NOT NULL,
    amount_minor INTEGER NOT NULL,
    paid_by_member_id TEXT NOT NULL,
    received_by_member_id TEXT NOT NULL,
    settlement_date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY(paid_by_member_id) REFERENCES members(id),
    FOREIGN KEY(received_by_member_id) REFERENCES members(id)
  );
`;

export const CREATE_CHANGE_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS change_log (
    id TEXT PRIMARY KEY NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
    record_json TEXT NOT NULL,
    local_sequence INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    uploaded_at TEXT,
    package_id TEXT
  );
`;

export const CREATE_SYNC_PACKAGES_APPLIED_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_packages_applied (
    id TEXT PRIMARY KEY NOT NULL,
    package_id TEXT NOT NULL UNIQUE,
    source_device_id TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

export const CREATE_APP_CONFIG_TABLE = `
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL
  );
`;

export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by_member_id);`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month_key);`,
  `CREATE INDEX IF NOT EXISTS idx_change_log_seq ON change_log(local_sequence);`,
  `CREATE INDEX IF NOT EXISTS idx_change_log_uploaded ON change_log(uploaded_at);`,
];

export const ALL_TABLES = [
  CREATE_MEMBERS_TABLE,
  CREATE_CATEGORIES_TABLE,
  CREATE_CATEGORY_RULES_TABLE,
  CREATE_EXPENSES_TABLE,
  CREATE_BUDGETS_TABLE,
  CREATE_SETTLEMENTS_TABLE,
  CREATE_CHANGE_LOG_TABLE,
  CREATE_SYNC_PACKAGES_APPLIED_TABLE,
  CREATE_APP_CONFIG_TABLE,
];
