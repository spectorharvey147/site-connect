import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { approvedRows, initialRowAmounts } from '../lib/expense-approval';
import ExpenseApprovalEditor from '../components/views/ExpenseApprovalEditor';

const expenses = [{ id: 'a', category: 'Travel', amount: 100, approvedAmount: 80 }, { id: 'b', category: 'DA', amount: 50, approvedAmount: 0 }];
describe('Row-wise expense approval', () => {
  it('rejects an excess row even when the overall total is below submitted', () => {
    expect(() => approvedRows(expenses, { a: '100.01', b: '0' })).toThrow('cannot exceed submitted');
    expect(() => approvedRows(expenses, { a: '1000', b: '0' })).toThrow('cannot exceed submitted');
    expect(approvedRows(expenses, { a: '100', b: '50' }).total).toBe(150);
  });
  it('retains all expense details next to the approval column', () => {
    const rows = [{ ...expenses[0], amountWithBill: 70, amountWithoutBill: 30, description: 'Taxi to customer site', remarks: 'Return journey', projectCode: 'P-100', claimDate: '2026-09-22', attachmentIds: ['bill1'] }];
    render(<ExpenseApprovalEditor expenses={rows} amounts={initialRowAmounts(rows)} onChange={() => {}} />);
    for (const heading of ['Description / remarks', 'With bill (Rs.)', 'Without bill (Rs.)', 'Bills', 'Submitted total (Rs.)', 'Final approved amount (Rs.)']) expect(screen.getByRole('columnheader', { name: heading })).toBeInTheDocument();
    expect(screen.getAllByText(/Taxi to customer site/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Return journey/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Expense 1 final approved amount')).toHaveAttribute('max', '100');
    expect(screen.getByLabelText('Expense 1 final approved amount mobile')).toHaveAttribute('max', '100');
  });
  it('retains saved reductions and zero approvals without changing submitted amounts', () => {
    const values = initialRowAmounts(expenses);
    expect(values).toEqual({ a: '80.00', b: '0.00' });
    expect(approvedRows(expenses, values).total).toBe(80);
    expect(expenses.map(row => row.amount)).toEqual([100, 50]);
  });
  it.each(['', ' ', '-1', '0.001', 'NaN', 'Infinity'])('rejects invalid row amount %s', value => {
    expect(() => approvedRows(expenses, { a: value, b: '0' })).toThrow();
  });
  it('requires allocation of a previously reduced total instead of restoring submitted amounts', () => {
    const rows = [{ id: 'a', category: 'Travel', amount: 100 }];
    expect(initialRowAmounts(rows, 80)).toEqual({ a: '' });
    expect(initialRowAmounts(rows, 100)).toEqual({ a: '100.00' });
  });
  it('calculates in cents and requires every row', () => {
    expect(approvedRows(expenses, { a: '0.10', b: '0.20' }).total).toBe(0.3);
    expect(() => approvedRows(expenses, { a: '80' })).toThrow();
  });
  it('updates the displayed approved total when a row is corrected', () => {
    function Editor() {
      const [values, setValues] = useState(initialRowAmounts(expenses));
      return <ExpenseApprovalEditor expenses={expenses} amounts={values} onChange={setValues} />;
    }
    render(<Editor />);
    expect(screen.getByLabelText('Final total approved')).toHaveTextContent('80.00');
    fireEvent.change(screen.getByLabelText('Expense 1 final approved amount'), { target: { value: '60.50' } });
    expect(screen.getByLabelText('Final total approved')).toHaveTextContent('60.50');
    fireEvent.change(screen.getByLabelText('Expense 2 final approved amount'), { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('every expense row');
  });
});
