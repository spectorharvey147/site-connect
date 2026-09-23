import { Input } from '@/components/ui/input';
import { approvedRows, type ApprovalExpense, type RowAmounts } from '@/lib/expense-approval';

export default function ExpenseApprovalEditor({ expenses, amounts, onChange, disabled = false }: {
  expenses: ApprovalExpense[]; amounts: RowAmounts; onChange: (amounts: RowAmounts) => void; disabled?: boolean;
}) {
  let total = '—', error = '';
  try { total = approvedRows(expenses, amounts).total.toFixed(2); }
  catch (e) { error = e instanceof Error ? e.message : String(e); }
  const money = (value?: number) => Number(value ?? 0).toFixed(2);
  const sum = (field: 'amount' | 'amountWithBill' | 'amountWithoutBill') => money(expenses.reduce((sum, row) => sum + Math.round(Number(row[field] ?? 0) * 100), 0) / 100);
  const input = (row: ApprovalExpense, index: number, mobile = false) => <Input
    aria-label={`Expense ${index + 1} final approved amount${mobile ? ' mobile' : ''}`}
    aria-invalid={Number(amounts[row.id]) > Number(row.amount)} className="min-w-32 text-right"
    type="number" min="0" max={row.amount} step="0.01" disabled={disabled}
    value={amounts[row.id] ?? ''} onChange={e => onChange({ ...amounts, [row.id]: e.target.value })} />;
  const bills = (row: ApprovalExpense) => row.attachmentIds?.length ? `${row.attachmentIds.length} file(s) shown in Attachments` : 'No bill';
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">Correct the final approved amount for each expense. It cannot exceed the submitted row total. Original amounts and details are retained.</p>
    <div className="space-y-3 sm:hidden">{expenses.map((row, index) => <div key={row.id} className="space-y-2 rounded border border-border bg-card p-3 text-sm">
      <p className="font-semibold">{row.category}</p>
      <p><span className="text-muted-foreground">Project code: </span>{row.projectCode || '-'}</p>
      <p><span className="text-muted-foreground">Claim date: </span>{row.claimDate || '-'}</p>
      <p className="whitespace-pre-wrap break-words"><span className="text-muted-foreground">Description / remarks: </span>{[row.description, row.remarks].filter(Boolean).join('\n') || '-'}</p>
      <p>With bill: Rs. {money(row.amountWithBill)} · Without bill: Rs. {money(row.amountWithoutBill)}</p>
      <p className="text-xs text-muted-foreground">{bills(row)}</p>
      <p className="font-semibold">Submitted: Rs. {money(row.amount)}</p>
      <label className="block space-y-1"><span>Final approved amount (Rs.)</span>{input(row, index, true)}</label>
    </div>)}</div>
    <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[1180px] border text-sm">
      <thead><tr className="bg-muted">{['Category', 'Project code', 'Claim date', 'Description / remarks', 'With bill (Rs.)', 'Without bill (Rs.)', 'Bills', 'Submitted total (Rs.)', 'Final approved amount (Rs.)'].map(label => <th key={label} className="border p-2 text-left">{label}</th>)}</tr></thead>
      <tbody>{expenses.map((row, index) => <tr key={row.id}>
        <td className="border p-2">{row.category}</td><td className="border p-2">{row.projectCode || '-'}</td><td className="border p-2">{row.claimDate || '-'}</td>
        <td className="min-w-48 whitespace-pre-wrap break-words border p-2">{[row.description, row.remarks].filter(Boolean).join('\n') || '-'}</td>
        <td className="border p-2 text-right">{money(row.amountWithBill)}</td><td className="border p-2 text-right">{money(row.amountWithoutBill)}</td>
        <td className="border p-2 text-xs">{bills(row)}</td><td className="border p-2 text-right font-medium">{money(row.amount)}</td><td className="border p-2">{input(row, index)}</td>
      </tr>)}</tbody>
      <tfoot><tr className="bg-muted/50 font-semibold"><td colSpan={4} className="border p-2 text-right">TOTAL</td><td className="border p-2 text-right">{sum('amountWithBill')}</td><td className="border p-2 text-right">{sum('amountWithoutBill')}</td><td className="border p-2" /><td className="border p-2 text-right">{sum('amount')}</td><td className="border p-2 text-right">{total}</td></tr></tfoot>
    </table></div>
    <p className="text-right font-semibold">Final total approved (Rs.): <span aria-label="Final total approved">{total}</span></p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
