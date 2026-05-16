export type MemberRole = 'A' | 'B';
export type SplitType = 'equal' | 'fixed_amount' | 'percentage';
export type TargetField = 'title' | 'note' | 'both';
export type ChangeOperation = 'upsert' | 'delete';
export type EntityType =
  | 'expense'
  | 'category'
  | 'category_rule'
  | 'budget'
  | 'settlement'
  | 'member';

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryRule {
  id: string;
  category_id: string;
  pattern: string;
  target_field: TargetField;
  priority: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  title: string;
  note: string | null;
  amount_minor: number;
  currency: string;
  expense_date: string;
  category_id: string;
  paid_by_member_id: string;
  split_type: SplitType;
  split_payload_json: string;
  created_by_device_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Budget {
  id: string;
  month_key: string;
  category_id: string;
  amount_minor: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Settlement {
  id: string;
  amount_minor: number;
  paid_by_member_id: string;
  received_by_member_id: string;
  settlement_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ChangeLogEntry {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  operation: ChangeOperation;
  record_json: string;
  local_sequence: number;
  created_at: string;
  uploaded_at: string | null;
  package_id: string | null;
}

export interface SyncPackageApplied {
  id: string;
  package_id: string;
  source_device_id: string;
  applied_at: string;
}

export interface AppConfig {
  key: string;
  value_json: string;
}

export interface Profile {
  myName: string;
  partnerName: string;
  myRole: MemberRole;
  currency: string;
}

export interface DeviceConfig {
  deviceId: string;
}

export interface DriveConfig {
  connected: boolean;
  folderId: string | null;
  deviceFolderId: string | null;
  partnerDeviceFolder: string | null;
  accountEmail: string | null;
}

export interface SyncStatus {
  lastUploadAt: string | null;
  lastSyncAt: string | null;
  lastEODAt: string | null;
  lastUploadError: string | null;
  lastSyncError: string | null;
  lastAppliedPackageId: string | null;
}

export interface EncryptionConfig {
  passphraseHash: string;
  salt: string;
}

export interface SyncPackage {
  packageId: string;
  sourceDeviceId: string;
  pairId: string;
  createdAt: string;
  sequenceRange: { from: number; to: number };
  changes: SyncChange[];
}

export interface SyncChange {
  entityType: EntityType;
  entityId: string;
  operation: ChangeOperation;
  record: Record<string, unknown>;
}

export interface BalanceSummary {
  totalSharedSpend: number;
  totalPaidByMe: number;
  totalPaidByPartner: number;
  myShare: number;
  partnerShare: number;
  netBalance: number; // positive = I should receive, negative = I owe
  lastSyncAt: string | null;
}

export interface BudgetRow {
  category: Category;
  budgetAmount: number;
  spentAmount: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  hasBudget: boolean;
}
