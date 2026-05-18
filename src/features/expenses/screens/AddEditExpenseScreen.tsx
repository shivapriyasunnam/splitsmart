import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import {Button, Input, Card, Divider} from '../../../components';
import {Colors, Typography, Spacing, BorderRadius} from '../../../app/theme';
import {useAppStore} from '../../../app/providers/store';
import {createExpense, getExpenseById, updateExpense} from '../../../db/repositories/expenseRepository';
import {getCategoryRules} from '../../../db/repositories/categoryRepository';
import {matchCategory} from '../../categories/services/categorizationService';
import {parseAmountToMinor, formatAmountMajor} from '../../balances/services/balanceService';
import {Expense, Category, CategoryRule} from '../../../types';

interface Props {
  navigation: any;
  route: any;
}

export const AddEditExpenseScreen: React.FC<Props> = ({navigation, route}) => {
  const expenseId: string | undefined = route.params?.expenseId;
  const isEdit = !!expenseId;

  const {categories, myMember, partnerMember, profile} = useAppStore();

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [categoryId, setCategoryId] = useState<string>('');
  const [paidByMemberId, setPaidByMemberId] = useState<string>(myMember?.id ?? '');
  const [splitType, setSplitType] = useState<'equal' | 'fixed_amount' | 'percentage'>('equal');
  const [categoryManuallyEdited, setCategoryManuallyEdited] = useState(false);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadRules();
    if (expenseId) {
      loadExpense();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId]);

  async function loadRules() {
    const r = await getCategoryRules();
    setRules(r);
  }

  async function loadExpense() {
    const expense = await getExpenseById(expenseId!);
    if (!expense) return;
    setTitle(expense.title);
    setNote(expense.note ?? '');
    setAmount(formatAmountMajor(expense.amount_minor));
    setExpenseDate(expense.expense_date);
    setCategoryId(expense.category_id);
    setPaidByMemberId(expense.paid_by_member_id);
    setSplitType(expense.split_type);
    setCategoryManuallyEdited(true); // Don't auto-override when editing
  }

  // Auto-categorize on title/note change, unless category was manually set
  function handleTitleChange(text: string) {
    setTitle(text);
    if (!categoryManuallyEdited) {
      const matched = matchCategory(text, note || null, rules);
      if (matched) setCategoryId(matched);
    }
  }

  function handleNoteChange(text: string) {
    setNote(text);
    if (!categoryManuallyEdited) {
      const matched = matchCategory(title, text || null, rules);
      if (matched) setCategoryId(matched);
    }
  }

  function handleCategorySelect(id: string) {
    setCategoryId(id);
    setCategoryManuallyEdited(true);
    setShowCategoryPicker(false);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (!amount.trim() || parseAmountToMinor(amount) <= 0) errs.amount = 'Enter a valid amount';
    if (!categoryId) errs.category = 'Category is required';
    if (!paidByMemberId) errs.paidBy = 'Select who paid';
    if (!expenseDate) errs.date = 'Date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setLoading(true);
    try {
      const amountMinor = parseAmountToMinor(amount);
      const data = {
        title: title.trim(),
        note: note.trim() || null,
        amount_minor: amountMinor,
        currency: profile?.currency ?? 'CAD',
        expense_date: expenseDate,
        category_id: categoryId,
        paid_by_member_id: paidByMemberId,
        split_type: splitType,
        split_payload_json: '{}',
      };

      if (isEdit) {
        await updateExpense(expenseId!, data);
      } else {
        await createExpense(data);
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to save expense.');
    } finally {
      setLoading(false);
    }
  }

  const selectedCategory = categories.find(c => c.id === categoryId);
  const members = [myMember, partnerMember].filter(Boolean);

  // Date helpers
  const dateOptions: string[] = [];
  for (let i = 0; i < 30; i++) {
    dateOptions.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Input
          label="Title *"
          value={title}
          onChangeText={handleTitleChange}
          placeholder="What was this for?"
          error={errors.title}
          autoFocus={!isEdit}
        />

        <Input
          label="Amount *"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          error={errors.amount}
        />

        <Input
          label="Note (optional)"
          value={note}
          onChangeText={handleNoteChange}
          placeholder="Additional details..."
          multiline
          numberOfLines={2}
        />

        {/* Date */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Date *</Text>
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setShowDatePicker(true)}>
            <Text style={styles.selectorText}>
              {dayjs(expenseDate).format('D MMMM YYYY')}
            </Text>
            <Text style={styles.selectorChevron}>▼</Text>
          </TouchableOpacity>
          {errors.date ? <Text style={styles.errorText}>{errors.date}</Text> : null}
        </View>

        {/* Category */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Category *</Text>
          <TouchableOpacity
            style={[styles.selector, selectedCategory && {borderColor: selectedCategory.color}]}
            onPress={() => setShowCategoryPicker(true)}>
            {selectedCategory ? (
              <View style={styles.catRow}>
                <View style={[styles.catDot, {backgroundColor: selectedCategory.color}]} />
                <Text style={styles.selectorText}>{selectedCategory.name}</Text>
              </View>
            ) : (
              <Text style={styles.selectorPlaceholder}>Select category</Text>
            )}
            <Text style={styles.selectorChevron}>▼</Text>
          </TouchableOpacity>
          {errors.category ? <Text style={styles.errorText}>{errors.category}</Text> : null}
          {!categoryManuallyEdited && selectedCategory ? (
            <Text style={styles.autoSuggest}>Auto-suggested · tap to change</Text>
          ) : null}
        </View>

        {/* Paid By */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Paid By *</Text>
          <View style={styles.memberRow}>
            {members.map(m => m && (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.memberChip,
                  paidByMemberId === m.id && styles.memberChipSelected,
                ]}
                onPress={() => setPaidByMemberId(m.id)}>
                <Text
                  style={[
                    styles.memberChipText,
                    paidByMemberId === m.id && styles.memberChipTextSelected,
                  ]}>
                  {m.role === profile?.myRole ? profile?.myName : profile?.partnerName}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.paidBy ? <Text style={styles.errorText}>{errors.paidBy}</Text> : null}
        </View>

        {/* Split Type */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Split Type</Text>
          <View style={styles.memberRow}>
            {(['equal', 'fixed_amount', 'percentage'] as const).map(st => (
              <TouchableOpacity
                key={st}
                style={[styles.memberChip, splitType === st && styles.memberChipSelected]}
                onPress={() => setSplitType(st)}>
                <Text
                  style={[
                    styles.memberChipText,
                    splitType === st && styles.memberChipTextSelected,
                  ]}>
                  {st === 'equal' ? 'Equal' : st === 'fixed_amount' ? 'Fixed' : '%'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Button
          title={isEdit ? 'Update Expense' : 'Add Expense'}
          onPress={handleSave}
          loading={loading}
          style={styles.saveBtn}
        />
      </ScrollView>

      {/* Category Picker Modal */}
      <Modal visible={showCategoryPicker} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <Divider />
            <FlatList
              data={categories}
              keyExtractor={c => c.id}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.categoryOption}
                  onPress={() => handleCategorySelect(item.id)}>
                  <View style={[styles.catDot, {backgroundColor: item.color}]} />
                  <Text style={styles.categoryOptionText}>{item.name}</Text>
                  {categoryId === item.id && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              )}
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setShowCategoryPicker(false)}
              style={{marginTop: Spacing.sm}}
            />
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Date</Text>
            <Divider />
            <FlatList
              data={dateOptions}
              keyExtractor={d => d}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.categoryOption}
                  onPress={() => {
                    setExpenseDate(item);
                    setShowDatePicker(false);
                  }}>
                  <Text style={styles.categoryOptionText}>
                    {dayjs(item).format('dddd, D MMMM YYYY')}
                  </Text>
                  {expenseDate === item && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              )}
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setShowDatePicker(false)}
              style={{marginTop: Spacing.sm}}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  content: {padding: Spacing.md, paddingBottom: Spacing.xl},
  fieldGroup: {marginBottom: Spacing.md},
  fieldLabel: {...Typography.label, marginBottom: Spacing.xs},
  selector: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {fontSize: 15, color: Colors.text},
  selectorPlaceholder: {fontSize: 15, color: Colors.textMuted},
  selectorChevron: {fontSize: 12, color: Colors.textMuted},
  catRow: {flexDirection: 'row', alignItems: 'center'},
  catDot: {width: 10, height: 10, borderRadius: 5, marginRight: Spacing.sm},
  autoSuggest: {...Typography.caption, color: Colors.primary, marginTop: 4},
  memberRow: {flexDirection: 'row', gap: Spacing.sm},
  memberChip: {flex: 1, paddingVertical: 10, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center'},
  memberChipSelected: {backgroundColor: Colors.primary, borderColor: Colors.primary},
  memberChipText: {...Typography.bodyMedium},
  memberChipTextSelected: {color: Colors.textOnPrimary},
  errorText: {...Typography.caption, color: Colors.danger, marginTop: 4},
  saveBtn: {marginTop: Spacing.md},
  modal: {flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay},
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: '70%',
  },
  modalTitle: {...Typography.h3, marginBottom: Spacing.sm},
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  categoryOptionText: {...Typography.body, flex: 1, marginLeft: Spacing.sm},
  checkmark: {fontSize: 16, color: Colors.primary, fontWeight: '700'},
});
