import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import {BarChart, PieChart} from 'react-native-chart-kit';
import {Card, LoadingState, EmptyState} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius, Shadows} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {getBudgets, getCategorySpend} from '../../../db/repositories/budgetRepository';
import {getExpenses} from '../../../db/repositories/expenseRepository';
import {computeBudgetRows, summarizeBudgets} from '../../budgets/services/budgetService';
import {formatAmount} from '../../balances/services/balanceService';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - Spacing.md * 2;

interface Props {
  navigation: any;
}

export const InsightsScreen: React.FC<Props> = ({navigation}) => {
  const {categories, profile} = useAppStore();
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));
  const [budgetRows, setBudgetRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const currency = profile?.currency ?? 'INR';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const budgets = await getBudgets(selectedMonth);
      const spendMap = await getCategorySpend(selectedMonth);
      const rows = computeBudgetRows(categories, budgets, spendMap);
      setBudgetRows(rows.filter(r => r.spentAmount > 0 || r.hasBudget));
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, categories]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    loadData();
    return unsubscribe;
  }, [navigation, loadData]);

  const summary = summarizeBudgets(budgetRows);
  const rowsWithSpend = budgetRows.filter(r => r.spentAmount > 0);

  // Bar chart data: spend vs budget
  const barChartData = {
    labels: budgetRows.map(r => r.category.name.substring(0, 6)),
    datasets: [
      {
        data: budgetRows.map(r => r.spentAmount / 100),
        color: () => Colors.primary,
        strokeWidth: 2,
      },
      {
        data: budgetRows.map(r => r.hasBudget ? r.budgetAmount / 100 : 0),
        color: () => Colors.border,
        strokeWidth: 1,
      },
    ],
    legend: ['Spent', 'Budget'],
  };

  // Pie chart data
  const pieChartData = rowsWithSpend.map((r, i) => ({
    name: r.category.name,
    population: r.spentAmount,
    color: r.category.color,
    legendFontColor: Colors.text,
    legendFontSize: 12,
  }));

  const chartConfig = {
    backgroundGradientFrom: Colors.surface,
    backgroundGradientTo: Colors.surface,
    color: (opacity = 1) => `rgba(79, 70, 229, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.6,
    decimalPlaces: 0,
    labelColor: () => Colors.textSecondary,
    style: {borderRadius: BorderRadius.md},
    propsForBackgroundLines: {stroke: Colors.borderLight},
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Month Bar */}
      <View style={styles.monthBar}>
        <TouchableOpacity
          onPress={() =>
            setSelectedMonth(dayjs(selectedMonth).subtract(1, 'month').format('YYYY-MM'))
          }
          style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{dayjs(selectedMonth).format('MMMM YYYY')}</Text>
        <TouchableOpacity
          onPress={() => {
            const next = dayjs(selectedMonth).add(1, 'month');
            if (!next.isAfter(dayjs(), 'month')) {
              setSelectedMonth(next.format('YYYY-MM'));
            }
          }}
          style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Spent</Text>
              <Text style={[styles.summaryAmount, {color: Colors.primary}]}>
                {formatAmount(summary.totalSpent, currency)}
              </Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Budget</Text>
              <Text style={styles.summaryAmount}>
                {formatAmount(summary.totalBudget, currency)}
              </Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Remaining</Text>
              <Text
                style={[
                  styles.summaryAmount,
                  {color: summary.remaining >= 0 ? Colors.success : Colors.danger},
                ]}>
                {formatAmount(Math.abs(summary.remaining), currency)}
              </Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Over Budget</Text>
              <Text
                style={[
                  styles.summaryAmount,
                  {color: summary.overBudgetCount > 0 ? Colors.danger : Colors.success},
                ]}>
                {summary.overBudgetCount} cat{summary.overBudgetCount !== 1 ? 's' : ''}
              </Text>
            </Card>
          </View>

          {rowsWithSpend.length === 0 ? (
            <EmptyState
              title="No spending data"
              subtitle={`No expenses recorded for ${dayjs(selectedMonth).format('MMMM YYYY')}.`}
            />
          ) : (
            <>
              {/* Bar Chart */}
              {budgetRows.length > 0 && (
                <Card style={styles.chartCard}>
                  <Text style={styles.chartTitle}>Spend vs Budget</Text>
                  {budgetRows.length > 0 ? (
                    <BarChart
                      data={barChartData}
                      width={CHART_WIDTH - Spacing.md * 2}
                      height={200}
                      chartConfig={chartConfig}
                      style={styles.chart}
                      showValuesOnTopOfBars
                      fromZero
                      yAxisLabel=""
                      yAxisSuffix=""
                    />
                  ) : null}
                </Card>
              )}

              {/* Pie Chart */}
              {pieChartData.length > 0 && (
                <Card style={styles.chartCard}>
                  <Text style={styles.chartTitle}>Spend Distribution</Text>
                  <PieChart
                    data={pieChartData}
                    width={CHART_WIDTH - Spacing.md * 2}
                    height={180}
                    chartConfig={chartConfig}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft="16"
                    style={styles.chart}
                    absolute={false}
                  />
                </Card>
              )}

              {/* Category Breakdown */}
              <Card style={styles.breakdownCard}>
                <Text style={styles.chartTitle}>Category Breakdown</Text>
                {rowsWithSpend.map(row => (
                  <View key={row.category.id} style={styles.breakdownRow}>
                    <View style={[styles.catDot, {backgroundColor: row.category.color}]} />
                    <Text style={styles.breakdownName}>{row.category.name}</Text>
                    <Text style={styles.breakdownAmount}>
                      {formatAmount(row.spentAmount, currency)}
                    </Text>
                    <Text style={styles.breakdownPercent}>
                      {summary.totalSpent > 0
                        ? `${Math.round((row.spentAmount / summary.totalSpent) * 100)}%`
                        : '0%'}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  monthArrow: {padding: Spacing.sm},
  monthArrowText: {fontSize: 24, color: Colors.primary, fontWeight: '600'},
  monthLabel: {...Typography.h3, fontSize: 17},
  content: {padding: Spacing.md, paddingBottom: Spacing.xl},
  summaryRow: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md},
  summaryCard: {minWidth: '45%', flex: 1, ...Shadows.sm},
  summaryLabel: {...Typography.caption, marginBottom: 4},
  summaryAmount: {...Typography.h3, fontSize: 14},
  chartCard: {marginBottom: Spacing.md, overflow: 'hidden', ...Shadows.sm},
  chartTitle: {...Typography.h3, fontSize: 15, marginBottom: Spacing.sm},
  chart: {borderRadius: BorderRadius.sm},
  catDot: {width: 10, height: 10, borderRadius: 5, marginRight: Spacing.sm},
  breakdownCard: {marginBottom: Spacing.md, ...Shadows.sm},
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  breakdownName: {...Typography.body, flex: 1},
  breakdownAmount: {...Typography.bodyMedium, marginRight: Spacing.sm},
  breakdownPercent: {...Typography.caption, width: 40, textAlign: 'right'},
});
