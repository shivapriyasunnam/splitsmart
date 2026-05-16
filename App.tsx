import React, {useEffect} from 'react';
import {ActivityIndicator, StatusBar, StyleSheet, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import {AppProvider} from './src/app/providers/AppProvider';
import {useAppStore} from './src/app/providers/store';
import {AppNavigator} from './src/app/navigation/AppNavigator';
import {SetupScreen} from './src/features/profile/screens/SetupScreen';
import {Colors} from './src/app/theme';
import {runEODCatchup} from './src/features/sync/jobs/eodCatchup';

dayjs.extend(relativeTime);

function AppContent() {
  const {isInitializing, isSetupComplete} = useAppStore();

  useEffect(() => {
    runEODCatchup().catch(err => console.warn('EOD catchup error:', err));
  }, []);

  if (isInitializing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isSetupComplete) {
    return <SetupScreen />;
  }

  return (
    <NavigationContainer>
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
