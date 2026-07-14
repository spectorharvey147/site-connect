export interface ClaimExpenseRuleInput {
  claimDate: string;
  amountWithBill: number;
  amountWithoutBill: number;
}

export function localIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeExpenseDate(value: string) {
  return String(value || '').trim().slice(0, 10);
}

export function expenseAmountInCents(expense: Pick<ClaimExpenseRuleInput, 'amountWithBill' | 'amountWithoutBill'>) {
  return Math.round(((Number(expense.amountWithBill) || 0) + (Number(expense.amountWithoutBill) || 0)) * 100);
}

export function expenseFingerprint(expense: ClaimExpenseRuleInput) {
  return `${normalizeExpenseDate(expense.claimDate)}|${expenseAmountInCents(expense)}`;
}

export function findFutureExpenseIndex(expenses: ClaimExpenseRuleInput[], today = localIsoDate()) {
  return expenses.findIndex((expense) => normalizeExpenseDate(expense.claimDate) > today);
}

export function findDuplicateExpensePair(expenses: ClaimExpenseRuleInput[]) {
  const seen = new Map<string, number>();
  for (let index = 0; index < expenses.length; index += 1) {
    const expense = expenses[index];
    const date = normalizeExpenseDate(expense.claimDate);
    const cents = expenseAmountInCents(expense);
    if (!date || cents <= 0) continue;
    const fingerprint = expenseFingerprint(expense);
    const firstIndex = seen.get(fingerprint);
    if (firstIndex != null) return { firstIndex, duplicateIndex: index };
    seen.set(fingerprint, index);
  }
  return null;
}
