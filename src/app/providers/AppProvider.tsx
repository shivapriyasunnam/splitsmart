import React, {useEffect} from 'react';
import {runMigrations} from '../../db/migrations/runner';
import {getConfig, setConfig} from '../../db/repositories/configRepository';
import {getAllCategories} from '../../db/repositories/categoryRepository';
import {getMembers} from '../../db/repositories/memberRepository';
import {useAppStore} from './store';
import {Colors} from '../theme';
import {Profile, DeviceConfig, DriveConfig, SyncStatus} from '../../types';
import {v4 as uuidv4} from 'uuid';

export const AppProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const store = useAppStore();

  useEffect(() => {
    initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initializeApp() {
    try {
      await runMigrations();

      // Initialize device ID if needed
      let deviceConfig = await getConfig<DeviceConfig>('device');
      if (!deviceConfig) {
        deviceConfig = {deviceId: uuidv4()};
        await setConfig('device', deviceConfig);
      }
      store.setDeviceConfig(deviceConfig);

      // Load profile
      const profile = await getConfig<Profile>('profile');
      if (profile) {
        store.setProfile(profile);
        store.setSetupComplete(true);
      }

      // Load Drive config
      const driveConfig = await getConfig<DriveConfig>('drive');
      if (driveConfig) {
        store.setDriveConfig(driveConfig);
      }

      // Load sync status
      const syncStatus = await getConfig<SyncStatus>('sync_status');
      if (syncStatus) {
        store.setSyncStatus(syncStatus);
      }

      // Load members
      const members = await getMembers();
      if (profile) {
        const myMember = members.find(m => m.role === profile.myRole);
        const partnerMember = members.find(m => m.role !== profile.myRole);
        if (myMember) store.setMyMember(myMember);
        if (partnerMember) store.setPartnerMember(partnerMember);
      }

      // Load categories
      const categories = await getAllCategories();
      store.setCategories(categories);

      // Apply saved primary color before first render
      const savedColor = await getConfig<string>('primary_color');
      if (savedColor) {
        Colors.primary = savedColor;
      }
    } catch (err) {
      console.error('App initialization error:', err);
    } finally {
      store.setInitializing(false);
    }
  }

  return <>{children}</>;
};
