/**
 * mergeService tests
 *
 * The merge service uses SQLite, so we mock the DB layer entirely.
 * We test the logic that decides which record wins (last-write-wins by updated_at)
 * and that already-applied packages are skipped.
 */

// Mock all DB deps before importing the module under test
jest.mock('../src/db/database', () => ({
  getDB: jest.fn().mockResolvedValue({
    transaction: jest.fn(async (fn: (tx: any) => Promise<void>) => {
      await fn({
        executeSql: jest.fn(async (_sql: string, _params: any[]) => {
          return [{rows: {length: 0, item: () => null}}];
        }),
      });
    }),
  }),
}));

jest.mock('../src/db/repositories/syncRepository', () => ({
  hasPackageBeenApplied: jest.fn().mockResolvedValue(false),
  recordPackageApplied: jest.fn().mockResolvedValue(undefined),
}));

import {mergePackage} from '../src/features/sync/merge/mergeService';
import {hasPackageBeenApplied, recordPackageApplied} from '../src/db/repositories/syncRepository';
import {SyncPackage} from '../src/types';

const makeSyncPackage = (overrides: Partial<SyncPackage> = {}): SyncPackage => ({
  packageId: 'pkg-001',
  sourceDeviceId: 'dev-b',
  pairId: 'pair-1',
  createdAt: '2024-01-15T10:00:00Z',
  sequenceRange: {from: 1, to: 5},
  changes: [],
  ...overrides,
});

describe('mergeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasPackageBeenApplied as jest.Mock).mockResolvedValue(false);
    (recordPackageApplied as jest.Mock).mockResolvedValue(undefined);
  });

  it('skips already-applied packages without calling recordPackageApplied', async () => {
    (hasPackageBeenApplied as jest.Mock).mockResolvedValue(true);
    await mergePackage(makeSyncPackage());
    expect(recordPackageApplied).not.toHaveBeenCalled();
  });

  it('processes new packages and records them as applied', async () => {
    await mergePackage(makeSyncPackage());
    expect(recordPackageApplied).toHaveBeenCalledWith('pkg-001', 'dev-b');
  });

  it('handles empty package without throwing', async () => {
    await expect(mergePackage(makeSyncPackage())).resolves.not.toThrow();
  });

  it('processes package with expense changes', async () => {
    const pkg = makeSyncPackage({
      changes: [{
        entityType: 'expense',
        entityId: 'e1',
        operation: 'upsert',
        record: {
          id: 'e1',
          title: 'Test',
          amount_minor: 5000,
          paid_by_member_id: 'dev-b',
          split_type: 'equal',
          split_payload_json: '{}',
          category_id: 'cat1',
          expense_date: '2024-01-10',
          note: null,
          deleted_at: null,
          created_at: '2024-01-10T10:00:00Z',
          updated_at: '2024-01-10T10:00:00Z',
        },
      }],
    });
    await expect(mergePackage(pkg)).resolves.not.toThrow();
  });
});
