import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import FontAwesome from 'react-native-vector-icons/FontAwesome5';
import dayjs from 'dayjs';
import {Card, EmptyState, LoadingState, Button} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius, Shadows} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {getExpenses, softDeleteExpense, getMonthlyTotal} from '../../../db/repositories/expenseRepository';
import {Expense, Category} from '../../../types';
import {formatAmount} from '../../balances/services/balanceService';

interface Props {
  navigation: any;
}

export const ExpensesScreen: React.FC<Props> = ({navigation}) => {
  const {categories, myMember, partnerMember, profile} = useAppStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));
  const [monthlyTotal, setMonthlyTotal] = useState(0);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getExpenses({
        monthKey: selectedMonth,
      });
      setExpenses(data);
      const total = await getMonthlyTotal(selectedMonth);
      setMonthlyTotal(total);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadExpenses);
    loadExpenses();
    return unsubscribe;
  }, [navigation, loadExpenses]);

  function getPrevMonth() {
    setSelectedMonth(dayjs(selectedMonth).subtract(1, 'month').format('YYYY-MM'));
  }

  function getNextMonth() {
    const next = dayjs(selectedMonth).add(1, 'month');
    if (next.isAfter(dayjs(), 'month')) return;
    setSelectedMonth(next.format('YYYY-MM'));
  }

  function getCategoryById(id: string): Category | undefined {
    return categories.find(c => c.id === id);
  }

  function getMemberName(id: string): string {
    if (id === myMember?.id) return profile?.myName ?? 'Me';
    if (id === partnerMember?.id) return profile?.partnerName ?? 'Partner';
    return 'Unknown';
  }

  function confirmDelete(expense: Expense) {
    Alert.alert('Delete Expense', `Delete "${expense.title}"?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await softDeleteExpense(expense.id);
          loadExpenses();
        },
      },
    ]);
  }

  const renderExpense = ({item}: {item: Expense}) => {
    const cat = getCategoryById(item.category_id);
    const isMe = item.paid_by_member_id === myMember?.id;
    return (
      <TouchableOpacity
        style={styles.expenseRow}
        onPress={() => navigation.navigate('EditExpense', {expenseId: item.id})}
        onLongPress={() => confirmDelete(item)}
        activeOpacity={0.7}>
        <View style={[styles.catDot, {backgroundColor: cat?.color ?? Colors.border}]} />
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.expenseMeta}>
            {cat?.name ?? 'Uncategorized'} · {getMemberName(item.paid_by_member_id)} ·{' '}
            {dayjs(item.expense_date).format('D MMM')}
          </Text>
        </View>
        <View style={styles.expenseRight}>
          <Text style={[styles.expenseAmount, isMe && styles.myAmount]}>
            {formatAmount(item.amount_minor, item.currency)}
          </Text>
          {isMe && <Text style={styles.youPaidBadge}>You paid</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const isCurrentMonth = dayjs(selectedMonth).isSame(dayjs(), 'month');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Month Selector */}
      <View style={styles.monthBar}>
        <TouchableOpacity onPress={getPrevMonth} style={styles.monthArrow}>
          <Text style={styles.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {dayjs(selectedMonth).format('MMMM YYYY')}
        </Text>
        <TouchableOpacity
          onPress={getNextMonth}
          style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
          disabled={isCurrentMonth}>
          <Text style={[styles.monthArrowText, isCurrentMonth && {color: Colors.textMuted}]}>
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* Monthly Total */}
      <Card style={styles.totalCard} padded={false}>
        <View style={styles.totalContent}>
          <Text style={styles.totalLabel}>Total this month</Text>
          <Text style={styles.totalAmount}>
            {formatAmount(monthlyTotal, profile?.currency ?? 'CAD')}
          </Text>
        </View>
      </Card>

      {/* Expense List */}
      {loading ? (
        <LoadingState />
      ) : expenses.length === 0 ? (
        <EmptyState
          title="No expenses"
          subtitle={`No expenses recorded for ${dayjs(selectedMonth).format('MMMM YYYY')}.`}
          action={
            <Button
              title="Add Expense"
              size="sm"
              onPress={() => navigation.navigate('AddExpense')}
            />
          }
        />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={e => e.id}
          renderItem={renderExpense}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddExpense')}
        activeOpacity={0.85}>
        <FontAwesome name="plus" size={22} color={Colors.textOnPrimary} />
      </TouchableOpacity>
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
  monthArrowDisabled: {opacity: 0.3},
  monthArrowText: {fontSize: 24, color: Colors.primary, fontWeight: '600'},
  monthLabel: {...Typography.h3, fontSize: 17},
  filterRow: {paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.xs},
  totalCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    marginTop: Spacing.sm,
    ...Shadows.md,
  },
  totalContent: {
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {fontSize: 14, color: Colors.textOnPrimaryMuted, fontWeight: '500'},
  totalAmount: {fontSize: 22, fontWeight: '700', color: Colors.textOnPrimary},
  list: {paddingHorizontal: Spacing.md, paddingBottom: 100},
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  catDot: {width: 10, height: 10, borderRadius: 5, marginRight: Spacing.sm},
  expenseInfo: {flex: 1},
  expenseTitle: {...Typography.bodyMedium},
  expenseMeta: {...Typography.caption, marginTop: 2},
  expenseRight: {alignItems: 'flex-end'},
  expenseAmount: {...Typography.bodyMedium, color: Colors.text},
  myAmount: {color: Colors.primary},
  youPaidBadge: {fontSize: 10, color: Colors.primary, fontWeight: '600', marginTop: 2},
  separator: {height: Spacing.xs},
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.lg,
  },
});
