import React, {useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, Input, Card} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {setConfig} from '../../../db/repositories/configRepository';
import {seedMembersFromProfile} from '../../../db/repositories/memberRepository';
import {Profile, MemberRole} from '../../../types';
import {hashPassphrase} from '../../sync/crypto/encryptionService';

export const SetupScreen: React.FC = () => {
  const {setProfile, setMyMember, setPartnerMember, setSetupComplete} = useAppStore();

  const [myName, setMyName] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [myRole, setMyRole] = useState<MemberRole>('A');
  const [currency, setCurrency] = useState('CAD');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const currencies = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED'];

  async function handleComplete() {
    console.log('[Setup] handleComplete called', {myName, partnerName, passphraseLen: passphrase.length});
    if (!myName.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    if (!partnerName.trim()) {
      Alert.alert('Required', "Please enter your partner's name.");
      return;
    }
    if (!passphrase.trim() || passphrase.length < 6) {
      Alert.alert('Passphrase', 'Passphrase must be at least 6 characters.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      Alert.alert('Passphrase', 'Passphrases do not match.');
      return;
    }

    setLoading(true);
    try {
      console.log('[Setup] saving profile...');
      const profile: Profile = {myName: myName.trim(), partnerName: partnerName.trim(), myRole, currency};
      await setConfig('profile', profile);

      // Hash passphrase - never store raw
      const passphraseHash = hashPassphrase(passphrase);
      await setConfig('encryption', {passphraseHash, salt: passphraseHash.substring(0, 32)});

      const {myMember, partnerMember} = await seedMembersFromProfile(
        profile.myName, profile.myRole, profile.partnerName,
      );

      setProfile(profile);
      setMyMember(myMember);
      setPartnerMember(partnerMember);
      console.log('[Setup] calling setSetupComplete(true)');
      setSetupComplete(true);
    } catch (err: any) {
      console.log('[Setup] ERROR', err);
      Alert.alert('Error', err.message ?? 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>SplitSmart</Text>
          <Text style={styles.tagline}>Shared expenses, simplified.</Text>
        </View>

        {step === 1 && (
          <Card style={styles.card}>
            <Text style={styles.stepTitle}>Who are you? 👋</Text>
            <Text style={styles.stepSubtitle}>
              Set up your local profile. This is stored only on your device.
            </Text>

            <Input
              label="Your Name"
              value={myName}
              onChangeText={setMyName}
              placeholder="e.g. Priya"
              autoCapitalize="words"
            />
            <Input
              label="Partner's Name"
              value={partnerName}
              onChangeText={setPartnerName}
              placeholder="e.g. Rohan"
              autoCapitalize="words"
            />

            <Text style={styles.inputLabel}>Your Role</Text>
            <View style={styles.roleRow}>
              {(['A', 'B'] as MemberRole[]).map(role => (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleChip, myRole === role && styles.roleChipSelected]}
                  onPress={() => setMyRole(role)}>
                  <Text
                    style={[styles.roleChipText, myRole === role && styles.roleChipTextSelected]}>
                    Person {role}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Default Currency</Text>
            <View style={styles.currencyRow}>
              {currencies.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.currencyChip, currency === c && styles.currencyChipSelected]}
                  onPress={() => setCurrency(c)}>
                  <Text
                    style={[
                      styles.currencyChipText,
                      currency === c && styles.currencyChipTextSelected,
                    ]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title="Next"
              onPress={() => setStep(2)}
              disabled={!myName.trim() || !partnerName.trim()}
              style={styles.nextBtn}
            />
          </Card>
        )}

        {step === 2 && (
          <Card style={styles.card}>
            <Text style={styles.stepTitle}>Shared Passphrase 🔐</Text>
            <Text style={styles.stepSubtitle}>
              Both you and your partner must use the same passphrase. It encrypts
              your shared Google Drive files. Written down and kept safe is fine.
            </Text>

            <Input
              label="Passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder="At least 6 characters"
              secureTextEntry
            />
            <Input
              label="Confirm Passphrase"
              value={confirmPassphrase}
              onChangeText={setConfirmPassphrase}
              placeholder="Repeat passphrase"
              secureTextEntry
            />

            <View style={styles.noteBox}>
              <Text style={styles.noteText}>
                ⚠️ If you lose this passphrase, you cannot decrypt your Drive backups.
                Your local data is always safe.
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <Button
                title="Back"
                variant="secondary"
                onPress={() => setStep(1)}
                style={styles.backBtn}
              />
              <Button
                title="Get Started"
                onPress={handleComplete}
                loading={loading}
                style={styles.doneBtn}
                disabled={!passphrase || passphrase.length < 6 || passphrase !== confirmPassphrase}
              />
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.primary},
  content: {padding: Spacing.lg, paddingTop: Spacing.xxl},
  header: {alignItems: 'center', marginBottom: Spacing.xl},
  appName: {fontSize: 40, fontWeight: '800', color: Colors.textOnPrimary, letterSpacing: -1},
  tagline: {fontSize: 16, color: 'rgba(255,255,255,0.8)', marginTop: Spacing.xs},
  card: {borderRadius: BorderRadius.lg, padding: Spacing.lg},
  stepTitle: {...Typography.h2, marginBottom: Spacing.xs},
  stepSubtitle: {...Typography.bodySmall, marginBottom: Spacing.lg, lineHeight: 20},
  inputLabel: {...Typography.label, marginBottom: Spacing.xs, marginTop: Spacing.sm},
  roleRow: {flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md},
  roleChip: {flex: 1, paddingVertical: 10, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center'},
  roleChipSelected: {backgroundColor: Colors.primary, borderColor: Colors.primary},
  roleChipText: {...Typography.bodyMedium},
  roleChipTextSelected: {color: Colors.textOnPrimary},
  currencyRow: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md},
  currencyChip: {paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border},
  currencyChipSelected: {backgroundColor: Colors.primary, borderColor: Colors.primary},
  currencyChipText: {fontSize: 13, fontWeight: '500', color: Colors.text},
  currencyChipTextSelected: {color: Colors.textOnPrimary},
  nextBtn: {marginTop: Spacing.sm},
  buttonRow: {flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm},
  backBtn: {flex: 1},
  doneBtn: {flex: 2},
  noteBox: {backgroundColor: Colors.surfaceAlt, borderRadius: BorderRadius.sm, padding: Spacing.sm, marginBottom: Spacing.md},
  noteText: {...Typography.bodySmall, lineHeight: 18},
});
