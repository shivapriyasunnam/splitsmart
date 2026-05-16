import {computeBudgetRows, summarizeBudgets} from '../src/features/budgets/services/budgetService';
import {Category, Budget} from '../src/types';

const makeCategory = (id: string, name: string): Category => ({
  id,
  name,
  icon: '🛒',
  color: '#000',
  is_default: true,
  is_archived: false,
  created_at: '',
  updated_at: '',
});

const makeBudget = (categoryId: string, limitAmount: number): Budget => ({
  id: `budget-${categoryId}`,
  category_id: categoryId,
  amount_minor: limitAmount,
  month_key: '2024-01',
  created_at: '',
  updated_at: '',
  deleted_at: null,
});

describe('budgetService', () => {
  describe('computeBudgetRows', () => {
    it('returns empty array for no categories', () => {
      expect(computeBudgetRows([], [], {})).toEqual([]);
    });

    it('returns rows for categories with no budget as unset', () => {
      const cats = [makeCategory('cat1', 'Groceries')];
      const rows = computeBudgetRows(cats, [], {});
      expect(rows).toHaveLength(1);
      expect(rows[0].budgetAmount).toBe(0);
      expect(rows[0].hasBudget).toBe(false);
      expect(rows[0].spentAmount).toBe(0);
    });

    it('fills in spend from spendByCategory', () => {
      const cats = [makeCategory('cat1', 'Groceries')];
      const budgets = [makeBudget('cat1', 50000)];
      const rows = computeBudgetRows(cats, budgets, {'cat1': 30000});
      expect(rows[0].spentAmount).toBe(30000);
      expect(rows[0].budgetAmount).toBe(50000);
      expect(rows[0].remaining).toBe(20000);
    });

    it('marks over-budget rows correctly', () => {
      const cats = [makeCategory('cat1', 'Groceries')];
      const budgets = [makeBudget('cat1', 20000)];
      const rows = computeBudgetRows(cats, budgets, {'cat1': 25000});
      expect(rows[0].isOverBudget).toBe(true);
      expect(rows[0].remaining).toBe(-5000);
    });

    it('marks percentUsed above 80% for near-limit spend', () => {
      const cats = [makeCategory('cat1', 'Groceries')];
      const budgets = [makeBudget('cat1', 10000)];
      const rows = computeBudgetRows(cats, budgets, {'cat1': 8500});
      expect(rows[0].percentUsed).toBeGreaterThanOrEqual(80);
    });

    it('marks percentUsed below 80% for low spend', () => {
      const cats = [makeCategory('cat1', 'Groceries')];
      const budgets = [makeBudget('cat1', 10000)];
      const rows = computeBudgetRows(cats, budgets, {'cat1': 5000});
      expect(rows[0].percentUsed).toBe(50);
    });

    it('skips deleted budgets', () => {
      const cats = [makeCategory('cat1', 'Groceries')];
      const deletedBudget = {...makeBudget('cat1', 50000), deleted_at: '2024-01-31T00:00:00Z'};
      const rows = computeBudgetRows(cats, [deletedBudget], {'cat1': 30000});
      expect(rows[0].hasBudget).toBe(false);
    });
  });

  describe('summarizeBudgets', () => {
    it('returns zeros for empty rows', () => {
      const summary = summarizeBudgets([]);
      expect(summary.totalBudget).toBe(0);
      expect(summary.totalSpent).toBe(0);
      expect(summary.remaining).toBe(0);
      expect(summary.overBudgetCount).toBe(0);
    });

    it('sums up budgeted rows correctly', () => {
      const cats = [makeCategory('cat1', 'G'), makeCategory('cat2', 'T')];
      const budgets = [makeBudget('cat1', 50000), makeBudget('cat2', 30000)];
      const rows = computeBudgetRows(cats, budgets, {'cat1': 20000, 'cat2': 35000});
      const summary = summarizeBudgets(rows);
      expect(summary.totalBudget).toBe(80000);
      expect(summary.totalSpent).toBe(55000);
      expect(summary.overBudgetCount).toBe(1);
    });

    it('excludes unset-budget categories from totalBudget', () => {
      const cats = [makeCategory('cat1', 'G'), makeCategory('cat2', 'Misc')];
      const budgets = [makeBudget('cat1', 50000)]; // cat2 has no budget
      const rows = computeBudgetRows(cats, budgets, {'cat1': 20000, 'cat2': 10000});
      const summary = summarizeBudgets(rows);
      expect(summary.totalBudget).toBe(50000); // only cat1
    });
  });
});
