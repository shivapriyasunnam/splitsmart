import React, {useEffect} from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Platform,
  StatusBar,
  StyleSheet,
  ToastAndroid,
  View,
} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import {AppProvider} from './src/app/providers/AppProvider';
import {useAppStore} from './src/app/providers/store';
import {AppNavigator} from './src/app/navigation/AppNavigator';
import {LoginScreen} from './src/features/auth/screens/LoginScreen';
import {Colors} from './src/app/theme';
import {runEODCatchup} from './src/features/sync/jobs/eodCatchup';
import {bluetoothListener, BT_SYNC_EVENT, BluetoothSyncEvent} from './src/features/sync/services/bluetoothListener';
import {getAllCategories} from './src/db/repositories/categoryRepository';
import {getMembers} from './src/db/repositories/memberRepository';

dayjs.extend(relativeTime);

function AppContent() {
  const {isInitializing, isSetupComplete, themeVersion} = useAppStore();

  useEffect(() => {
    runEODCatchup().catch(err => console.warn('EOD catchup error:', err));
  }, []);

  // Bluetooth sync listener lifecycle. Runs whenever the user is set up so
  // the partner can push changes to us without us having to tap anything.
  useEffect(() => {
    if (!isSetupComplete) return;

    let cancelled = false;

    (async () => {
      try {
        const enabled = await RNBluetoothClassic.isBluetoothEnabled();
        if (!cancelled && enabled) bluetoothListener.start();
      } catch (err) {
        console.warn('BT listener startup check failed:', err);
      }
    })();

    const onEnabled = RNBluetoothClassic.onBluetoothEnabled(() => {
      bluetoothListener.start();
    });
    const onDisabled = RNBluetoothClassic.onBluetoothDisabled(() => {
      bluetoothListener.stop().catch(() => {});
    });

    const syncSub = DeviceEventEmitter.addListener(
      BT_SYNC_EVENT,
      async (event: BluetoothSyncEvent) => {
        if (event.type !== 'sync_received') return;

        // Refresh store-cached data whose source-of-truth row may have just
        // been mutated by the merge. Screens that read directly from the DB
        // (expenses, budgets, settlements) re-fetch on focus; categories and
        // members live in the Zustand store and otherwise stay stale until
        // the next app launch.
        if (event.importedChanges) {
          try {
            const store = useAppStore.getState();
            const [cats, mems] = await Promise.all([getAllCategories(), getMembers()]);
            store.setCategories(cats);
            const profile = store.profile;
            if (profile) {
              const myMem = mems.find(m => m.role === profile.myRole);
              const partnerMem = mems.find(m => m.role !== profile.myRole);
              if (myMem) store.setMyMember(myMem);
              if (partnerMem) store.setPartnerMember(partnerMem);
            }
          } catch (err) {
            console.warn('[sync] post-receive store refresh failed:', err);
          }
        }

        // Toast only when the partner initiated. Responses to our own sync
        // already surface via the Alert in handleBluetoothSync.
        if (!event.wasRequest) return;
        if (Platform.OS !== 'android') return;
        const msg = event.importedChanges
          ? `${event.from} synced changes with you`
          : `${event.from} synced — no new changes`;
        ToastAndroid.show(msg, ToastAndroid.SHORT);
      },
    );

    return () => {
      cancelled = true;
      onEnabled.remove();
      onDisabled.remove();
      syncSub.remove();
      bluetoothListener.stop().catch(() => {});
    };
  }, [isSetupComplete]);

  if (isInitializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isSetupComplete) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer key={themeVersion}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
