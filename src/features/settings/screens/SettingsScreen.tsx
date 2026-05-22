import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  Switch,
  PermissionsAndroid,
  Platform,
  Share,
  TextInput,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import {Card, Button, Divider, Input, Badge, LoadingState} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius, Shadows} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {
  configureDriveAuth,
  signInWithGoogle,
  signOut,
  setupDriveFolders,
} from '../../sync/drive/driveService';
import {performUpload, performSync, runEODJob} from '../../sync/drive/driveOps';
import {getConfig, setConfig, deleteConfig} from '../../../db/repositories/configRepository';
import {
  getCategoryRules,
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
  getAllCategories,
} from '../../../db/repositories/categoryRepository';
import {validateRegexPattern} from '../../categories/services/categorizationService';
import {CategoryRule, Category, Profile, DriveConfig} from '../../../types';
import {getMembers} from '../../../db/repositories/memberRepository';
import {pickJsonFile} from '../services/filePicker';
import {HistoryScreen} from './HistoryScreen';
import {exportBackup, importBackup, saveBackupFile} from '../services/backupService';
import {formatAmount} from '../../balances/services/balanceService';
import {hashPassphrase} from '../../sync/crypto/encryptionService';
import {
  getBluetoothSyncConfig,
  setPeerDevice,
  getBondedDevices,
  discoverDevices,
  requestBluetoothEnabled,
  syncViaBluetooth,
  BluetoothDeviceInfo,
} from '../../sync/services/bluetoothSyncService';

const GOOGLE_WEB_CLIENT_ID = '';  // Configure in app.config or settings

interface Props {
  navigation: any;
}

