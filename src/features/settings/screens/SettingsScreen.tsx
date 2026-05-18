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
import {getConfig, setConfig} from '../../../db/repositories/configRepository';
import {
  getCategoryRules,
  createCategoryRule,
  updateCategoryRule,
  deleteCategoryRule,
  getAllCategories,
} from '../../../db/repositories/categoryRepository';
import {validateRegexPattern} from '../../categories/services/categorizationService';
import {CategoryRule, Category} from '../../../types';
import {formatAmount} from '../../balances/services/balanceService';
import {hashPassphrase} from '../../sync/crypto/encryptionService';
import {
  getBluetoothSyncConfig,
  setPeerDevice,
  getBondedDevices,
  discoverDevices,
  requestBluetoothEnabled,
  sendViaBluetooth,
  receiveViaBluetooth,
  cancelBluetoothAccept,
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
  const [section, setSection] = useState<'main' | 'rules' | 'profile'>('main');
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [editRuleModal, setEditRuleModal] = useState(false);
  const [currentRule, setCurrentRule] = useState<Partial<CategoryRule> | null>(null);
  const [partnerFolderId, setPartnerFolderId] = useState('');

  // ─── Bluetooth state ─────────────────────────────────────────────────────
  const [btEnabled, setBtEnabled] = useState<boolean | null>(null);
  const [btPeerAddress, setBtPeerAddress] = useState<string | null>(null);
  const [btPeerName, setBtPeerName] = useState<string | null>(null);
  const [btLastTransfer, setBtLastTransfer] = useState<string | null>(null);
  const [btLastError, setBtLastError] = useState<string | null>(null);
  const [btSending, setBtSending] = useState(false);
  const [btReceiving, setBtReceiving] = useState(false);
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

  async function handleBluetoothSend() {
    const permitted = await requestBtPermissionsAndroid();
    if (!permitted) {
      Alert.alert('Permission Required', 'Bluetooth permissions are needed to send.');
      return;
    }
    setBtSending(true);
    try {
      const result = await sendViaBluetooth();
      if (result.success && result.noChanges) {
        Alert.alert('No Changes', 'No new local changes to send via Bluetooth.');
      } else if (result.success) {
        const cfg = await getBluetoothSyncConfig();
        setBtLastTransfer(cfg.lastTransferAt);
        setBtLastError(null);
        Alert.alert('Sent', 'Changes sent and acknowledged by partner device.');
      } else {
        setBtLastError(result.error ?? null);
        Alert.alert('Send Failed', result.error ?? 'Bluetooth send failed.');
      }
    } finally {
      setBtSending(false);
    }
  }

  async function handleBluetoothReceive() {
    const permitted = await requestBtPermissionsAndroid();
    if (!permitted) {
      Alert.alert('Permission Required', 'Bluetooth permissions are needed to receive.');
      return;
    }
    Alert.alert(
      'Waiting for sender…',
      'This device is now listening. Ask your partner to send from their device. Tap Cancel to stop.',
      [
        {
          text: 'Cancel',
          onPress: () => {
            cancelBluetoothAccept().catch(() => {});
            setBtReceiving(false);
          },
        },
      ],
      {cancelable: false},
    );
    setBtReceiving(true);
    try {
      const result = await receiveViaBluetooth(120_000);
      if (result.success && result.duplicate) {
        Alert.alert('Already Applied', 'This package was already imported — no duplicates created.');
      } else if (result.success) {
        setBtLastTransfer(dayjs().toISOString());
        setBtLastError(null);
        const s = await getConfig<any>('sync_status');
        if (s) store.setSyncStatus(s);
        Alert.alert('Received', `Imported ${result.imported ?? 0} package(s) from partner.`);
      } else {
        setBtLastError(result.error ?? null);
        Alert.alert('Receive Failed', result.error ?? 'Bluetooth receive failed.');
      }
    } finally {
      setBtReceiving(false);
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
                    <Text style={[styles.catChipText, currentRule?.category_id === c.id && {color: '#fff'}]}>
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
                    <Text style={[styles.radioChipText, currentRule?.target_field === tf && {color: '#fff'}]}>
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
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Section */}
        <Text style={styles.label}>PROFILE</Text>
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
          <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Your Role</Text>
            <Text style={styles.settingValue}>Person {profile?.myRole ?? '—'}</Text>
          </View>
          <Divider />
          <View style={styles.row}>
            <Text style={styles.settingKey}>Currency</Text>
            <Text style={styles.settingValue}>{profile?.currency ?? '—'}</Text>
          </View>
        </Card>

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
        <Text style={styles.label}>SYNC</Text>
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
            title="Send via Bluetooth"
            onPress={handleBluetoothSend}
            loading={btSending}
            disabled={btSending || btReceiving || !btPeerAddress}
            style={styles.syncBtn}
          />
          <Button
            title="Receive via Bluetooth"
            variant="secondary"
            onPress={handleBluetoothReceive}
            loading={btReceiving}
            disabled={btSending || btReceiving}
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

        {/* Device Info */}
        <Text style={styles.label}>DEVICE</Text>
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
        </Card>

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
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  content: {padding: Spacing.md, paddingBottom: Spacing.xl},
  label: {...Typography.label, marginTop: Spacing.lg, marginBottom: Spacing.sm},
  card: {marginBottom: Spacing.xs, ...Shadows.sm},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm},
  settingKey: {...Typography.body},
  settingValue: {...Typography.bodySmall, maxWidth: '55%', textAlign: 'right'},
  settingHint: {...Typography.caption, marginTop: Spacing.xs, lineHeight: 16},
  syncBtn: {marginBottom: Spacing.sm},
  errorText: {...Typography.caption, color: Colors.danger, marginTop: Spacing.xs},
  navRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  navChevron: {fontSize: 20, color: Colors.textMuted},
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
});
