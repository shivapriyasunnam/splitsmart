import {Budget, Category, BudgetRow} from '../../types';

/**
 * Compute budget rows for a given month.
 * spendByCategory is a map of categoryId -> spentAmountMinor
 */
export function computeBudgetRows(
  categories: Category[],
  budgets: Budget[],
  spendByCategory: Record<string, number>,
): BudgetRow[] {
  return categories.map(category => {
    const budget = budgets.find(
      b => b.category_id === category.id && !b.deleted_at,
    );
    const spentAmount = spendByCategory[category.id] ?? 0;
    const budgetAmount = budget?.amount_minor ?? 0;
    const hasBudget = !!budget;

    let remaining = 0;
    let percentUsed = 0;
    if (hasBudget && budgetAmount > 0) {
      remaining = budgetAmount - spentAmount;
      percentUsed = (spentAmount / budgetAmount) * 100;
    }

    return {
      category,
      budgetAmount,
      spentAmount,
      remaining,
      percentUsed,
      isOverBudget: hasBudget && spentAmount > budgetAmount,
      hasBudget,
    };
  });
}

/**
 * Summarize budget status across all categories.
 */
export function summarizeBudgets(rows: BudgetRow[]) {
  const rowsWithBudget = rows.filter(r => r.hasBudget);
  const totalBudget = rowsWithBudget.reduce((sum, r) => sum + r.budgetAmount, 0);
  const totalSpent = rows.reduce((sum, r) => sum + r.spentAmount, 0);
  const remaining = totalBudget - totalSpent;
  const overBudgetCount = rows.filter(r => r.isOverBudget).length;
  return {totalBudget, totalSpent, remaining, overBudgetCount};
}
