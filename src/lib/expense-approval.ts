import { moneyCents } from './sap-journal';

export interface ApprovalExpense {
  id: string;
  category: string;
  projectCode?: string;
  claimDate?: string;
  description?: string;
  remarks?: string;
  amountWithBill?: number;
  amountWithoutBill?: number;
  attachmentIds?: string[];
  amount: number;
  approvedAmount?: number | null;
}
export type RowAmounts = Record<string, string>;
export function initialRowAmounts(expenses: ApprovalExpense[], previousTotal?: number | null): RowAmounts {
  // Older approvals may have a reduced total with no allocation to individual rows.
  // Require an explicit allocation instead of silently restoring submitted amounts.
  if (previousTotal != null && expenses.every(row => row.approvedAmount == null)
    && expenses.reduce((sum, row) => sum + moneyCents(row.amount), 0) !== moneyCents(previousTotal)) {
    return Object.fromEntries(expenses.map(row => [row.id, '']));
  }
  return Object.fromEntries(expenses.map(row => [row.id, Number(row.approvedAmount ?? row.amount).toFixed(2)]));
}
export function approvedRows(expenses: ApprovalExpense[], amounts: RowAmounts) {
  if (!expenses.length || expenses.some(row => !row.id) || new Set(expenses.map(row => row.id)).size !== expenses.length) throw new Error('Reload the expense rows before approving.');
  const rows = expenses.map(row => {
    const value = amounts[row.id];
    if (value == null || !value.trim()) throw new Error('Enter a final approved amount for every expense row.');
    const cents = moneyCents(value);
    if (cents > moneyCents(row.amount)) throw new Error(`${row.category}: approved amount cannot exceed submitted amount Rs. ${Number(row.amount).toFixed(2)}.`);
    return { id: row.id, amount: cents / 100 };
  });
  const total = rows.reduce((sum, row) => sum + moneyCents(row.amount), 0) / 100;
  return { rows, total };
}
