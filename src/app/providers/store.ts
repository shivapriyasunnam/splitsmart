import {create} from 'zustand';
import {
  Profile,
  DeviceConfig,
  DriveConfig,
  SyncStatus,
  Member,
  Category,
} from '../../types';

interface AppState {
  // Setup
  isSetupComplete: boolean;
  profile: Profile | null;
  deviceConfig: DeviceConfig | null;

  // Members
  myMember: Member | null;
  partnerMember: Member | null;

  // Categories
  categories: Category[];

  // Drive
  driveConfig: DriveConfig;

  // Sync status
  syncStatus: SyncStatus;

  // Loading
  isInitializing: boolean;

  // Actions
  setSetupComplete: (v: boolean) => void;
  setProfile: (p: Profile) => void;
  setDeviceConfig: (d: DeviceConfig) => void;
  setMyMember: (m: Member) => void;
  setPartnerMember: (m: Member) => void;
  setCategories: (cats: Category[]) => void;
  setDriveConfig: (d: Partial<DriveConfig>) => void;
  setSyncStatus: (s: Partial<SyncStatus>) => void;
  setInitializing: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isSetupComplete: false,
  profile: null,
  deviceConfig: null,
  myMember: null,
  partnerMember: null,
  categories: [],
  driveConfig: {
    connected: false,
    folderId: null,
    deviceFolderId: null,
    partnerDeviceFolder: null,
    accountEmail: null,
  },
  syncStatus: {
    lastUploadAt: null,
    lastSyncAt: null,
    lastEODAt: null,
    lastUploadError: null,
    lastSyncError: null,
    lastAppliedPackageId: null,
  },
  isInitializing: true,

  setSetupComplete: v => set({isSetupComplete: v}),
  setProfile: p => set({profile: p}),
  setDeviceConfig: d => set({deviceConfig: d}),
  setMyMember: m => set({myMember: m}),
  setPartnerMember: m => set({partnerMember: m}),
  setCategories: cats => set({categories: cats}),
  setDriveConfig: d =>
    set(state => ({driveConfig: {...state.driveConfig, ...d}})),
  setSyncStatus: s =>
    set(state => ({syncStatus: {...state.syncStatus, ...s}})),
  setInitializing: v => set({isInitializing: v}),
}));
