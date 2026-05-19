import {Expense, Settlement, Member, BalanceSummary} from '../../types';

interface MemberShare {
  memberId: string;
  share: number;
}

function computeMemberShares(expense: Expense, members: Member[]): MemberShare[] {
  const total = expense.amount_minor;

  if (expense.split_type === 'equal') {
    const splitAmount = Math.floor(total / members.length);
    const remainder = total - splitAmount * members.length;
    return members.map((m, i) => ({
      memberId: m.id,
      share: splitAmount + (i === 0 ? remainder : 0),
    }));
  }

  if (expense.split_type === 'fixed_amount') {
    try {
      const payload = JSON.parse(expense.split_payload_json) as Record<string, number>;
      return members.map(m => ({
        memberId: m.id,
        share: payload[m.id] ?? 0,
      }));
    } catch {
      // fallback to equal
      const half = Math.floor(total / 2);
      return members.map((m, i) => ({
        memberId: m.id,
        share: i === 0 ? total - half : half,
      }));
    }
  }

  if (expense.split_type === 'percentage') {
    try {
      const payload = JSON.parse(expense.split_payload_json) as Record<string, number>;
      return members.map(m => ({
        memberId: m.id,
        share: Math.round((total * (payload[m.id] ?? 0)) / 100),
      }));
    } catch {
      const half = Math.floor(total / 2);
      return members.map((m, i) => ({
        memberId: m.id,
        share: i === 0 ? total - half : half,
      }));
    }
  }

  // Default equal
  const half = Math.floor(total / 2);
  return members.map((m, i) => ({
    memberId: m.id,
    share: i === 0 ? total - half : half,
  }));
}

/**
 * Compute balance summary for a given set of expenses and settlements.
 * Identified from perspective of myMemberId.
 */
export function computeBalances(
  expenses: Expense[],
  settlements: Settlement[],
  myMemberId: string,
  partnerMemberId: string,
  members: Member[],
  lastSyncAt: string | null,
): BalanceSummary {
  let totalPaidByMe = 0;
  let totalPaidByPartner = 0;
  let myShare = 0;
  let partnerShare = 0;
  let totalSharedSpend = 0;

  // Each device generates its own UUIDs during setup, so after syncing the
  // members table contains 4 rows (2 per device). Passing all 4 to
  // computeMemberShares would divide equal-split expenses by 4 instead of 2.
  // Build a minimal 2-member list with the correct IDs so the split math
  // always uses the right divisor regardless of DB state.
  const pairMembers: Member[] = [
    {id: myMemberId,      name: '', role: 'A', created_at: '', updated_at: ''},
    {id: partnerMemberId, name: '', role: 'B', created_at: '', updated_at: ''},
  ];

  for (const expense of expenses) {
    if (expense.deleted_at) continue;
    totalSharedSpend += expense.amount_minor;

    const shares = computeMemberShares(expense, pairMembers);
    const myShareForExpense = shares.find(s => s.memberId === myMemberId)?.share ?? 0;
    const partnerShareForExpense = shares.find(s => s.memberId === partnerMemberId)?.share ?? 0;

    myShare += myShareForExpense;
    partnerShare += partnerShareForExpense;

    // Use !== myMemberId rather than === partnerMemberId: synced expenses carry
    // the partner's device-local UUID which may differ from our partnerMemberId
    // placeholder. In a 2-person tracker any expense not paid by me was paid by
    // the partner.
    if (expense.paid_by_member_id === myMemberId) {
      totalPaidByMe += expense.amount_minor;
    } else {
      totalPaidByPartner += expense.amount_minor;
    }
  }

  // net = totalPaidByMe - myShare
  // positive = I should receive (I overpaid)
  // negative = I owe (partner overpaid for me)
  let netBalance = totalPaidByMe - myShare;

  // Apply settlements — same UUID-agnostic logic: settlement not paid by me
  // must have been paid by the partner.
  for (const settlement of settlements) {
    if (settlement.deleted_at) continue;
    if (settlement.paid_by_member_id === myMemberId) {
      // I paid partner → reduces what I owe (increases net toward 0 when negative)
      netBalance += settlement.amount_minor;
    } else {
      // Partner paid me → reduces what they owe me (decreases net toward 0 when positive)
      netBalance -= settlement.amount_minor;
    }
  }

  return {
    totalSharedSpend,
    totalPaidByMe,
    totalPaidByPartner,
    myShare,
    partnerShare,
    netBalance,
    lastSyncAt,
  };
}

/**
 * Format a balance amount as a currency string.
 */
export function formatAmount(amountMinor: number, currency: string = 'CAD'): string {
  const major = amountMinor / 100;
  if (currency === 'INR') {
    return `₹${major.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 2})}`;
  }
  return `${major.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 2})} ${currency}`;
}

export function parseAmountToMinor(amountStr: string): number {
  const cleaned = amountStr.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function formatAmountMajor(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
