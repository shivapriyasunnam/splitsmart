import {create} from 'zustand';
import {
  Profile,
  DeviceConfig,
  DriveConfig,
  SyncStatus,
  BluetoothSyncConfig,
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

  // Bluetooth sync
  bluetoothSyncConfig: BluetoothSyncConfig;

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
  setBluetoothSyncConfig: (b: Partial<BluetoothSyncConfig>) => void;
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
  bluetoothSyncConfig: {
    bondedPeerAddress: null,
    bondedPeerName: null,
    lastSentSequence: 0,
    lastTransferAt: null,
    lastConnectedDeviceId: null,
  },
  syncStatus: {
    lastUploadAt: null,
    lastSyncAt: null,
    lastEODAt: null,
    lastUploadError: null,
    lastSyncError: null,
    lastAppliedPackageId: null,
    lastBluetoothTransferAt: null,
    lastBluetoothError: null,
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
  setBluetoothSyncConfig: b =>
    set(state => ({bluetoothSyncConfig: {...state.bluetoothSyncConfig, ...b}})),
  setSyncStatus: s =>
    set(state => ({syncStatus: {...state.syncStatus, ...s}})),
  setInitializing: v => set({isInitializing: v}),
}));
