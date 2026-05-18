import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import FontAwesome from 'react-native-vector-icons/FontAwesome5';
import dayjs from 'dayjs';
import {PieChart} from 'react-native-chart-kit';
import {Card, LoadingState, ProgressBar} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius, Shadows} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {getExpenses, getMonthlyTotal} from '../../../db/repositories/expenseRepository';
import {getSettlements} from '../../../db/repositories/settlementRepository';
import {getMembers} from '../../../db/repositories/memberRepository';
import {getBudgets, getCategorySpend} from '../../../db/repositories/budgetRepository';
import {computeBalances, formatAmount} from '../../balances/services/balanceService';
import {computeBudgetRows, summarizeBudgets} from '../../budgets/services/budgetService';
import {BudgetRow} from '../../../types';

const CHART_WIDTH = Dimensions.get('window').width - Spacing.md * 2;

interface Props {
  navigation: any;
}

export const HomeScreen: React.FC<Props> = ({navigation}) => {
  const {myMember, partnerMember, profile, categories, syncStatus} = useAppStore();
  const [loading, setLoading] = useState(true);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [netBalance, setNetBalance] = useState(0);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);

  const monthKey = dayjs().format('YYYY-MM');
  const currency = profile?.currency ?? 'CAD';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [expenses, settlements, members, total, budgets, spendMap] = await Promise.all([
        getExpenses(),
        getSettlements(),
        getMembers(),
        getMonthlyTotal(monthKey),
        getBudgets(monthKey),
        getCategorySpend(monthKey),
      ]);
      setMonthlyTotal(total);

      if (myMember && partnerMember) {
        const summary = computeBalances(
          expenses, settlements, myMember.id, partnerMember.id, members, syncStatus.lastSyncAt,
        );
        setNetBalance(summary.netBalance);
      }

      const rows = computeBudgetRows(categories, budgets, spendMap);
      setBudgetRows(rows.filter(r => r.spentAmount > 0 || r.hasBudget));
    } finally {
      setLoading(false);
    }
  }, [myMember, partnerMember, syncStatus.lastSyncAt, monthKey, categories]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    loadData();
    return unsubscribe;
  }, [navigation, loadData]);

  const absBalance = Math.abs(netBalance);
  const iOwe = netBalance < 0;

  // Pie chart: categories with spend this month
  const pieData = budgetRows
    .filter(r => r.spentAmount > 0)
    .map(r => ({
      name: r.category.name,
      population: r.spentAmount,
      color: r.category.color,
      legendFontColor: Colors.text,
      legendFontSize: 11,
    }));

  const budgetSummary = summarizeBudgets(budgetRows);
  const budgetPct = budgetSummary.totalBudget > 0
    ? Math.min((budgetSummary.totalSpent / budgetSummary.totalBudget) * 100, 100)
    : 0;

  const dayOfMonth = dayjs().date();
  const daysInMonth = dayjs().daysInMonth();
  const weekOfMonth = Math.floor(dayOfMonth / 7);
  const totalWeeks = Math.floor(daysInMonth / 7);
  const monthOfYear = dayjs().month() + 1;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey, {profile?.myName ?? 'there'} 👋</Text>
            <Text style={styles.subtitle}>{dayjs().format('MMMM YYYY')}</Text>
          </View>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
            <FontAwesome name="cog" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? <LoadingState /> : (
          <>
            {/* 1. Monthly Spend */}
            <TouchableOpacity onPress={() => navigation.navigate('Expenses')} activeOpacity={0.85}>
              <Card style={styles.primaryCard} padded={false}>
                <View style={styles.primaryContent}>
                  <View style={styles.primaryHeader}>
                    <Text style={styles.primaryLabel}>Total spent this month</Text>
                    <TouchableOpacity
                      style={styles.primaryAddBtn}
                      onPress={() => navigation.navigate('AddExpense')}
                      activeOpacity={0.8}>
                      <FontAwesome name="plus" size={20} color={Colors.surface} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.primaryAmountRow}>
                    {currency === 'INR' && <Text style={styles.primaryCurrency}>₹</Text>}
                    <Text style={styles.primaryAmount}>
                      {(monthlyTotal / 100).toLocaleString(
                        currency === 'INR' ? 'en-IN' : 'en-US',
                        {minimumFractionDigits: 0, maximumFractionDigits: 2},
                      )}
                    </Text>
                    {currency !== 'INR' && <Text style={styles.primaryCurrency}>{currency}</Text>}
                  </View>
                  <Text style={styles.primarySub}>{dayjs().format('MMMM YYYY')} · tap to view expenses</Text>
                </View>
              </Card>
            </TouchableOpacity>
            {/* 2. Balance */}
            <TouchableOpacity onPress={() => navigation.navigate('Balances')} activeOpacity={0.85}>
              <Card style={styles.section} padded={false}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Balance</Text>
                  <Text style={styles.seeAll}>See details ›</Text>
                </View>
                <View style={styles.balanceRow}>
                  <View style={[styles.balanceDot, {backgroundColor: iOwe ? Colors.danger : Colors.success}]} />
                  <Text style={styles.balanceText}>
                    {absBalance === 0
                      ? 'All settled up ✓'
                      : iOwe
                      ? `You owe ${profile?.partnerName}`
                      : `${profile?.partnerName} owes you`}
                  </Text>
                  {absBalance > 0 && (
                    <Text style={[styles.balanceAmt, {color: iOwe ? Colors.danger : Colors.success}]}>
                      {formatAmount(absBalance, currency)}
                    </Text>
                  )}
                </View>
              </Card>
            </TouchableOpacity>

            {/* 4. Spend Distribution */}
            <TouchableOpacity onPress={() => navigation.navigate('Insights')} activeOpacity={0.85}>
              <Card style={styles.section} padded={false}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Spend Distribution</Text>
                  <Text style={styles.seeAll}>See details ›</Text>
                </View>
                {pieData.length === 0 ? (
                  <Text style={styles.emptyText}>No expenses recorded this month</Text>
                ) : (
                  <PieChart
                    data={pieData}
                    width={CHART_WIDTH}
                    height={189}
                    chartConfig={{
                      color: (opacity = 1) => `rgba(${Colors.shadowRGB},${opacity})`,
                      backgroundGradientFrom: Colors.surface,
                      backgroundGradientTo: Colors.surface,
                    }}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="8"
                    absolute={false}
                  />
                )}
              </Card>
            </TouchableOpacity>


            {/* 3. Budget Summary */}
            <TouchableOpacity onPress={() => navigation.navigate('Budgets')} activeOpacity={0.85}>
              <Card style={styles.section} padded={false}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Budgets</Text>
                  <Text style={styles.seeAll}>See details ›</Text>
                </View>
                {budgetSummary.totalBudget === 0 ? (
                  <Text style={styles.emptyText}>No budgets set for this month</Text>
                ) : (
                  <>
                    <View style={styles.budgetAmounts}>
                      <Text style={styles.budgetSpent}>{formatAmount(budgetSummary.totalSpent, currency)} spent</Text>
                      <Text style={styles.budgetTotal}>of {formatAmount(budgetSummary.totalBudget, currency)}</Text>
                    </View>
                    <View style={styles.progressWrap}>
                      <ProgressBar
                        percent={budgetPct}
                        color={budgetSummary.overBudgetCount > 0 ? Colors.danger : Colors.success}
                      />
                    </View>
                    {budgetSummary.overBudgetCount > 0 && (
                      <Text style={styles.overBudgetWarning}>
                        ⚠️ {budgetSummary.overBudgetCount} {budgetSummary.overBudgetCount === 1 ? 'category' : 'categories'} over budget
                      </Text>
                    )}
                    {budgetRows.filter(r => r.hasBudget).slice(0, 3).map(r => (
                      <View key={r.category.id} style={styles.budgetRow}>
                        <View style={[styles.catDot, {backgroundColor: r.category.color}]} />
                        <Text style={styles.budgetCatName} numberOfLines={1}>{r.category.name}</Text>
                        <Text style={[styles.budgetCatAmt, {color: r.isOverBudget ? Colors.danger : r.category.color}]}>
                          {formatAmount(r.spentAmount, currency)}
                          {r.hasBudget ? ` / ${formatAmount(r.budgetAmount, currency)}` : ''}
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </Card>
            </TouchableOpacity>

            {/* 5. Time Progress */}
            <View style={styles.dotProgressCard}>
              {[
                {label: 'Day', current: dayOfMonth, total: daysInMonth},
                {label: 'Week', current: weekOfMonth, total: totalWeeks},
                {label: 'Month', current: monthOfYear, total: 12},
              ].map(({label, current, total}) => (
                <View key={label} style={styles.dotProgressRow}>
                  <Text style={styles.dotProgressLabel}>{label}</Text>
                  <View style={styles.dotProgressDots}>
                    {Array.from({length: total}, (_, i) => (
                      <View key={i} style={[styles.dotBase, i < current ? styles.dotActive : styles.dotInactive]} />
                    ))}
                  </View>
                  <Text style={styles.dotProgressFraction}>{current}/{total}</Text>
                </View>
              ))}
              <View style={{height: Spacing.sm}} />
            </View>

          </>
        )}
      </ScrollView>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  scroll: {paddingBottom: Spacing.sm},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 4,
  },
  greeting: {...Typography.h2, color: Colors.primary},
  subtitle: {...Typography.body, color: Colors.textMuted},
  settingsBtn: {padding: Spacing.sm},
  primaryCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: 4,
    borderRadius: BorderRadius.md,
    ...Shadows.sm,
  },
  primaryContent: {padding: Spacing.md, paddingTop: Spacing.sm},
  primaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  primaryLabel: {...Typography.h3, color: Colors.primary},
  primaryAddBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryAmountRow: {flexDirection: 'row', alignItems: 'baseline', gap: 6},
  primaryAmount: {...Typography.h1, color: Colors.primary, fontSize: 36},
  primaryCurrency: {fontSize: 14, fontWeight: '600', color: Colors.primary},
  primarySub: {...Typography.caption, color: Colors.primary, marginTop: 4},
  section: {
    marginHorizontal: Spacing.md,
    marginBottom: 4,
    borderRadius: BorderRadius.md,
    ...Shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 4,
  },
  sectionTitle: {...Typography.h3, color: Colors.primary},
  seeAll: {...Typography.caption, color: Colors.primary},
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  balanceDot: {width: 10, height: 10, borderRadius: 5},
  balanceText: {...Typography.body, flex: 1, color: Colors.primary},
  balanceAmt: {...Typography.body, fontWeight: '700'},
  budgetAmounts: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    marginBottom: 4,
  },
  budgetSpent: {...Typography.h3, color: Colors.primary},
  budgetTotal: {...Typography.body, color: Colors.textMuted},
  progressWrap: {paddingHorizontal: Spacing.md, marginBottom: 4},
  overBudgetWarning: {
    ...Typography.caption,
    color: Colors.danger,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    gap: Spacing.sm,
  },
  catDot: {width: 8, height: 8, borderRadius: 4},
  budgetCatName: {...Typography.body, flex: 1, color: Colors.textMuted},
  budgetCatAmt: {...Typography.body, fontWeight: '500'},
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  dotProgressCard: {
    marginHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  dotProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: Spacing.sm,
  },
  dotProgressLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
    width: 38,
  },
  dotProgressDots: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 1,
  },
  dotBase: {
    width: 7.5,
    height: 7.5,
    borderRadius: 4,
  },
  dotActive: {backgroundColor: Colors.primary},
  dotInactive: {backgroundColor: Colors.border},
  dotProgressFraction: {
    ...Typography.caption,
    color: Colors.textMuted,
    width: 42,
    textAlign: 'right',
  },
});
