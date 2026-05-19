import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, Alert, Modal, KeyboardAvoidingView, Platform, TextInput} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Card, LoadingState, Button, Divider} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius, Shadows} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {getExpenses} from '../../../db/repositories/expenseRepository';
import {getSettlements, createSettlement, softDeleteSettlement} from '../../../db/repositories/settlementRepository';
import {getMembers} from '../../../db/repositories/memberRepository';
import {computeBalances, formatAmount, parseAmountToMinor, formatAmountMajor} from '../services/balanceService';
import {BalanceSummary, Settlement} from '../../../types';
import {Input} from '../../../components';
import dayjs from 'dayjs';

interface Props {
  navigation: any;
}

export const BalancesScreen: React.FC<Props> = ({navigation}) => {
  const {myMember, partnerMember, profile, syncStatus, themeVersion} = useAppStore();
  const styles = useMemo(() => makeStyles(), [themeVersion]);
  const [balance, setBalance] = useState<BalanceSummary | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const settleAmountRef = useRef<TextInput>(null);
  const [settleNote, setSettleNote] = useState('');
  const [settling, setSettling] = useState(false);

  const loadData = useCallback(async () => {
    if (!myMember || !partnerMember) return;
    setLoading(true);
    try {
      const members = await getMembers();
      const expenses = await getExpenses();
      const sett = await getSettlements();
      setSettlements(sett);
      const summary = computeBalances(
        expenses,
        sett,
        myMember.id,
        partnerMember.id,
        members,
        syncStatus.lastSyncAt,
      );
      setBalance(summary);
    } finally {
      setLoading(false);
    }
  }, [myMember, partnerMember, syncStatus.lastSyncAt]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    loadData();
    return unsubscribe;
  }, [navigation, loadData]);

  useEffect(() => {
    if (showSettleModal) {
      const timer = setTimeout(() => settleAmountRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [showSettleModal]);

  function confirmDeleteSettlement(id: string) {
    Alert.alert('Delete Settlement', 'Remove this settlement record?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await softDeleteSettlement(id);
          loadData();
        },
      },
    ]);
  }

  async function handleSettle() {
    if (!myMember || !partnerMember) return;
    const amt = parseAmountToMinor(settleAmount);
    if (amt <= 0) {
      Alert.alert('Error', 'Enter a valid amount.');
      return;
    }
    setSettling(true);
    try {
      // Determine payer & receiver based on current balance
      const iOwe = balance && balance.netBalance < 0;
      await createSettlement({
        amount_minor: amt,
        paid_by_member_id: iOwe ? myMember.id : partnerMember.id,
        received_by_member_id: iOwe ? partnerMember.id : myMember.id,
        settlement_date: dayjs().format('YYYY-MM-DD'),
        note: settleNote.trim() || null,
      });
      setShowSettleModal(false);
      setSettleAmount('');
      setSettleNote('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to record settlement.');
    } finally {
      setSettling(false);
    }
  }

  const currency = profile?.currency ?? 'CAD';

  function getBalanceLabel(): {label: string; color: string; amount: number} {
    if (!balance) return {label: 'Loading...', color: Colors.text, amount: 0};
    const net = balance.netBalance;
    if (Math.abs(net) < 100) {
      return {label: 'All settled up! 🎉', color: Colors.success, amount: 0};
    }
    if (net > 0) {
      return {
        label: `${profile?.partnerName ?? 'Partner'} owes you`,
        color: Colors.success,
        amount: net,
      };
    }
    return {
      label: `You owe ${profile?.partnerName ?? 'Partner'}`,
      color: Colors.danger,
      amount: Math.abs(net),
    };
  }

  const balanceInfo = getBalanceLabel();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <LoadingState />
        ) : (
          <>
            {/* Main Balance Card */}
            <Card
              style={[styles.mainCard, {backgroundColor: balanceInfo.amount === 0 ? Colors.success : Colors.surface}]}>
              <Text style={[styles.balanceLabel, balanceInfo.amount === 0 && {color: Colors.textOnPrimary}]}>
                {balanceInfo.label}
              </Text>
              {balanceInfo.amount > 0 && (
                <Text style={[styles.balanceAmount, {color: balanceInfo.color}]}>
                  {formatAmount(balanceInfo.amount, currency)}
                </Text>
              )}
              {syncStatus.lastSyncAt && (
                <Text style={styles.syncTime}>
                  Last sync: {dayjs(syncStatus.lastSyncAt).fromNow()}
                </Text>
              )}
            </Card>

            {/* Breakdown Cards */}
            <View style={styles.breakdownGrid}>
              <Card style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>Total Shared Spend</Text>
                <Text style={styles.breakdownAmount}>
                  {formatAmount(balance?.totalSharedSpend ?? 0, currency)}
                </Text>
              </Card>
              <Card style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>My Share</Text>
                <Text style={styles.breakdownAmount}>
                  {formatAmount(balance?.myShare ?? 0, currency)}
                </Text>
              </Card>
              <Card style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>
                  {profile?.myName ?? 'Me'} paid
                </Text>
                <Text style={[styles.breakdownAmount, {color: Colors.primary}]}>
                  {formatAmount(balance?.totalPaidByMe ?? 0, currency)}
                </Text>
              </Card>
              <Card style={styles.breakdownCard}>
                <Text style={styles.breakdownLabel}>
                  {profile?.partnerName ?? 'Partner'} paid
                </Text>
                <Text style={[styles.breakdownAmount, {color: Colors.secondary}]}>
                  {formatAmount(balance?.totalPaidByPartner ?? 0, currency)}
                </Text>
              </Card>
            </View>

            {/* Settle Up */}
            {balanceInfo.amount > 0 && (
              <Button
                title="Record Settlement"
                onPress={() => setShowSettleModal(true)}
                style={styles.settleBtn}
              />
            )}

            {/* Settlement History */}
            {settlements.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Settlement History</Text>
                {settlements.map(s => {
                  const isMePayer = s.paid_by_member_id === myMember?.id;
                  return (
                    <Card key={s.id} style={styles.settlementRow} onLongPress={() => confirmDeleteSettlement(s.id)}>
                      <View style={styles.settleRowContent}>
                        <View style={styles.settleInfo}>
                          <Text style={styles.settleName}>
                            {isMePayer ? profile?.myName : profile?.partnerName} paid{' '}
                            {isMePayer ? profile?.partnerName : profile?.myName}
                          </Text>
                          <Text style={styles.settleDate}>
                            {dayjs(s.settlement_date).format('D MMM YYYY')}
                            {s.note ? ` · ${s.note}` : ''}
                          </Text>
                        </View>
                        <Text style={styles.settleAmount}>
                          {formatAmount(s.amount_minor, currency)}
                        </Text>
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Settlement Modal */}
      {showSettleModal && (
        <Modal
          visible={showSettleModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSettleModal(false)}>
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Record Settlement</Text>
            <Text style={styles.modalSubtitle}>
              {balanceInfo.label}:{' '}
              <Text style={{fontWeight: '700', color: balanceInfo.color}}>
                {formatAmount(balanceInfo.amount, currency)}
              </Text>
            </Text>
            <Divider style={{marginVertical: Spacing.sm}} />
            <Input
              label="Amount Settled"
              value={settleAmount}
              onChangeText={setSettleAmount}
              keyboardType="decimal-pad"
              placeholder={formatAmountMajor(balanceInfo.amount)}
              ref={settleAmountRef}
            />
            <Input
              label="Note (optional)"
              value={settleNote}
              onChangeText={setSettleNote}
              placeholder="Cash, UPI, etc."
            />
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setShowSettleModal(false)}
                style={styles.modalBtn}
              />
              <Button
                title="Save"
                onPress={handleSettle}
                loading={settling}
                style={styles.modalBtn}
              />
            </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const makeStyles = () => StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  content: {padding: Spacing.md, paddingBottom: Spacing.sm},
  mainCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadows.md,
    marginBottom: Spacing.md,
  },
  balanceLabel: {...Typography.h3, textAlign: 'center', marginBottom: Spacing.sm},
  balanceAmount: {fontSize: 36, fontWeight: '800', textAlign: 'center'},
  syncTime: {...Typography.caption, marginTop: Spacing.sm},
  breakdownGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md},
  breakdownCard: {
    flex: 1,
    minWidth: '45%',
    ...Shadows.sm,
  },
  breakdownLabel: {...Typography.caption, marginBottom: Spacing.xs},
  breakdownAmount: {...Typography.h3},
  settleBtn: {marginBottom: Spacing.md},
  section: {marginTop: Spacing.sm},
  sectionTitle: {...Typography.label, marginBottom: Spacing.sm},
  settlementRow: {marginBottom: Spacing.xs, ...Shadows.sm},
  settleRowContent: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  settleInfo: {flex: 1},
  settleName: {...Typography.bodyMedium},
  settleDate: {...Typography.caption, marginTop: 2},
  settleAmount: {...Typography.bodyMedium, color: Colors.primary},
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  modalTitle: {...Typography.h3, marginBottom: Spacing.xs},
  modalSubtitle: {...Typography.bodySmall, marginBottom: Spacing.sm},
  modalButtons: {flexDirection: 'row', gap: Spacing.sm},
  modalBtn: {flex: 1},
});
