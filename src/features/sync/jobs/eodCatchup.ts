/**
 * EOD Catchup — runs on app open to handle any missed end-of-day job.
 * Checks if we missed yesterday's EOD job (last_eod_run config key) and
 * runs the upload + backup sequence if needed.
 */
import {getConfig, setConfig} from '../../../db/repositories/configRepository';
import {runEODJob} from '../drive/driveOps';
import dayjs from 'dayjs';

const EOD_CONFIG_KEY = 'last_eod_run';

export async function runEODCatchup(): Promise<void> {
  const today = dayjs().format('YYYY-MM-DD');

  const lastRun = await getConfig<string>(EOD_CONFIG_KEY);

  if (lastRun === today) {
    // Already ran today — nothing to do
    return;
  }

  // Either never ran or missed a day — run now
  await runEODJob();
  await setConfig(EOD_CONFIG_KEY, today);
}

export async function markEODComplete(): Promise<void> {
  const today = dayjs().format('YYYY-MM-DD');
  await setConfig(EOD_CONFIG_KEY, today);
}
