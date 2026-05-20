import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import {Card, LoadingState, EmptyState, Divider, Button, Input, ProgressBar} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius, Shadows} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {getBudgets, setBudget, getCategorySpend} from '../../../db/repositories/budgetRepository';
import {computeBudgetRows, summarizeBudgets} from '../services/budgetService';
import {formatAmount, parseAmountToMinor, formatAmountMajor} from '../../balances/services/balanceService';
import {BudgetRow} from '../../../types';
import WheelColorPicker from 'react-native-wheel-color-picker';
import Icon from 'react-native-vector-icons/FontAwesome5';
import {createCategory, getAllCategories, deleteCategory, updateCategory} from '../../../db/repositories/categoryRepository';
import {v4 as uuidv4} from 'uuid';

interface Props {
  navigation: any;
}

export const BudgetsScreen: React.FC<Props> = ({navigation}) => {
  const {categories, profile, themeVersion, setCategories} = useAppStore();
  const styles = useMemo(() => makeStyles(), [themeVersion]);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<BudgetRow | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryColor, setEditCategoryColor] = useState('');

  const currency = profile?.currency ?? 'CAD';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const prevMonth = dayjs(selectedMonth).subtract(1, 'month').format('YYYY-MM');
      const [budgets, prevBudgets, spendMap] = await Promise.all([
        getBudgets(selectedMonth),
        getBudgets(prevMonth),
        getCategorySpend(selectedMonth),
      ]);
      const rows = computeBudgetRows(categories, budgets, spendMap, prevBudgets);
      setBudgetRows(rows);
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

  function openEdit(row: BudgetRow) {
    setEditingRow(row);
    setEditAmount(row.hasBudget ? formatAmountMajor(row.budgetAmount) : '');
    setEditCategoryName(row.category.name);
    setEditCategoryColor(row.category.color);
  }

  async function saveCategoryEdits() {
    if (!editingRow) return;
    await updateCategory(editingRow.category.id, {
      name: editCategoryName.trim(),
      color: editCategoryColor,
    });
    // Refresh categories in store
    const updatedCats = await getAllCategories();
    setCategories(updatedCats);
  }

  async function saveEdit() {
    if (!editingRow) return;
    const amount = parseAmountToMinor(editAmount);
    if (amount <= 0) {
      Alert.alert('Invalid', 'Enter a valid budget amount.');
      return;
    }
    setSaving(true);
    try {
      await saveCategoryEdits();
      await setBudget(selectedMonth, editingRow.category.id, amount);

      // Propagate to next month as default if it has no explicit budget yet
      const nextMonth = dayjs(selectedMonth).add(1, 'month').format('YYYY-MM');
      const nextBudgets = await getBudgets(nextMonth);
      const nextHasBudget = nextBudgets.some(
        b => b.category_id === editingRow.category.id && !b.deleted_at,
      );
      if (!nextHasBudget) {
        await setBudget(nextMonth, editingRow.category.id, amount);
      }

      setEditingRow(null);
      setEditAmount('');
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  // Delete category handler
  async function handleDeleteCategory() {
    if (!editingRow) return;
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete the category "${editingRow.category.name}"? This will hide it from all lists, but will not remove any associated expenses.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setSaving(true);
            try {
              await deleteCategory(editingRow.category.id);
              const updatedCats = await getAllCategories();
              setCategories(updatedCats);
              setEditingRow(null);
              await loadData();
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  }

  const createCategoryHandler = async () => {
    const newCategory = await createCategory({
      name: 'New Category',
      color: Colors.primary,
    });
    store.setCategories(await getAllCategories());
  };

  // Add state for new category modal
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Open new category modal
  function openNewCategory() {
    setCreatingCategory(true);
    setEditCategoryName('');
    setEditCategoryColor(Colors.categoryColors[0]);
    setEditAmount('');
    setEditingRow(null);
  }

  // Save new category
  async function saveNewCategory() {
    if (!editCategoryName.trim()) {
      Alert.alert('Required', 'Please enter a category name.');
      return;
    }
    setSaving(true);
    try {
      const newCat = await createCategory(editCategoryName.trim(), editCategoryColor, 'dot');
      const amount = parseAmountToMinor(editAmount);
      if (amount > 0) {
        await setBudget(selectedMonth, newCat.id, amount);
        const nextMonth = dayjs(selectedMonth).add(1, 'month').format('YYYY-MM');
        await setBudget(nextMonth, newCat.id, amount);
      }
      const updatedCats = await getAllCategories();
      setCategories(updatedCats);
      await loadData();
      setCreatingCategory(false);
      setEditCategoryName('');
      setEditCategoryColor(Colors.categoryColors[0]);
      setEditAmount('');
    } finally {
      setSaving(false);
    }
  }

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
        <View style={styles.monthBarRight}>
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
          <TouchableOpacity
            onPress={openNewCategory}
            style={styles.addCategoryBtn}
            accessibilityLabel="Add Category">
            <Icon name="plus" size={14} color={Colors.textOnPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Summary Cards */}
          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Budget</Text>
              <Text style={styles.summaryAmount}>
                {formatAmount(summary.totalBudget, currency)}
              </Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Spent</Text>
              <Text style={[styles.summaryAmount, {color: Colors.danger}]}>
                {formatAmount(summary.totalSpent, currency)}
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
                {summary.remaining < 0 ? ' over' : ''}
              </Text>
            </Card>
          </View>

          {/* Budget Rows */}
          {budgetRows.length === 0 ? (
            <EmptyState title="No categories" subtitle="Add categories in Settings." />
          ) : (
            budgetRows.map(row => (
              <TouchableOpacity key={row.category.id} onPress={() => openEdit(row)} activeOpacity={0.7}>
                <Card style={[styles.budgetCard, row.isOverBudget && styles.overBudgetCard]}>
                  <View style={styles.budgetHeader}>
                    <View style={styles.budgetLeft}>
                      <View style={[styles.catDot, {backgroundColor: row.category.color}]} />
                      <Text style={styles.budgetCatName}>{row.category.name}</Text>
                    </View>
                    <View style={styles.budgetRight}>
                      {row.hasBudget ? (
                        <>
                          <Text style={styles.budgetSpent}>
                            {formatAmount(row.spentAmount, currency)}
                          </Text>
                          <Text style={styles.budgetOf}>
                            {' '}/ {formatAmount(row.budgetAmount, currency)}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.noBudget}>No budget set</Text>
                      )}
                    </View>
                  </View>
                  {row.hasBudget && (
                    <>
                      <View style={styles.progressRow}>
                        <ProgressBar percent={row.percentUsed} />
                        <Text style={styles.percentText}>
                          {Math.round(row.percentUsed)}%
                        </Text>
                      </View>
                      {row.isOverBudget && (
                        <Text style={styles.overBudgetText}>
                          Over budget by {formatAmount(Math.abs(row.remaining), currency)}
                        </Text>
                      )}
                    </>
                  )}
                </Card>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {/* Edit Budget Modal */}
      {editingRow && (
      <Modal
        visible={!!editingRow}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingRow(null)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <View style={[styles.catDot, {backgroundColor: editingRow.category.color}]} />
              <Text style={styles.modalTitle}>{editingRow.category.name}</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Set budget for {dayjs(selectedMonth).format('MMMM YYYY')}
            </Text>
            <Divider style={{marginVertical: Spacing.sm}} />
            <Input
              label="Budget Amount"
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              autoFocus
            />
            {/* Editable category name */}
            <Input
              label="Category Name"
              value={editCategoryName}
              onChangeText={setEditCategoryName}
              style={{marginBottom: Spacing.sm}}
            />
            {/* Color picker */}
            <Text style={[styles.modalSubtitle, {marginBottom: Spacing.xs}]}>Category Color</Text>
            <View style={{height: 220, marginBottom: Spacing.md, justifyContent: 'center', alignItems: 'center'}}>
              <WheelColorPicker
                color={editCategoryColor}
                onColorChangeComplete={setEditCategoryColor}
                thumbStyle={{ borderWidth: 2, borderColor: Colors.primary }}
                sliderHidden={false}
                swatches={false}
                style={{width: 180, height: 180}}
              />
            </View>
            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setEditingRow(null)}
                style={styles.modalBtn}
              />
              <Button
                title="Delete"
                variant="danger"
                onPress={handleDeleteCategory}
                style={[styles.modalBtn, {marginRight: 8}]}
                loading={saving}
              />
              <Button
                title="Save"
                onPress={saveEdit}
                loading={saving}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      )}

      {/* New Category Modal */}
      {creatingCategory && (
        <Modal
          visible={creatingCategory}
          transparent
          animationType="fade"
          onRequestClose={() => setCreatingCategory(false)}>
          <KeyboardAvoidingView
            style={styles.overlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>New Category</Text>
              </View>
              <Text style={styles.modalSubtitle}>Create a new category</Text>
              <Divider style={{marginVertical: Spacing.sm}} />
              <Input
                label="Category Name"
                value={editCategoryName}
                onChangeText={setEditCategoryName}
                style={{marginBottom: Spacing.sm}}
              />
              <Input
                label="Budget Amount (optional)"
                value={editAmount}
                onChangeText={setEditAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                style={{marginBottom: Spacing.sm}}
              />
              <Text style={[styles.modalSubtitle, {marginBottom: Spacing.xs}]}>Category Color</Text>
              <View style={{height: 220, marginBottom: Spacing.md, justifyContent: 'center', alignItems: 'center'}}>
                <WheelColorPicker
                  color={editCategoryColor}
                  onColorChangeComplete={setEditCategoryColor}
                  thumbStyle={{ borderWidth: 2, borderColor: Colors.primary }}
                  sliderHidden={false}
                  swatches={false}
                  style={{width: 180, height: 180}}
                />
              </View>
              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  onPress={() => setCreatingCategory(false)}
                  style={styles.modalBtn}
                />
                <Button
                  title="Save"
                  onPress={saveNewCategory}
                  loading={saving}
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
  monthBarRight: {flexDirection: 'row', alignItems: 'center', gap: Spacing.xs},
  addCategoryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.xs,
  },
  content: {padding: Spacing.md, paddingBottom: Spacing.sm},
  summaryRow: {flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md},
  summaryCard: {flex: 1, ...Shadows.sm},
  summaryLabel: {...Typography.caption, marginBottom: 4},
  summaryAmount: {...Typography.h3, fontSize: 15},
  budgetCard: {marginBottom: Spacing.sm, ...Shadows.sm},
  overBudgetCard: {borderLeftWidth: 3, borderLeftColor: Colors.danger},
  budgetHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm},
  budgetLeft: {flexDirection: 'row', alignItems: 'center', flex: 1},
  catDot: {width: 10, height: 10, borderRadius: 5, marginRight: Spacing.sm},
  budgetCatName: {...Typography.bodyMedium},
  budgetRight: {flexDirection: 'row', alignItems: 'center'},
  budgetSpent: {...Typography.bodyMedium},
  budgetOf: {...Typography.bodySmall},
  noBudget: {...Typography.bodySmall, color: Colors.textMuted},
  progressRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  percentText: {...Typography.caption, width: 35, textAlign: 'right'},
  overBudgetText: {...Typography.caption, color: Colors.danger, marginTop: 4},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  modalHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs},
  modalTitle: {...Typography.h3},
  modalSubtitle: {...Typography.bodySmall},
  modalButtons: {flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm},
  modalBtn: {flex: 1},
  createCategoryBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