export const SettingsScreen: React.FC<Props> = ({navigation}) => {
  const store = useAppStore();
  const {profile, driveConfig, syncStatus, deviceConfig} = store;

  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [section, setSection] = useState<'main' | 'rules' | 'profile' | 'history'>('main');
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [editRuleModal, setEditRuleModal] = useState(false);
  const [currentRule, setCurrentRule] = useState<Partial<CategoryRule> | null>(null);
  const [partnerFolderId, setPartnerFolderId] = useState('');
  const [currencyModal, setCurrencyModal] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(Colors.primary);
  const [hexInput, setHexInput] = useState<string>('');

  const COLOR_PRESETS = [
  '#E27D60', // Terracotta Orange
  '#59AF7F', // Forest Green
  '#C18157', // Camel Brown
  '#2B5C6B', // Deep Teal
  '#C38D9E', // Dusty Rose
  '#7164ED', // Indigo
  '#E06549', // Vermilion Orange
  '#C4B405', // Mustard Yellow
  '#26B8D2', // Cyan / Bright Aqua
  '#E33CC7', // Magenta Pink
  '#252525', // Near Black / Charcoal
  '#CD0E6A', // Deep Pink (Amaranth)
  '#800020', // Burgundy
  '#555575', // Slate Lavender
  '#AE73C9', // Lavender Purple (Wisteria)
  '#FF8E72', // Salmon Coral

];

  const CURRENCIES = [
    {code: 'USD', name: 'US Dollar'},
    {code: 'CAD', name: 'Canadian Dollar'},
    {code: 'EUR', name: 'Euro'},
    {code: 'GBP', name: 'British Pound'},
    {code: 'INR', name: 'Indian Rupee'},
    {code: 'AUD', name: 'Australian Dollar'},
    {code: 'JPY', name: 'Japanese Yen'},
    {code: 'CNY', name: 'Chinese Yuan'},
    {code: 'SGD', name: 'Singapore Dollar'},
    {code: 'CHF', name: 'Swiss Franc'},
    {code: 'MXN', name: 'Mexican Peso'},
    {code: 'BRL', name: 'Brazilian Real'},
    {code: 'KRW', name: 'South Korean Won'},
    {code: 'AED', name: 'UAE Dirham'},
    {code: 'NZD', name: 'New Zealand Dollar'},
  ];

  // ─── Bluetooth state ─────────────────────────────────────────────────────
  const [btEnabled, setBtEnabled] = useState<boolean | null>(null);
  const [btPeerAddress, setBtPeerAddress] = useState<string | null>(null);
  const [btPeerName, setBtPeerName] = useState<string | null>(null);
  const [btLastTransfer, setBtLastTransfer] = useState<string | null>(null);
  const [btLastError, setBtLastError] = useState<string | null>(null);
  const [btSyncing, setBtSyncing] = useState(false);
  const [btDeviceModal, setBtDeviceModal] = useState(false);
  const [btDevices, setBtDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [btDiscovering, setBtDiscovering] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    const r = await getCategoryRules();
    setRules(r);
    const c = await getAllCategories();
    setCats(c);
    const pf = await getConfig<string>('partner_folder_id');
    if (pf) setPartnerFolderId(pf);

    // Load Bluetooth config
    try {
      const RNBluetoothClassic = require('react-native-bluetooth-classic').default;
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      setBtEnabled(enabled);
    } catch {
      setBtEnabled(false);
    }
    const btCfg = await getBluetoothSyncConfig();
    setBtPeerAddress(btCfg.bondedPeerAddress);
    setBtPeerName(btCfg.bondedPeerName);
    setBtLastTransfer(btCfg.lastTransferAt);
    const syncStatus = await getConfig<any>('sync_status');
    setBtLastError(syncStatus?.lastBluetoothError ?? null);
  }

  async function handleCurrencyChange(code: string) {
    if (!profile) return;
    const updated = {...profile, currency: code};
    await setConfig('profile', updated);
    store.setProfile(updated);
    setCurrencyModal(false);
  }

  async function handleExport() {
    setBackupLoading(true);
    try {
      if (Platform.OS === 'android') {
        const filename = await saveBackupFile();
        Alert.alert('Backup Saved', `"${filename}" has been saved to your Downloads folder.`);
      } else {
        const json = await exportBackup();
        await Share.share({message: json, title: 'SplitSmart Backup'});
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err.message ?? 'Could not export backup.');
    } finally {
      setBackupLoading(false);
    }
  }

  async function handlePickRestoreFile() {
    try {
      const json = await pickJsonFile();
      if (json === null) {
        // User cancelled the picker
        return;
      }
      Alert.alert(
        'Restore Backup',
        'This will replace ALL current data and cannot be undone. Continue?',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              setRestoreLoading(true);
              try {
                await importBackup(json);
                const prof = await getConfig<Profile>('profile');
                if (prof) {
                  store.setProfile(prof);
                  store.setSetupComplete(true);
                }
                const driveCfg = await getConfig<DriveConfig>('drive');
                if (driveCfg) {
                  store.setDriveConfig(driveCfg);
                }
                const syncSt = await getConfig<any>('sync_status');
                if (syncSt) {
                  store.setSyncStatus(syncSt);
                }
                const mems = await getMembers();
                if (prof) {
                  const myMem = mems.find(m => m.role === prof.myRole);
                  const partnerMem = mems.find(m => m.role !== prof.myRole);
                  if (myMem) {store.setMyMember(myMem);}
                  if (partnerMem) {store.setPartnerMember(partnerMem);}
                }
                const cats = await getAllCategories();
                store.setCategories(cats);
                Alert.alert('Restored', 'Your backup has been restored successfully.');
              } catch (err: any) {
                Alert.alert('Restore Failed', err.message ?? 'Could not restore backup.');
              } finally {
                setRestoreLoading(false);
              }
            },
          },
        ],
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not open file picker.');
    }
  }

  async function handleColorChange(color: string) {
    await setConfig('primary_color', color);
    Colors.primary = color;
    setSelectedColor(color);
    store.bumpTheme();
  }

  async function handleHexApply() {
    const hex = hexInput.trim();
    const valid = /^#[0-9a-fA-F]{6}$/.test(hex);
    if (!valid) {
      Alert.alert('Invalid Color', 'Enter a valid 6-digit hex color, e.g. #FF5733');
      return;
    }
    setHexInput('');
    await handleColorChange(hex);
  }

  async function connectDrive() {
    setDriveConnecting(true);
    try {
      configureDriveAuth(GOOGLE_WEB_CLIENT_ID);
      const {email, accessToken} = await signInWithGoogle();
      const deviceId = deviceConfig?.deviceId ?? 'unknown';
      const folders = await setupDriveFolders(deviceId, accessToken);

      const newDriveConfig = {
        connected: true,
        folderId: folders.appFolderId,
        deviceFolderId: folders.deviceFolderId,
        partnerDeviceFolder: null,
        accountEmail: email,
      };
      await setConfig('drive', newDriveConfig);
      await setConfig('changes_folder_id', folders.changesFolderId);
      await setConfig('backups_folder_id', folders.backupsFolderId);
      store.setDriveConfig(newDriveConfig);

      Alert.alert('Connected', `Drive connected as ${email}`);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to connect Drive.');
    } finally {
      setDriveConnecting(false);
    }
  }

  async function disconnectDrive() {
    Alert.alert('Disconnect Drive', 'Disconnect Google Drive? Local data is preserved.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          await setConfig('drive', {connected: false, folderId: null, deviceFolderId: null, partnerDeviceFolder: null, accountEmail: null});
          store.setDriveConfig({connected: false, folderId: null, deviceFolderId: null, partnerDeviceFolder: null, accountEmail: null});
        },
      },
    ]);
  }

  async function handleUpload() {
    setUploading(true);
    try {
      const result = await performUpload();
      if (result.success) {
        const s = await getConfig<any>('sync_status');
        if (s) store.setSyncStatus(s);
        Alert.alert('Success', 'Changes uploaded to Drive.');
      } else {
        Alert.alert('Upload Failed', result.error ?? 'Unknown error');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleSync() {
    if (!partnerFolderId.trim()) {
      Alert.alert('Setup Required', "Enter your partner's device folder ID first.");
      return;
    }
    setSyncing(true);
    try {
      const result = await performSync(partnerFolderId);
      const s = await getConfig<any>('sync_status');
      if (s) store.setSyncStatus(s);
      if (result.success) {
        Alert.alert('Sync Complete', `Imported ${result.imported} package(s).`);
      } else {
        Alert.alert('Sync Failed', result.error ?? 'Unknown error');
      }
    } finally {
      setSyncing(false);
    }
  }

  // ─── Bluetooth Handlers ───────────────────────────────────────────────────

  async function requestBtPermissionsAndroid(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    // Android 12+ uses BLUETOOTH_SCAN + BLUETOOTH_CONNECT
    if (Platform.Version >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      return (
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
      );
    }
    // Android < 12 uses ACCESS_FINE_LOCATION for discovery
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return granted === 'granted';
  }

  async function openDevicePicker() {
    const permitted = await requestBtPermissionsAndroid();
    if (!permitted) {
      Alert.alert('Permission Required', 'Bluetooth permissions are required to find nearby devices.');
      return;
    }

    let enabled = btEnabled;
    if (!enabled) {
      try {
        const didEnable = await requestBluetoothEnabled();
        setBtEnabled(didEnable);
        enabled = didEnable;
      } catch {}
    }
    if (!enabled) {
      Alert.alert('Bluetooth Off', 'Please enable Bluetooth to find devices.');
      return;
    }

    setBtDeviceModal(true);
    setBtDiscovering(true);
    try {
      const bonded = await getBondedDevices();
      setBtDevices(bonded);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to list devices.');
    } finally {
      setBtDiscovering(false);
    }
  }

  async function discoverMoreDevices() {
    setBtDiscovering(true);
    try {
      const found = await discoverDevices();
      setBtDevices(prev => {
        const existing = new Set(prev.map(d => d.address));
        const merged = [...prev];
        for (const d of found) {
          if (!existing.has(d.address)) merged.push(d);
        }
        return merged;
      });
    } catch (err: any) {
      Alert.alert('Discovery Error', err.message ?? 'Discovery failed.');
    } finally {
      setBtDiscovering(false);
    }
  }

  async function selectDevice(device: BluetoothDeviceInfo) {
    await setPeerDevice(device);
    setBtPeerAddress(device.address);
    setBtPeerName(device.name);
    setBtDeviceModal(false);
  }

  async function handleBluetoothSync() {
    const permitted = await requestBtPermissionsAndroid();
    if (!permitted) {
      Alert.alert('Permission Required', 'Bluetooth permissions are needed to sync.');
      return;
    }
    setBtSyncing(true);
    try {
      const result = await syncViaBluetooth(90_000);
      if (result.success) {
        const cfg = await getBluetoothSyncConfig();
        setBtLastTransfer(cfg.lastTransferAt);
        setBtLastError(null);

        // Refresh partner member in store (canonical_partner_member_id may have been written).
        const canonicalPartnerId = await getConfig<string>('canonical_partner_member_id');
        if (canonicalPartnerId) {
          const updatedMembers = await getMembers();
          const partner = updatedMembers.find(m => m.id === canonicalPartnerId);
          if (partner) store.setPartnerMember(partner);
        }
        const s = await getConfig<any>('sync_status');
        if (s) store.setSyncStatus(s);

        const summary = [
          result.sentChanges ? 'Sent your changes' : 'No local changes to send',
          result.importedChanges ? 'Imported partner changes' : 'No new changes from partner',
        ].join('\n');
        Alert.alert('Sync Complete', summary);
      } else {
        setBtLastError(result.error ?? null);
        Alert.alert('Sync Failed', result.error ?? 'Bluetooth sync failed.');
      }
    } finally {
      setBtSyncing(false);
    }
  }

  // ─── Rules Management ────────────────────────────────────────────────────

  function openNewRule() {
    setCurrentRule({pattern: '', target_field: 'both', priority: rules.length + 1, is_enabled: true, category_id: cats[0]?.id ?? ''});
    setEditRuleModal(true);
  }

  function openEditRule(rule: CategoryRule) {
    setCurrentRule({...rule});
    setEditRuleModal(true);
  }

  async function saveRule() {
    if (!currentRule?.pattern?.trim()) {
      Alert.alert('Error', 'Pattern is required.');
      return;
    }
    const patternError = validateRegexPattern(currentRule.pattern!);
    if (patternError) {
      Alert.alert('Invalid Pattern', patternError);
      return;
    }
    if (!currentRule.category_id) {
      Alert.alert('Error', 'Select a category.');
      return;
    }
    try {
      if (currentRule.id) {
        await updateCategoryRule(currentRule.id, {
          pattern: currentRule.pattern,
          target_field: currentRule.target_field,
          priority: currentRule.priority,
          is_enabled: currentRule.is_enabled,
          category_id: currentRule.category_id,
        });
      } else {
        await createCategoryRule(
          currentRule.category_id!,
          currentRule.pattern!,
          currentRule.target_field ?? 'both',
          currentRule.priority ?? rules.length + 1,
        );
      }
      await loadData();
      setEditRuleModal(false);
      setCurrentRule(null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  async function deleteRule(id: string) {
    Alert.alert('Delete Rule', 'Delete this auto-categorization rule?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCategoryRule(id);
          await loadData();
        },
      },
    ]);
  }

  if (section === 'history') {
    return <HistoryScreen onBack={() => setSection('main')} />;
  }

  if (section === 'rules') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.sectionHeader}>
          <TouchableOpacity onPress={() => setSection('main')}>
            <Text style={styles.backLink}>← Settings</Text>
          </TouchableOpacity>
          <Text style={styles.sectionTitle}>Auto-Categorization Rules</Text>
          <Button title="+ Add" size="sm" onPress={openNewRule} />
        </View>
        <FlatList
          data={rules}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.rulesList}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No rules yet. Add one to get started.</Text>
          }
          renderItem={({item}) => {
            const cat = cats.find(c => c.id === item.category_id);
            return (
              <Card style={styles.ruleCard}>
                <View style={styles.ruleHeader}>
                  <View style={[styles.catDot, {backgroundColor: cat?.color ?? Colors.border}]} />
                  <Text style={styles.rulePattern} numberOfLines={1}>
                    {item.pattern}
                  </Text>
                  <Badge
                    label={item.is_enabled ? 'ON' : 'OFF'}
                    color={item.is_enabled ? Colors.success : Colors.border}
                  />
                </View>
                <View style={styles.ruleFooter}>
                  <Text style={styles.ruleMeta}>
                    → {cat?.name ?? 'Unknown'} · {item.target_field} · priority {item.priority}
                  </Text>
                  <View style={styles.ruleActions}>
                    <TouchableOpacity onPress={() => openEditRule(item)}>
                      <Text style={styles.editLink}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteRule(item.id)}>
                      <Text style={styles.deleteLink}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          }}
        />
        {/* Edit Rule Modal */}
        <Modal visible={editRuleModal} animationType="slide" transparent>
          <View style={styles.overlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>
                {currentRule?.id ? 'Edit Rule' : 'New Rule'}
              </Text>
              <Input
                label="Regex Pattern *"
                value={currentRule?.pattern ?? ''}
                onChangeText={v => setCurrentRule(r => ({...r, pattern: v}))}
                placeholder="e.g. uber|ola|taxi"
                autoCapitalize="none"
              />
              <Text style={styles.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: Spacing.sm}}>
                {cats.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catChip, currentRule?.category_id === c.id && {backgroundColor: c.color}]}
                    onPress={() => setCurrentRule(r => ({...r, category_id: c.id}))}>
                    <Text style={[styles.catChipText, currentRule?.category_id === c.id && {color: Colors.textOnPrimary}]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.inputLabel}>Match In</Text>
              <View style={styles.radioRow}>
                {(['title', 'note', 'both'] as const).map(tf => (
                  <TouchableOpacity
                    key={tf}
                    style={[styles.radioChip, currentRule?.target_field === tf && styles.radioChipSelected]}
                    onPress={() => setCurrentRule(r => ({...r, target_field: tf}))}>
                    <Text style={[styles.radioChipText, currentRule?.target_field === tf && {color: Colors.textOnPrimary}]}>
                      {tf}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Enabled</Text>
                <Switch
                  value={currentRule?.is_enabled ?? true}
                  onValueChange={v => setCurrentRule(r => ({...r, is_enabled: v}))}
                />
              </View>
              <View style={styles.modalButtons}>
                <Button title="Cancel" variant="secondary" onPress={() => setEditRuleModal(false)} style={styles.modalBtn} />
                <Button title="Save" onPress={saveRule} style={styles.modalBtn} />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ─── Main Settings ────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.sectionHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <Text style={styles.firstLabel}>PROFILE</Text>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.settingKey}>Your Name</Text>
            <Text style={styles.settingValue}>{profile?.myName ?? '—'}</Text>
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Partner's Name</Text>
            <Text style={styles.settingValue}>{profile?.partnerName ?? '—'}</Text>
          </View>
          {/* <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Your Role</Text>
            <Text style={styles.settingValue}>Person {profile?.myRole ?? '—'}</Text>
          </View> */}
          <Divider />
          <TouchableOpacity style={styles.row} onPress={() => setCurrencyModal(true)}>
            <Text style={styles.settingKey}>Currency</Text>
            <View style={styles.currencyRowRight}>
              <Text style={styles.currencyValueText}>{profile?.currency ?? '—'}</Text>
              <Text style={styles.navChevron}>›</Text>
            </View>
          </TouchableOpacity>
        </Card>

        {/* Currency Picker Modal */}
        <Modal visible={currencyModal} animationType="slide" transparent>
          <View style={styles.overlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Select Currency</Text>
              <ScrollView style={{maxHeight: 400}}>
                {CURRENCIES.map(c => (
                  <TouchableOpacity
                    key={c.code}
                    style={[
                      styles.currencyOption,
                      profile?.currency === c.code && styles.currencyOptionSelected,
                    ]}
                    onPress={() => handleCurrencyChange(c.code)}>
                    <Text style={[
                      styles.currencyCode,
                      profile?.currency === c.code && styles.currencyTextSelected,
                    ]}>
                      {c.code}
                    </Text>
                    <Text style={[
                      styles.currencyName,
                      profile?.currency === c.code && styles.currencyTextSelected,
                    ]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setCurrencyModal(false)}
                style={{marginTop: Spacing.md}}
              />
            </View>
          </View>
        </Modal>

        {/* Appearance Section */}
        <Text style={styles.label}>APPEARANCE</Text>
        <Card style={styles.card}>
          <Text style={styles.settingKey}>Primary Color</Text>
          <View style={styles.colorSwatches}>
            {COLOR_PRESETS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorSwatch, {backgroundColor: c}, selectedColor === c && styles.colorSwatchSelected]}
                onPress={() => handleColorChange(c)}>
                {selectedColor === c && <Text style={styles.colorCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.hexRow}>
            <TextInput
              style={styles.hexTextInput}
              value={hexInput}
              onChangeText={setHexInput}
              placeholder="#RRGGBB"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={7}
            />
            <Button title="Apply" size="sm" onPress={handleHexApply} style={styles.hexApplyBtn} />
          </View>
        </Card>

        {/* Bluetooth Sync Section */}
        <Text style={styles.label}>BLUETOOTH SYNC</Text>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.settingKey}>Bluetooth</Text>
            <Badge
              label={btEnabled === null ? '—' : btEnabled ? 'On' : 'Off'}
              color={btEnabled ? Colors.success : Colors.textMuted}
            />
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Partner Device</Text>
            <Text style={styles.settingValue} numberOfLines={1}>
              {btPeerName ?? 'Not selected'}
            </Text>
          </View>
          <Divider />
          <Button
            title="Pair / Choose Device"
            variant="secondary"
            size="sm"
            onPress={openDevicePicker}
            style={styles.syncBtn}
          />
          <Button
            title={btSyncing ? 'Syncing…' : 'Sync Changes'}
            onPress={handleBluetoothSync}
            loading={btSyncing}
            disabled={btSyncing || !btPeerAddress}
            style={styles.syncBtn}
          />
          <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Last Transfer</Text>
            <Text style={styles.settingValue}>
              {btLastTransfer ? dayjs(btLastTransfer).format('D MMM HH:mm') : 'Never'}
            </Text>
          </View>
          {btLastError && (
            <>
              <Divider />
              <Text style={styles.errorText}>BT error: {btLastError}</Text>
            </>
          )}
          <Divider />
          <TouchableOpacity style={styles.navRow} onPress={() => setSection('history')}>
            <Text style={styles.settingKey}>View Sync History</Text>
            <Text style={styles.navChevron}>›</Text>
          </TouchableOpacity>
        </Card>

        {/* Device Picker Modal */}
        <Modal visible={btDeviceModal} animationType="slide" transparent>
          <View style={styles.overlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Choose Partner Device</Text>
              {btDiscovering && (
                <Text style={[styles.settingHint, {marginBottom: Spacing.sm}]}>
                  Scanning…
                </Text>
              )}
              <ScrollView style={{maxHeight: 300}}>
                {btDevices.length === 0 && !btDiscovering && (
                  <Text style={styles.emptyText}>
                    No paired devices found. Make sure your partner's device is discoverable.
                  </Text>
                )}
                {btDevices.map(d => (
                  <TouchableOpacity
                    key={d.address}
                    style={styles.deviceRow}
                    onPress={() => selectDevice(d)}>
                    <Text style={styles.deviceName}>{d.name || 'Unknown Device'}</Text>
                    <Text style={styles.deviceAddress}>{d.address}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={[styles.modalButtons, {marginTop: Spacing.md}]}>
                <Button
                  title="Discover More"
                  variant="secondary"
                  onPress={discoverMoreDevices}
                  loading={btDiscovering}
                  style={styles.modalBtn}
                />
                <Button
                  title="Cancel"
                  onPress={() => setBtDeviceModal(false)}
                  style={styles.modalBtn}
                />
              </View>
            </View>
          </View>
        </Modal>



        {/* Drive Section */}
        <Text style={styles.label}>GOOGLE DRIVE</Text>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.settingKey}>Status</Text>
            <Badge
              label={driveConfig.connected ? 'Connected' : 'Not Connected'}
              color={driveConfig.connected ? Colors.success : Colors.textMuted}
            />
          </View>
          {driveConfig.connected && (
            <>
              <Divider />
              <View style={styles.row}>
                <Text style={styles.settingKey}>Account</Text>
                <Text style={styles.settingValue} numberOfLines={1}>
                  {driveConfig.accountEmail ?? '—'}
                </Text>
              </View>
              <Divider />
              <View style={styles.row}>
                <Text style={styles.settingKey}>Device Folder</Text>
                <Text style={[styles.settingValue, {fontSize: 11}]} numberOfLines={1}>
                  {deviceConfig?.deviceId?.substring(0, 12) ?? '—'}...
                </Text>
              </View>
            </>
          )}
          <Divider />
          {driveConfig.connected ? (
            <Button title="Disconnect Drive" variant="danger" onPress={disconnectDrive} size="sm" style={{marginTop: Spacing.sm}} />
          ) : (
            <Button title="Connect Google Drive" onPress={connectDrive} loading={driveConnecting} size="sm" style={{marginTop: Spacing.sm}} />
          )}
        </Card>

        {/* Partner Folder */}
        {driveConfig.connected && (
          <>
            <Text style={styles.label}>PARTNER DEVICE FOLDER</Text>
            <Card style={styles.card}>
              <Text style={styles.settingHint}>
                Ask your partner to share their Device Folder ID from their Settings.
              </Text>
              <Input
                label="Partner Device Folder ID"
                value={partnerFolderId}
                onChangeText={setPartnerFolderId}
                placeholder="Paste folder ID here"
                onBlur={async () => {
                  await setConfig('partner_folder_id', partnerFolderId);
                }}
              />
            </Card>
          </>
        )}

        {/* Sync Section */}
        {/* <Text style={styles.label}>SYNC</Text>
        <Card style={styles.card}>
          <Button
            title="Upload Now"
            onPress={handleUpload}
            loading={uploading}
            disabled={!driveConfig.connected}
            style={styles.syncBtn}
          />
          <Button
            title="Sync Now"
            variant="secondary"
            onPress={handleSync}
            loading={syncing}
            disabled={!driveConfig.connected || !partnerFolderId}
            style={styles.syncBtn}
          />
          <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Last Upload</Text>
            <Text style={styles.settingValue}>
              {syncStatus.lastUploadAt ? dayjs(syncStatus.lastUploadAt).format('D MMM HH:mm') : 'Never'}
            </Text>
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Last Sync</Text>
            <Text style={styles.settingValue}>
              {syncStatus.lastSyncAt ? dayjs(syncStatus.lastSyncAt).format('D MMM HH:mm') : 'Never'}
            </Text>
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Last EOD Run</Text>
            <Text style={styles.settingValue}>
              {syncStatus.lastEODAt ? dayjs(syncStatus.lastEODAt).format('D MMM HH:mm') : 'Never'}
            </Text>
          </View>
          {syncStatus.lastUploadError && (
            <>
              <Divider />
              <Text style={styles.errorText}>Upload error: {syncStatus.lastUploadError}</Text>
            </>
          )}
          {syncStatus.lastSyncError && (
            <>
              <Divider />
              <Text style={styles.errorText}>Sync error: {syncStatus.lastSyncError}</Text>
            </>
          )}
        </Card> */}

        {/* Data Management */}
        <Text style={styles.label}>DATA MANAGEMENT</Text>
        <Card style={styles.card}>
          <Button
            title="Export Backup"
            onPress={handleExport}
            loading={backupLoading}
            disabled={backupLoading}
            style={styles.syncBtn}
          />
          <Button
            title="Restore from Backup"
            variant="secondary"
            onPress={handlePickRestoreFile}
            loading={restoreLoading}
            disabled={backupLoading || restoreLoading}
            style={styles.syncBtn}
          />
          <Text style={styles.settingHint}>
            Export a JSON backup of all expenses, budgets, settlements, and categories. To restore, tap "Restore from Backup" and select your backup file.
          </Text>
        </Card>

        {/* Device Info */}
        {/* <Text style={styles.label}>DEVICE</Text>
        <Card style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.settingKey}>Device ID</Text>
            <Text style={[styles.settingValue, {fontSize: 11}]}>
              {deviceConfig?.deviceId?.substring(0, 20) ?? '—'}...
            </Text>
          </View>
          <Divider />
          <Text style={styles.settingHint}>
            Share this ID with your partner for sync setup.
          </Text>
        </Card> */}

        {/* Auto-Categorization */}
        <Text style={styles.label}>AUTO-CATEGORIZATION</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.navRow}
            onPress={() => setSection('rules')}>
            <Text style={styles.settingKey}>Manage Rules</Text>
            <Text style={styles.navChevron}>›</Text>
          </TouchableOpacity>
          <Text style={styles.settingHint}>
            {rules.length} rule{rules.length !== 1 ? 's' : ''} configured
          </Text>
        </Card>

        {/* Sign Out */}
        <Text style={styles.label}>ACCOUNT</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Sign Out',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteConfig('profile');
                    await deleteConfig('my_member_id');
                    await deleteConfig('canonical_partner_member_id');
                    store.logout();
                  },
                },
              ])
            }>
            <Text style={[styles.settingKey, {color: Colors.danger}]}>Sign Out</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  content: {padding: Spacing.md, paddingBottom: Spacing.xl},
  label: {...Typography.label, marginTop: Spacing.lg, marginBottom: Spacing.sm},
  firstLabel: {...Typography.label, marginTop: Spacing.xs, marginBottom: Spacing.sm},
  card: {marginBottom: Spacing.xs, ...Shadows.sm},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm},
  settingKey: {...Typography.body},
  settingValue: {...Typography.bodySmall, maxWidth: '55%', textAlign: 'right'},
  settingHint: {...Typography.caption, marginTop: Spacing.xs, lineHeight: 16},
  syncBtn: {marginBottom: Spacing.sm},
  errorText: {...Typography.caption, color: Colors.danger, marginTop: Spacing.xs},
  navRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  navChevron: {fontSize: 20, color: Colors.textMuted},
  colorSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: Colors.text,
  },
  colorCheck: {color: '#fff', fontWeight: '700', fontSize: 16},
  hexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  hexTextInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    color: Colors.text,
    fontSize: 14,
    backgroundColor: Colors.surfaceAlt,
  },
  hexApplyBtn: {height: 38, justifyContent: 'center'},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionTitle: {...Typography.h3},
  backLink: {color: Colors.primary, fontSize: 15},
  headerSpacer: {width: 60},
  rulesList: {padding: Spacing.md, paddingBottom: Spacing.xl},
  ruleCard: {marginBottom: Spacing.sm, ...Shadows.sm},
  ruleHeader: {flexDirection: 'row', alignItems: 'center'},
  catDot: {width: 10, height: 10, borderRadius: 5, marginRight: Spacing.sm},
  rulePattern: {...Typography.bodyMedium, flex: 1},
  ruleFooter: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xs},
  ruleMeta: {...Typography.caption},
  ruleActions: {flexDirection: 'row', gap: Spacing.sm},
  editLink: {color: Colors.primary, fontSize: 13, fontWeight: '600'},
  deleteLink: {color: Colors.danger, fontSize: 13, fontWeight: '600'},
  emptyText: {...Typography.bodySmall, textAlign: 'center', marginTop: Spacing.xl},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '85%',
  },
  modalTitle: {...Typography.h3, marginBottom: Spacing.md},
  inputLabel: {...Typography.label, marginBottom: Spacing.xs},
  catChip: {paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.xs},
  catChipText: {fontSize: 13, fontWeight: '500', color: Colors.text},
  radioRow: {flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md},
  radioChip: {flex: 1, paddingVertical: 8, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center'},
  radioChipSelected: {backgroundColor: Colors.primary, borderColor: Colors.primary},
  radioChipText: {fontSize: 13, fontWeight: '500', color: Colors.text},
  switchRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md},
  switchLabel: {...Typography.body},
  modalButtons: {flexDirection: 'row', gap: Spacing.sm},
  modalBtn: {flex: 1},
  deviceRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  deviceName: {...Typography.bodyMedium},
  deviceAddress: {...Typography.caption, color: Colors.textMuted},
  currencyRowRight: {flexDirection: 'row', alignItems: 'center', gap: 4},
  currencyValueText: {...Typography.bodySmall, textAlign: 'right'},
  currencyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginBottom: 2,
  },
  currencyOptionSelected: {backgroundColor: Colors.primary},
  currencyCode: {...Typography.bodyMedium, minWidth: 48},
  currencyName: {...Typography.bodySmall, color: Colors.textMuted, flex: 1, textAlign: 'right'},
  currencyTextSelected: {color: Colors.textOnPrimary},
});

