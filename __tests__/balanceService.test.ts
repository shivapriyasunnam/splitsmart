import {computeBalances, formatAmount, parseAmountToMinor, formatAmountMajor} from '../src/features/balances/services/balanceService';
import {Expense, Settlement, Member} from '../src/types';

const MY_ID = 'member-a';
const PARTNER_ID = 'member-b';
const members: Member[] = [
  {id: MY_ID, name: 'Alice', role: 'A', created_at: '', updated_at: ''},
  {id: PARTNER_ID, name: 'Bob', role: 'B', created_at: '', updated_at: ''},
];

const makeExpense = (overrides: Partial<Expense>): Expense => ({
  id: 'e1',
  title: 'Test',
  amount_minor: 10000,
  currency: 'USD',
  paid_by_member_id: MY_ID,
  split_type: 'equal',
  split_payload_json: '{}',
  category_id: 'cat1',
  expense_date: '2024-01-15',
  note: null,
  created_by_device_id: 'dev-a',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  deleted_at: null,
  ...overrides,
});

const makeSettlement = (overrides: Partial<Settlement>): Settlement => ({
  id: 's1',
  amount_minor: 5000,
  paid_by_member_id: MY_ID,
  received_by_member_id: PARTNER_ID,
  settlement_date: '2024-01-20',
  note: null,
  created_at: '2024-01-20T10:00:00Z',
  updated_at: '2024-01-20T10:00:00Z',
  deleted_at: null,
  ...overrides,
});

describe('balanceService', () => {
  describe('computeBalances', () => {
    it('returns zero balance when no expenses or settlements', () => {
      const result = computeBalances([], [], MY_ID, PARTNER_ID, members, null);
      expect(result.netBalance).toBe(0);
      expect(result.totalSharedSpend).toBe(0);
    });

    it('computes equal split correctly: I paid 100 → partner owes me 50', () => {
      const expense = makeExpense({amount_minor: 10000, paid_by_member_id: MY_ID, split_type: 'equal'});
      const result = computeBalances([expense], [], MY_ID, PARTNER_ID, members, null);
      // I paid 100, my share is 50 → net = 100 - 50 = 50
      expect(result.netBalance).toBe(5000);
    });

    it('computes equal split: partner paid → I owe partner', () => {
      const expense = makeExpense({amount_minor: 10000, paid_by_member_id: PARTNER_ID, split_type: 'equal'});
      const result = computeBalances([expense], [], MY_ID, PARTNER_ID, members, null);
      // I paid nothing, my share is 50 → net = 0 - 50 = -50
      expect(result.netBalance).toBe(-5000);
    });

    it('handles fixed_amount split', () => {
      const expense = makeExpense({
        amount_minor: 10000,
        paid_by_member_id: MY_ID,
        split_type: 'fixed_amount',
        // MY_ID gets 3000, PARTNER gets 7000
        split_payload_json: JSON.stringify({[MY_ID]: 3000, [PARTNER_ID]: 7000}),
      });
      const result = computeBalances([expense], [], MY_ID, PARTNER_ID, members, null);
      // I paid 100, my share is 30 → net = 100 - 30 = 70
      expect(result.netBalance).toBe(7000);
    });

    it('applies settlement to reduce balance', () => {
      const expense = makeExpense({amount_minor: 10000, paid_by_member_id: MY_ID, split_type: 'equal'});
      // partner pays me 50 (clearing the debt)
      const settlement = makeSettlement({amount_minor: 5000, paid_by_member_id: PARTNER_ID, received_by_member_id: MY_ID});
      const result = computeBalances([expense], [settlement], MY_ID, PARTNER_ID, members, null);
      expect(result.netBalance).toBe(0);
    });

    it('ignores deleted expenses', () => {
      const deleted = makeExpense({deleted_at: '2024-01-16T00:00:00Z', amount_minor: 10000, split_type: 'equal', paid_by_member_id: MY_ID});
      const result = computeBalances([deleted], [], MY_ID, PARTNER_ID, members, null);
      expect(result.netBalance).toBe(0);
      expect(result.totalSharedSpend).toBe(0);
    });

    it('ignores deleted settlements', () => {
      const expense = makeExpense({amount_minor: 10000, paid_by_member_id: MY_ID, split_type: 'equal'});
      const deletedSettlement = makeSettlement({deleted_at: '2024-01-21T00:00:00Z', amount_minor: 5000, paid_by_member_id: PARTNER_ID, received_by_member_id: MY_ID});
      const result = computeBalances([expense], [deletedSettlement], MY_ID, PARTNER_ID, members, null);
      expect(result.netBalance).toBe(5000); // settlement not applied
    });

    it('computes totalPaidByMe and totalPaidByPartner correctly', () => {
      const e1 = makeExpense({id: 'e1', amount_minor: 6000, paid_by_member_id: MY_ID, split_type: 'equal'});
      const e2 = makeExpense({id: 'e2', amount_minor: 4000, paid_by_member_id: PARTNER_ID, split_type: 'equal'});
      const result = computeBalances([e1, e2], [], MY_ID, PARTNER_ID, members, null);
      expect(result.totalPaidByMe).toBe(6000);
      expect(result.totalPaidByPartner).toBe(4000);
      expect(result.totalSharedSpend).toBe(10000);
    });
  });

  describe('formatAmount', () => {
    it('formats minor units to INR by default', () => {
      const result = formatAmount(10000);
      expect(result).toContain('100');
    });

    it('returns a string', () => {
      expect(typeof formatAmount(5000)).toBe('string');
    });
  });

  describe('parseAmountToMinor', () => {
    it('converts decimal string to minor units', () => {
      expect(parseAmountToMinor('100.00')).toBe(10000);
      expect(parseAmountToMinor('5.50')).toBe(550);
      expect(parseAmountToMinor('0.01')).toBe(1);
    });

    it('handles integer strings', () => {
      expect(parseAmountToMinor('100')).toBe(10000);
    });
  });

  describe('formatAmountMajor', () => {
    it('returns decimal string from minor units', () => {
      expect(formatAmountMajor(10000)).toBe('100.00');
      expect(formatAmountMajor(550)).toBe('5.50');
    });
  });
});
