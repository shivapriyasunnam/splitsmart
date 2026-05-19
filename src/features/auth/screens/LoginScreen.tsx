import React, {useState} from 'react';
import {View, Text, StyleSheet, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, Input, Card} from '../../../components';
import AppLogo from '../../../components/AppLogo';
import {Colors, Typography, Spacing} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {setConfig} from '../../../db/repositories/configRepository';
import {seedMembersFromProfile} from '../../../db/repositories/memberRepository';
import {Profile} from '../../../types';
import {hashPassphrase} from '../../sync/crypto/encryptionService';
import {HARDCODED_USERS, SHARED_PASSPHRASE, findUser} from '../constants/users';

export const LoginScreen: React.FC = () => {
  const {setProfile, setMyMember, setPartnerMember, setSetupComplete} = useAppStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const user = findUser(username.trim(), password);
    if (!user) {
      Alert.alert('Login Failed', 'Incorrect username or password.');
      return;
    }

    setLoading(true);
    try {
      const partner = HARDCODED_USERS.find(u => u.username !== user.username)!;

      const profile: Profile = {
        myName: user.displayName,
        partnerName: partner.displayName,
        myRole: user.role,
        currency: 'CAD',
      };
      await setConfig('profile', profile);

      // Both devices use the same passphrase → identical encryption key on both sides
      const passphraseHash = hashPassphrase(SHARED_PASSPHRASE);
      await setConfig('encryption', {passphraseHash, salt: passphraseHash.substring(0, 32)});

      // Upsert both members with deterministic fixed IDs — UUID mismatch is impossible
      const {myMember, partnerMember} = await seedMembersFromProfile(
        user.displayName,
        user.role,
        partner.displayName,
        user.memberId,
        partner.memberId,
      );

      // Both IDs are known at login time; no Bluetooth pairing handshake required
      await setConfig('my_member_id', user.memberId);
      await setConfig('canonical_partner_member_id', partner.memberId);

      setProfile(profile);
      setMyMember(myMember);
      setPartnerMember(partnerMember);
      setSetupComplete(true);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <AppLogo size={110} />
          <Text style={styles.appName}>SplitSmart</Text>
          <Text style={styles.tagline}>Shared expenses, simplified.</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>
          <Input
            label="Username"
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. priya"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />
          <Button
            title={loading ? 'Signing in…' : 'Sign In'}
            onPress={handleLogin}
            disabled={loading || !username.trim() || !password}
            style={styles.button}
          />
        </Card>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  content: {flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg},
  header: {alignItems: 'center', marginBottom: Spacing.xl},
  appName: {
    ...Typography.h1,
    color: Colors.primary,
    fontSize: 28,
    marginTop: Spacing.sm,
  },
  tagline: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  card: {padding: Spacing.lg},
  cardTitle: {
    ...Typography.h2,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  button: {marginTop: Spacing.sm},
});
