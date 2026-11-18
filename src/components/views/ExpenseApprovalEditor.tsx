import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { approvedRows, type ApprovalExpense, type RowAmounts } from '@/lib/expense-approval';
import type { SapVendor } from '@/lib/sap-journal';

export type VendorAllocationForm = { vendor_id: string; amount: string };
export type AccountingRowForm = { has_tax_invoice: boolean; vendor_available: boolean | null; vendor_id: string; vendor_allocations: VendorAllocationForm[]; taxable_amount: string; cgst_amount: string; sgst_amount: string; igst_amount: string };

export default function ExpenseApprovalEditor({ expenses, amounts, onChange, disabled = false, vendors = [], accounting, onAccountingChange, onAddVendor }: {
  expenses: ApprovalExpense[]; amounts: RowAmounts; onChange: (amounts: RowAmounts) => void; disabled?: boolean;
  vendors?: SapVendor[]; accounting?: Record<string, AccountingRowForm>; onAccountingChange?: (rows: Record<string, AccountingRowForm>) => void;
  onAddVendor?: (expenseId: string) => void;
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
  const taxControls = (row: ApprovalExpense) => {
    if (!accounting || !onAccountingChange) return null;
    const value = accounting[row.id] || { has_tax_invoice: false, vendor_available: null, vendor_id: '', vendor_allocations: [], taxable_amount: '', cgst_amount: '', sgst_amount: '', igst_amount: '' };
    const set = (patch: Partial<AccountingRowForm>) => onAccountingChange({ ...accounting, [row.id]: { ...value, ...patch } });
    const moneyInput = (field: 'taxable_amount' | 'cgst_amount' | 'sgst_amount' | 'igst_amount', label: string) => <label className="block space-y-1 text-xs"><span>{label} (Rs.)</span><Input aria-label={`${row.category}: ${label}`} type="number" min="0" step="0.01" value={value[field]} disabled={disabled} onChange={event => set({ [field]: event.target.value })} /></label>;
    return <div className="space-y-2 rounded border border-border bg-muted/20 p-2">
      <label className="flex items-center gap-2 text-sm"><span>Tax invoice</span><select aria-label={`${row.category}: Tax invoice`} className="h-9 rounded-md border border-input bg-background px-2" disabled={disabled} value={String(value.has_tax_invoice)} onChange={event => set({ has_tax_invoice: event.target.value === 'true', vendor_available: null, vendor_id: '' })}><option value="false">No</option><option value="true">Yes</option></select></label>
      {value.has_tax_invoice && <>
        {!row.attachmentIds?.length && <p role="alert" className="text-xs text-destructive">Attach the tax invoice or receipt before verification.</p>}
        <label className="flex items-center gap-2 text-sm"><span>Vendor available in SAP</span><select aria-label={`${row.category}: Vendor available in SAP`} className="h-9 rounded-md border border-input bg-background px-2" disabled={disabled} value={value.vendor_available == null ? '' : String(value.vendor_available)} onChange={event => set({ vendor_available: event.target.value === '' ? null : event.target.value === 'true', vendor_id: '' })}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select></label>
        {value.vendor_available === true && <div className="space-y-3 rounded-md border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Vendor invoice allocations</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ vendor_allocations: [...(value.vendor_allocations || []), { vendor_id: '', amount: '' }] })}>Add vendor</Button><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onAddVendor?.(row.id)}>Add new vendor</Button></div></div>
          {(value.vendor_allocations || []).map((allocation, index) => {
            const chosen = vendors.find(vendor => vendor.id === allocation.vendor_id);
            return <div key={`${row.id}-vendor-${index}`} className="grid gap-2 rounded border p-2 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end">
              <label className="block space-y-1 text-xs"><span>Vendor {index + 1}</span><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={disabled} value={allocation.vendor_id} onChange={event => { const next = [...(value.vendor_allocations || [])]; next[index] = { ...next[index], vendor_id: event.target.value }; set({ vendor_allocations: next, vendor_id: next[0]?.vendor_id || '' }); }}><option value="">Select an active vendor</option>{vendors.filter(vendor => vendor.active).map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.vendor_name} · {vendor.short_form} · {vendor.vendor_account_code}</option>)}</select>{chosen && <span className="block text-muted-foreground">SAP {chosen.vendor_account_code}</span>}</label>
              <label className="block space-y-1 text-xs"><span>Invoice value (Rs.)</span><Input type="number" min="0" step="0.01" value={allocation.amount} disabled={disabled} onChange={event => { const next = [...(value.vendor_allocations || [])]; next[index] = { ...next[index], amount: event.target.value }; set({ vendor_allocations: next }); }} /></label>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { const next = (value.vendor_allocations || []).filter((_, allocationIndex) => allocationIndex !== index); set({ vendor_allocations: next, vendor_id: next[0]?.vendor_id || '' }); }}>Remove</Button>
            </div>;
          })}
          {!(value.vendor_allocations || []).length && <p className="text-xs text-muted-foreground">Add each vendor shown on the attached bills and enter that vendor’s invoice value. Any remaining row amount goes to the expense category GL.</p>}
          <p className="text-xs text-muted-foreground">Allocated to vendors: Rs. {(value.vendor_allocations || []).reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0).toFixed(2)} · Remaining to category GL: Rs. {Math.max(0, Number(amounts[row.id] ?? row.amount) - (value.vendor_allocations || []).reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0)).toFixed(2)}</p>
        </div>}
        {value.vendor_available === false && <div className="grid gap-2 sm:grid-cols-2">{moneyInput('taxable_amount','Taxable value')}{moneyInput('cgst_amount','CGST')}{moneyInput('sgst_amount','SGST')}{moneyInput('igst_amount','IGST')}<p className="col-span-full text-xs text-muted-foreground">Total GST: Rs. {(Number(value.cgst_amount || 0)+Number(value.sgst_amount || 0)+Number(value.igst_amount || 0)).toFixed(2)} · Invoice total: Rs. {(Number(value.taxable_amount || 0)+Number(value.cgst_amount || 0)+Number(value.sgst_amount || 0)+Number(value.igst_amount || 0)).toFixed(2)}</p></div>}
      </>}
    </div>;
  };
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">Review the selected expense rows. Enter a value for each vendor shown on the bills; any remaining amount posts to the expense category GL.</p>
    <div className="space-y-3 sm:hidden">{expenses.map((row, index) => <div key={row.id} className="space-y-2 rounded border border-border bg-card p-3 text-sm">
      <p className="font-semibold">{row.category}</p>
      <p><span className="text-muted-foreground">Project code: </span>{row.projectCode || '-'}</p>
      <p><span className="text-muted-foreground">Claim date: </span>{row.claimDate || '-'}</p>
      <p className="whitespace-pre-wrap break-words"><span className="text-muted-foreground">Description / remarks: </span>{[row.description, row.remarks].filter(Boolean).join('\n') || '-'}</p>
      <p>With bill: Rs. {money(row.amountWithBill)} · Without bill: Rs. {money(row.amountWithoutBill)}</p>
      <p className="text-xs text-muted-foreground">{bills(row)}</p>
      <p className="font-semibold">Submitted: Rs. {money(row.amount)}</p>
      <label className="block space-y-1"><span>Final approved amount (Rs.)</span>{input(row, index, true)}</label>
      {taxControls(row)}
    </div>)}</div>
    <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[1180px] border text-sm">
      <thead><tr className="bg-muted">{['Category', 'Project code', 'Claim date', 'Description / remarks', 'With bill (Rs.)', 'Without bill (Rs.)', 'Bills', 'Submitted total (Rs.)', 'Final approved amount (Rs.)'].map(label => <th key={label} className="border p-2 text-left">{label}</th>)}</tr></thead>
      <tbody>{expenses.map((row, index) => <tr key={row.id}>
        <td className="border p-2">{row.category}</td><td className="border p-2">{row.projectCode || '-'}</td><td className="border p-2">{row.claimDate || '-'}</td>
        <td className="min-w-48 whitespace-pre-wrap break-words border p-2">{[row.description, row.remarks].filter(Boolean).join('\n') || '-'}</td>
        <td className="border p-2 text-right">{money(row.amountWithBill)}</td><td className="border p-2 text-right">{money(row.amountWithoutBill)}</td>
        <td className="border p-2 text-xs">{bills(row)}</td><td className="border p-2 text-right font-medium">{money(row.amount)}</td><td className="border p-2">{input(row, index)}{taxControls(row)}</td>
      </tr>)}</tbody>
      <tfoot><tr className="bg-muted/50 font-semibold"><td colSpan={4} className="border p-2 text-right">TOTAL</td><td className="border p-2 text-right">{sum('amountWithBill')}</td><td className="border p-2 text-right">{sum('amountWithoutBill')}</td><td className="border p-2" /><td className="border p-2 text-right">{sum('amount')}</td><td className="border p-2 text-right">{total}</td></tr></tfoot>
    </table></div>
    <p className="text-right font-semibold">Final total approved (Rs.): <span aria-label="Final total approved">{total}</span></p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
