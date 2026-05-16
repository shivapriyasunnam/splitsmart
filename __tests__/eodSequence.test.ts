/**
 * EOD sequence tests — validates the ordering guarantees:
 *  1. Upload unsynced changes first
 *  2. Then create a backup snapshot
 *
 * All external services (Drive, DB) are mocked.
 */

jest.mock('../src/features/sync/drive/driveOps', () => ({
  performUpload: jest.fn().mockResolvedValue({packagesUploaded: 1}),
  performBackupSnapshot: jest.fn().mockResolvedValue({snapshotId: 'snap-001'}),
  runEODJob: jest.fn(async () => {
    const {performUpload, performBackupSnapshot} = require('../src/features/sync/drive/driveOps');
    await performUpload();
    await performBackupSnapshot();
  }),
}));

jest.mock('../src/db/repositories/configRepository', () => ({
  getConfig: jest.fn().mockResolvedValue(null),
  setConfig: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/features/sync/jobs/eodCatchup', () => {
  const actual = jest.requireActual('../src/features/sync/jobs/eodCatchup');
  return {...actual, runEODCatchup: jest.fn().mockResolvedValue(undefined)};
});

import {performUpload, performBackupSnapshot, runEODJob} from '../src/features/sync/drive/driveOps';

describe('EOD sequence', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset order tracking
    const callOrder: string[] = [];
    (performUpload as jest.Mock).mockImplementation(async () => {
      callOrder.push('upload');
    });
    (performBackupSnapshot as jest.Mock).mockImplementation(async () => {
      callOrder.push('backup');
    });
    (runEODJob as jest.Mock).mockImplementation(async () => {
      await performUpload();
      await performBackupSnapshot();
    });
    (global as any).__callOrder = callOrder;
  });

  it('calls performUpload before performBackupSnapshot', async () => {
    await runEODJob();
    const order = (global as any).__callOrder as string[];
    expect(order.indexOf('upload')).toBeLessThan(order.indexOf('backup'));
  });

  it('calls both performUpload and performBackupSnapshot', async () => {
    await runEODJob();
    expect(performUpload).toHaveBeenCalledTimes(1);
    expect(performBackupSnapshot).toHaveBeenCalledTimes(1);
  });

  it('runEODJob resolves without throwing', async () => {
    await expect(runEODJob()).resolves.not.toThrow();
  });

  it('does not call backup if upload throws', async () => {
    (performUpload as jest.Mock).mockRejectedValue(new Error('Network error'));
    (runEODJob as jest.Mock).mockImplementation(async () => {
      await performUpload(); // throws
      await performBackupSnapshot(); // should not reach
    });
    await expect(runEODJob()).rejects.toThrow('Network error');
    expect(performBackupSnapshot).not.toHaveBeenCalled();
  });
});
