import { type AccountingRowForm } from './ExpenseApprovalEditor';
import { initialRowAmounts, approvedRows, type ApprovalExpense, type RowAmounts } from '@/lib/expense-approval';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, CreditCard, Eye, Loader2, RefreshCw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { approveClaimAsAccounts, getAccountsClaims, getClaimById, markClaimPaid } from '@/lib/claims-api';
import { getActiveVendors, saveVendorGstMaster } from '@/lib/accounting-api';
import type { SapVendor } from '@/lib/sap-journal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveOverlay } from '@/components/ui/responsive-overlay';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import ClaimApprovalTimeline from '@/components/views/ClaimApprovalTimeline';
import ClaimDetailsOverview from '@/components/views/ClaimDetailsOverview';
import ClaimAttachmentsSection from '@/components/views/ClaimAttachmentsSection';

function formatCurrency(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date?: string) {
  return date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}

type AccountingExpense = ApprovalExpense & {
  hasTaxInvoice?: boolean | null;
  vendorAvailable?: boolean | null;
  vendorId?: string | null;
  vendorAllocations?: Array<{ vendor_id: string; vendor_account_code_snapshot?: string; vendor_short_form_snapshot?: string; amount: number }>;
  taxableAmount?: number | null;
  cgstAmount?: number | null;
  sgstAmount?: number | null;
  igstAmount?: number | null;
};

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === 'accounts verified') return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Accounts Verified</Badge>;
  if (normalized === 'payment processing' || normalized === 'accounts processing') return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Payment Processing</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Accounts Verification</Badge>;
}

function ClaimExpenseDetails({ claim, selectedIds, onToggle }: { claim: any; selectedIds?: string[]; onToggle?: (id: string) => void }) {
  if (!claim?.expenses?.length) return null;

  return (
    <>
      <div className="block space-y-2 sm:hidden">
        {claim.expenses.map((expense: any, index: number) => (
          <div key={index} className="space-y-1 rounded border border-border bg-card p-3 text-sm">
            {onToggle && <div className="mb-2 flex items-center gap-2 border-b border-border pb-2"><Checkbox checked={selectedIds?.includes(expense.id)} onCheckedChange={() => onToggle(expense.id)} aria-label={`Select ${expense.category} for accounts review`} /><span className="text-xs font-medium">Select for accounts review</span></div>}
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Category</span><span className="text-right font-medium">{expense.category}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Code</span><span className="text-right">{expense.projectCode || '-'}</span></div>
            {expense.claimDate && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Date</span><span className="text-right">{formatDate(expense.claimDate)}</span></div>}
            {expense.description && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Description</span><span className="max-w-[60%] break-words text-right">{expense.description}</span></div>}
            {expense.attachmentIds?.length > 0 && (
              <div className="mt-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Bills</span>
                <p className="mt-1 text-xs font-medium text-primary">{expense.attachmentIds.length} file(s) shown in Attachments</p>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-primary">{formatCurrency(expense.amount)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden max-w-full overflow-x-auto sm:block">
        <table className={`w-full ${onToggle ? 'min-w-[1080px]' : 'min-w-[980px]'} table-fixed border text-sm`}>
          <thead>
            <tr className="bg-muted">
              <th className={`${onToggle ? 'w-[12%]' : 'w-[13%]'} border p-2 text-left`}>Category</th>
              <th className={`${onToggle ? 'w-[11%]' : 'w-[12%]'} border p-2 text-left`}>Code</th>
              <th className="w-[10%] border p-2 text-left whitespace-nowrap">Date</th>
              <th className={`${onToggle ? 'w-[20%]' : 'w-[21%]'} border p-2 text-left`}>Description</th>
              <th className={`${onToggle ? 'w-[12%]' : 'w-[13%]'} border p-2 text-right text-xs leading-tight`}><span className="whitespace-nowrap">With Bill<br />(Rs.)</span></th>
              <th className={`${onToggle ? 'w-[12%]' : 'w-[13%]'} border p-2 text-right text-xs leading-tight`}><span className="whitespace-nowrap">Without Bill<br />(Rs.)</span></th>
              <th className="w-[8%] border p-2 text-center whitespace-nowrap">Bills</th>
              {onToggle && <th className="w-[6%] border p-2 text-center whitespace-nowrap">Select</th>}
              <th className={`${onToggle ? 'w-[9%]' : 'w-[10%]'} border p-2 text-right text-xs leading-tight`}><span className="whitespace-nowrap">Total<br />(Rs.)</span></th>
            </tr>
          </thead>
          <tbody>
            {claim.expenses.map((expense: any, index: number) => (
              <tr key={index} className="border-t">
                <td className="break-words border p-2">{expense.category}</td>
                <td className="break-words border p-2">{expense.projectCode || '-'}</td>
                <td className="border p-2">{formatDate(expense.claimDate)}</td>
                <td className="break-words border p-2">{expense.description || '-'}</td>
                <td className="whitespace-nowrap border p-2 text-right tabular-nums">{formatCurrency(expense.amountWithBill)}</td>
                <td className="whitespace-nowrap border p-2 text-right tabular-nums">{formatCurrency(expense.amountWithoutBill)}</td>
                <td className="border p-2">
                  {expense.attachmentIds?.length > 0 ? (
                    <span className="text-xs font-medium text-primary">{expense.attachmentIds.length} file(s)</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No bill</span>
                  )}
                </td>
                {onToggle && <td className="border p-2 text-center"><Checkbox checked={selectedIds?.includes(expense.id)} onCheckedChange={() => onToggle(expense.id)} aria-label={`Select ${expense.category} for accounts review`} /></td>}
                <td className="whitespace-nowrap border p-2 text-right font-medium tabular-nums">{formatCurrency(expense.amount)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-bold">
              <td colSpan={4} className="border p-2 text-right">TOTAL</td>
              <td className="whitespace-nowrap border p-2 text-right tabular-nums">{formatCurrency(claim.totalWithBill)}</td>
              <td className="whitespace-nowrap border p-2 text-right tabular-nums">{formatCurrency(claim.totalWithoutBill)}</td>
              <td className="border p-2"></td>
              {onToggle && <td className="border p-2"></td>}
              <td className="whitespace-nowrap border p-2 text-right tabular-nums">{formatCurrency(claim.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function AccountsExpenseCorrection({ expenses, amounts, onAmountsChange, accounting, onAccountingChange, vendors, disabled, onAddVendor, hasClaimAttachments }: {
  expenses: AccountingExpense[]; amounts: RowAmounts; onAmountsChange: (rows: RowAmounts) => void;
  accounting: Record<string, AccountingRowForm>; onAccountingChange: (rows: Record<string, AccountingRowForm>) => void;
  vendors: SapVendor[]; disabled: boolean; onAddVendor: (expenseId: string) => void; hasClaimAttachments: boolean;
}) {
  const fallback = (): AccountingRowForm => ({ has_tax_invoice: false, vendor_available: null, vendor_id: '', vendor_allocations: [], taxable_amount: '', cgst_amount: '', sgst_amount: '', igst_amount: '' });
  const update = (expenseId: string, patch: Partial<AccountingRowForm>) => {
    onAccountingChange({ ...accounting, [expenseId]: { ...fallback(), ...accounting[expenseId], ...patch } });
  };
  const vendorAllocations = (expense: AccountingExpense) => {
    const row = { ...fallback(), ...accounting[expense.id] };
    const allocations = row.vendor_allocations || [];
    const amount = Number(amounts[expense.id] ?? expense.approvedAmount ?? expense.amount ?? 0);
    const allocated = allocations.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return <div className="min-w-[320px] space-y-2">
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => update(expense.id, { vendor_allocations: [...allocations, { vendor_id: '', amount: '' }] })}>Add vendor row</Button><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onAddVendor(expense.id)}>Add new vendor</Button></div>
      {allocations.map((allocation, index) => <div key={`${expense.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-center gap-2">
        <select aria-label={`${expense.category}: Vendor ${index + 1}`} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs" disabled={disabled} value={allocation.vendor_id} onChange={(event) => { const next = [...allocations]; next[index] = { ...next[index], vendor_id: event.target.value }; update(expense.id, { vendor_id: next[0]?.vendor_id || '', vendor_allocations: next }); }}><option value="">Select vendor</option>{vendors.filter((vendor) => vendor.active).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.vendor_name} · {vendor.vendor_account_code}</option>)}</select>
        <Input aria-label={`${expense.category}: Vendor invoice value ${index + 1}`} type="number" min="0" step="0.01" placeholder="Invoice value" value={allocation.amount} disabled={disabled} onChange={(event) => { const next = [...allocations]; next[index] = { ...next[index], amount: event.target.value }; update(expense.id, { vendor_allocations: next }); }} />
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { const next = allocations.filter((_, itemIndex) => itemIndex !== index); update(expense.id, { vendor_id: next[0]?.vendor_id || '', vendor_allocations: next }); }}>Remove</Button>
      </div>)}
      <p className="text-xs text-muted-foreground">Vendors {formatCurrency(allocated)} · Remaining to category GL {formatCurrency(Math.max(0, amount - allocated))}</p>
    </div>;
  };
  const invoiceFallback = (expense: AccountingExpense) => {
    const row = { ...fallback(), ...accounting[expense.id] };
    const set = (patch: Partial<AccountingRowForm>) => update(expense.id, patch);
    return <div className="min-w-[250px] space-y-2">
      <label className="block space-y-1 text-xs"><span>Tax invoice</span><select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" disabled={disabled} value={String(row.has_tax_invoice)} onChange={(event) => set({ has_tax_invoice: event.target.value === 'true', vendor_available: null, vendor_id: '', vendor_allocations: [] })}><option value="false">No</option><option value="true">Yes</option></select></label>
      {row.has_tax_invoice && <>
        {!expense.attachmentIds?.length && hasClaimAttachments && <p className="text-xs text-muted-foreground">No separate file is attached to this row. Review the combined bill PDF in Attachments above; a separate upload is not required.</p>}
        {!expense.attachmentIds?.length && !hasClaimAttachments && <p role="alert" className="text-xs text-destructive">No bill is attached to this row or claim.</p>}
        <label className="block space-y-1 text-xs"><span>Vendor available in SAP</span><select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" disabled={disabled} value={row.vendor_available == null ? '' : String(row.vendor_available)} onChange={(event) => set({ vendor_available: event.target.value === '' ? null : event.target.value === 'true', vendor_id: '', vendor_allocations: event.target.value === 'true' ? row.vendor_allocations : [] })}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select></label>
        {row.vendor_available === false && <div className="grid grid-cols-2 gap-2">{(['taxable_amount','cgst_amount','sgst_amount','igst_amount'] as const).map((field) => <label key={field} className="space-y-1 text-xs"><span>{({ taxable_amount: 'Taxable value', cgst_amount: 'CGST', sgst_amount: 'SGST', igst_amount: 'IGST' })[field]} (Rs.)</span><Input aria-label={`${expense.category}: ${field}`} type="number" min="0" step="0.01" disabled={disabled} value={row[field]} onChange={(event) => set({ [field]: event.target.value })} /></label>)}</div>}
      </>}
    </div>;
  };
  return <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full min-w-[1160px] table-fixed text-sm">
      <thead className="bg-muted/60"><tr><th className="w-[26%] p-3 text-left">Expense details</th><th className="w-[14%] p-3 text-right">Approved row value</th><th className="w-[24%] p-3 text-left">Invoice checks</th><th className="w-[36%] p-3 text-left">Vendor invoices / GL balance</th></tr></thead>
      <tbody>{expenses.map((expense) => <tr key={expense.id} className="align-top border-t border-border">
        <td className="p-3 align-top"><p className="font-semibold break-words">{expense.category}</p><p className="text-xs text-muted-foreground">{expense.projectCode || '-'} · {formatDate(expense.claimDate)}</p><p className="mt-1 whitespace-pre-wrap break-words">{expense.description || 'No description'}</p><p className="mt-2 text-xs text-primary">{expense.attachmentIds?.length ? `${expense.attachmentIds.length} bill file(s)` : 'No bill attached'}</p></td>
        <td className="p-3 align-top"><Input aria-label={`${expense.category}: Approved row value`} type="number" min="0" max={expense.amount} step="0.01" disabled={disabled} value={amounts[expense.id] ?? ''} onChange={(event) => onAmountsChange({ ...amounts, [expense.id]: event.target.value })} /><p className="mt-1 whitespace-nowrap text-right text-xs text-muted-foreground">Submitted {formatCurrency(expense.amount)}</p></td>
        <td className="p-3 align-top">{invoiceFallback(expense)}</td>
        <td className="p-3 align-top">{accounting[expense.id]?.has_tax_invoice && accounting[expense.id]?.vendor_available === true ? vendorAllocations(expense) : accounting[expense.id]?.has_tax_invoice && accounting[expense.id]?.vendor_available === false ? <p className="text-xs text-muted-foreground">Enter taxable value and GST in the invoice checks.</p> : <p className="text-xs text-muted-foreground">Full row amount posts to the expense category GL.</p>}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function ClaimDetailsPanel({ claim, selectedIds, onToggle }: { claim: any; selectedIds?: string[]; onToggle?: (id: string) => void }) {
  if (!claim) return null;

  return (
    <div className="space-y-4 text-sm">
      <ClaimDetailsOverview claim={claim} />

      <ClaimAttachmentsSection claim={claim} />

      <ClaimApprovalTimeline claim={claim} />

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <h4 className="mb-3 text-sm font-semibold">Expense Details</h4>
        <ClaimExpenseDetails claim={claim} selectedIds={selectedIds} onToggle={onToggle} />
      </div>
    </div>
  );
}

export default function AccountsProcessingView() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [viewClaim, setViewClaim] = useState<any>(null);
  const [verifyClaim, setVerifyClaim] = useState<any>(null);
  const [payClaim, setPayClaim] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [rowAmounts, setRowAmounts] = useState<RowAmounts>({});
  const [accountingRows, setAccountingRows] = useState<Record<string, AccountingRowForm>>({});
  const [selectedAccountingIds, setSelectedAccountingIds] = useState<string[]>([]);
  const [accountingPopupOpen, setAccountingPopupOpen] = useState(false);
  const [vendors, setVendors] = useState<SapVendor[]>([]);
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [newVendorExpenseId, setNewVendorExpenseId] = useState('');
  const [newVendor, setNewVendor] = useState({ vendor_name: '', short_form: '', vendor_account_code: '' });
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [selectedPayIds, setSelectedPayIds] = useState<string[]>([]);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkReference, setBulkReference] = useState('');
  const [bulkNote, setBulkNote] = useState('');

  const loadClaims = async () => {
    setLoading(true);
    try {
      const rows = await getAccountsClaims();
      setClaims(rows);
      const eligibleIds = new Set(rows
        .filter((claim) => ['payment processing', 'accounts processing'].includes(String(claim.status || '').toLowerCase()))
        .map((claim) => claim.claimIdInternal || claim.claimId));
      setSelectedPayIds((current) => current.filter((id) => eligibleIds.has(id)));
    } catch (error: any) {
      toast.error(error.message || 'Failed to load accounts claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadClaims();
  }, []);

  const accountsVerification = useMemo(() => claims.filter((claim) => ['accounts verification', 'sent to accounts'].includes(String(claim.status || '').toLowerCase())), [claims]);
  const processingClaims = useMemo(() => claims.filter((claim) => ['payment processing', 'accounts processing'].includes(String(claim.status || '').toLowerCase())), [claims]);
  const selectedPaySet = useMemo(() => new Set(selectedPayIds), [selectedPayIds]);
  const selectedPayClaims = useMemo(() => processingClaims.filter((claim) => selectedPaySet.has(claim.claimIdInternal || claim.claimId)), [processingClaims, selectedPaySet]);
  const selectedPayTotal = useMemo(() => selectedPayClaims.reduce((sum, claim) => sum + Number(claim.verifiedAmount ?? claim.amount ?? 0), 0), [selectedPayClaims]);
  const allProcessingSelected = processingClaims.length > 0 && processingClaims.every((claim) => selectedPaySet.has(claim.claimIdInternal || claim.claimId));

  const togglePayClaim = (claimId: string) => {
    setSelectedPayIds((current) => current.includes(claimId) ? current.filter((id) => id !== claimId) : [...current, claimId]);
  };

  const toggleAllProcessing = (checked: boolean) => {
    setSelectedPayIds(checked ? processingClaims.map((claim) => claim.claimIdInternal || claim.claimId) : []);
  };

  const openVerify = async (claim: any) => {
    const fallbackClaim = { ...claim, status: claim.status || 'Accounts Verification' };
    setVerifyClaim(fallbackClaim);
    setRowAmounts({});
    setAccountingRows({});
      setSelectedAccountingIds([]);
      setAccountingPopupOpen(false);
    setAmount(String((claim.verifiedAmount ?? claim.amount ?? 0).toFixed(2)));
    setNote('');
    try {
      const [details, activeVendors] = await Promise.all([getClaimById(claim.claimIdInternal || claim.claimId), getActiveVendors()]);
      setVendors(activeVendors);
      if (details) {
        const expenses = (details.expenses || []) as unknown as AccountingExpense[];
        setVerifyClaim(details); setRowAmounts(initialRowAmounts(expenses, details.verifiedAmount));
        setAccountingRows(Object.fromEntries(expenses.map((expense) => {
          const savedAllocations = (expense.vendorAllocations || []) as Array<{ vendor_id: string; amount: number }>;
          const allocations = savedAllocations.length
            ? savedAllocations.map((entry) => ({ vendor_id: entry.vendor_id, amount: String(entry.amount) }))
            : expense.vendorId ? [{ vendor_id: expense.vendorId, amount: String(expense.approvedAmount ?? expense.amount ?? '') }] : [];
          return [expense.id, {
          has_tax_invoice: expense.hasTaxInvoice === true, vendor_available: expense.vendorAvailable ?? null, vendor_id: expense.vendorId || '',
          vendor_allocations: allocations,
          taxable_amount: expense.taxableAmount == null ? '' : String(expense.taxableAmount), cgst_amount: expense.cgstAmount == null ? '' : String(expense.cgstAmount),
          sgst_amount: expense.sgstAmount == null ? '' : String(expense.sgstAmount), igst_amount: expense.igstAmount == null ? '' : String(expense.igstAmount),
        }];
        })));
        setSelectedAccountingIds(expenses.filter((expense) => expense.hasTaxInvoice === true).map((expense) => expense.id));
      }
    } catch (error: any) {
      toast.error(error.message || 'Unable to load claim details');
    }
  };

  const toggleAccountingExpense = (expenseId: string) => {
    setSelectedAccountingIds((current) => current.includes(expenseId) ? current.filter((id) => id !== expenseId) : [...current, expenseId]);
  };

  const openAddVendor = (expenseId: string) => {
    setNewVendorExpenseId(expenseId);
    setNewVendor({ vendor_name: '', short_form: '', vendor_account_code: '' });
    setNewVendorOpen(true);
  };

  const handleSaveNewVendor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProcessing(true);
    try {
      await saveVendorGstMaster('vendor', '', newVendor);
      const refreshed = await getActiveVendors();
      setVendors(refreshed);
      const created = refreshed.find((vendor) => vendor.vendor_name.toLowerCase() === newVendor.vendor_name.trim().toLowerCase());
      if (!created) throw new Error('Vendor was saved but could not be loaded. Refresh and try again.');
      setAccountingRows((current) => {
        const row = current[newVendorExpenseId] || { has_tax_invoice: true, vendor_available: true, vendor_id: '', vendor_allocations: [], taxable_amount: '', cgst_amount: '', sgst_amount: '', igst_amount: '' };
        const allocations = [...row.vendor_allocations];
        const blankIndex = allocations.findIndex((allocation) => !allocation.vendor_id);
        if (blankIndex >= 0) allocations[blankIndex] = { ...allocations[blankIndex], vendor_id: created.id };
        else allocations.push({ vendor_id: created.id, amount: '' });
        return { ...current, [newVendorExpenseId]: { ...row, has_tax_invoice: true, vendor_available: true, vendor_id: allocations[0]?.vendor_id || '', vendor_allocations: allocations } };
      });
      setNewVendorOpen(false);
      toast.success('Vendor added and selected');
    } catch (error: any) {
      toast.error(error.message || 'Could not add vendor');
    } finally {
      setProcessing(false);
    }
  };

  const openPay = async (claim: any) => {
    const fallbackClaim = { ...claim, status: claim.status || 'Payment Processing' };
    setPayClaim(fallbackClaim);
    setAmount(String((claim.verifiedAmount ?? claim.amount ?? 0).toFixed(2)));
    setReference('');
    setNote('');
    try {
      const details = await getClaimById(claim.claimIdInternal || claim.claimId);
      if (details) setPayClaim(details);
    } catch (error: any) {
      toast.error(error.message || 'Unable to load claim details');
    }
  };

  const handleView = async (claim: any) => {
    try {
      setViewClaim(await getClaimById(claim.claimIdInternal || claim.claimId));
    } catch (error: any) {
      toast.error(error.message || 'Unable to open claim details');
    }
  };

  const handleVerify = async () => {
    if (!verifyClaim || !user) return;
    let approved;
    try { approved = approvedRows(verifyClaim.expenses || [], rowAmounts); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); return; }
    const value = approved.total;
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a valid accounts verified amount');
      return;
    }
    let accountingPayload: Array<AccountingRowForm & { id: string }>;
    try {
      accountingPayload = (verifyClaim.expenses as AccountingExpense[] || []).map((expense) => {
        const row = { ...(accountingRows[expense.id] || { has_tax_invoice: false, vendor_available: null, vendor_id: '', vendor_allocations: [], taxable_amount: '', cgst_amount: '', sgst_amount: '', igst_amount: '' }) };
        const claimHasAttachments = Boolean(verifyClaim.fileIds?.length || verifyClaim.generalFileIds?.length || (verifyClaim.expenses || []).some((item: AccountingExpense) => item.attachmentIds?.length));
        if (row.has_tax_invoice && !expense.attachmentIds?.length && !claimHasAttachments) throw new Error(`${expense.category}: attach the invoice or receipt before verification.`);
        if (row.has_tax_invoice && row.vendor_available == null) throw new Error(`${expense.category}: choose whether the vendor is available in SAP.`);
        if (row.has_tax_invoice && row.vendor_available) {
          if (!row.vendor_allocations?.length) throw new Error(`${expense.category}: add at least one vendor allocation.`);
          const approvedCents = Math.round(Number(approved.rows.find((item) => item.id === expense.id)?.amount || 0) * 100);
          const seenVendorIds = new Set<string>();
          const allocations = row.vendor_allocations.map((allocation, index) => {
            if (!allocation.vendor_id) throw new Error(`${expense.category}: select a vendor for allocation ${index + 1}.`);
            if (seenVendorIds.has(allocation.vendor_id)) throw new Error(`${expense.category}: each vendor can appear only once.`);
            seenVendorIds.add(allocation.vendor_id);
            const value = Number(allocation.amount);
            if (!allocation.amount.trim() || !Number.isFinite(value) || value <= 0 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw new Error(`${expense.category}: enter a positive vendor invoice value with at most two decimals.`);
            return { ...allocation, amount: String(value) };
          });
          const allocationCents = allocations.reduce((sum, allocation) => sum + Math.round(Number(allocation.amount) * 100), 0);
          if (allocationCents > approvedCents) throw new Error(`${expense.category}: vendor allocations exceed the approved row amount.`);
          row.vendor_id = allocations[0].vendor_id;
          row.vendor_allocations = allocations;
        }
        if (row.has_tax_invoice && row.vendor_available === false) {
          const cents = (input: string, label: string, optional = false) => {
            if (!input.trim() && optional) return 0;
            if (!input.trim()) throw new Error(`${expense.category}: enter ${label}.`);
            const number = Number(input);
            if (!Number.isFinite(number) || number < 0 || Math.abs(number * 100 - Math.round(number * 100)) > 0.000001) throw new Error(`${expense.category}: ${label} must be a non-negative amount with at most two decimals.`);
            return Math.round(number * 100);
          };
          const taxable = cents(row.taxable_amount,'taxable value');
          const cgst = cents(row.cgst_amount,'CGST',true), sgst = cents(row.sgst_amount,'SGST',true), igst = cents(row.igst_amount,'IGST',true);
          if (igst > 0 && (cgst > 0 || sgst > 0)) throw new Error(`${expense.category}: IGST cannot be combined with CGST or SGST.`);
          const approvedCents = Math.round(Number(approved.rows.find((item) => item.id === expense.id)?.amount || 0) * 100);
          if (taxable + cgst + sgst + igst !== approvedCents) throw new Error(`${expense.category}: taxable value plus GST must equal the approved amount.`);
        }
        return { id: expense.id, ...row };
      });
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); return; }
    setProcessing(true);
    try {
      await approveClaimAsAccounts(verifyClaim.claimIdInternal || verifyClaim.claimId, user.email, note, value, Object.fromEntries(approved.rows.map(row => [row.id, row.amount])), accountingPayload);
      toast.success('Claim moved to payment processing');
      setVerifyClaim(null);
      await loadClaims();
    } catch (error: any) {
      toast.error(error.message || 'Failed to verify claim');
    } finally {
      setProcessing(false);
    }
  };

  const handlePaid = async () => {
    if (!payClaim || !user) return;
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      toast.error('Enter a valid paid amount');
      return;
    }
    setProcessing(true);
    try {
      await markClaimPaid(payClaim.claimIdInternal || payClaim.claimId, user.email, value, reference, note);
      toast.success('Claim marked paid');
      setPayClaim(null);
      await loadClaims();
    } catch (error: any) {
      toast.error(error.message || 'Failed to mark paid');
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkPaid = async () => {
    if (!user || selectedPayClaims.length === 0) return;
    setProcessing(true);
    const failedIds: string[] = [];
    let completed = 0;
    for (const claim of selectedPayClaims) {
      const claimId = claim.claimIdInternal || claim.claimId;
      const paidAmount = Number(claim.verifiedAmount ?? claim.amount ?? 0);
      if (!claimId || !Number.isFinite(paidAmount) || paidAmount <= 0) {
        failedIds.push(claimId);
        continue;
      }
      try {
        await markClaimPaid(claimId, user.email, paidAmount, bulkReference.trim(), bulkNote.trim());
        completed += 1;
      } catch (error) {
        console.error(`Failed to mark ${claim.claimId || claimId} paid:`, error);
        failedIds.push(claimId);
      }
    }

    if (completed > 0) toast.success(`${completed} claim${completed === 1 ? '' : 's'} marked paid`);
    if (failedIds.length > 0) toast.error(`${failedIds.length} claim${failedIds.length === 1 ? '' : 's'} could not be updated and remain selected`);
    setSelectedPayIds(failedIds);
    if (failedIds.length === 0) {
      setBulkPayOpen(false);
      setBulkReference('');
      setBulkNote('');
    }
    await loadClaims();
    setProcessing(false);
  };

  const ClaimTable = ({ rows, mode }: { rows: any[]; mode: 'verify' | 'pay' }) => (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {mode === 'pay' ? (
              <th className="w-12 p-3 text-center"><Checkbox checked={allProcessingSelected} onCheckedChange={(checked) => toggleAllProcessing(Boolean(checked))} aria-label="Select all payment-processing claims" /></th>
            ) : null}
            <th className="p-3 text-left">Claim ID</th>
            <th className="p-3 text-left">Date</th>
            <th className="p-3 text-left">User</th>
            <th className="p-3 text-left">Site</th>
            <th className="p-3 text-right">Approved Amount</th>
            <th className="p-3 text-center">Status</th>
            <th className="p-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <tr key={index} className="border-t border-border">
                {Array.from({ length: mode === 'pay' ? 8 : 7 }).map((__, cell) => <td key={cell} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={mode === 'pay' ? 8 : 7} className="p-8 text-center text-muted-foreground">No claims in this stage</td></tr>
          ) : rows.map((claim) => (
            <tr key={claim.claimIdInternal || claim.claimId} className="border-t border-border hover:bg-muted/30">
              {mode === 'pay' ? (
                <td className="p-3 text-center"><Checkbox checked={selectedPaySet.has(claim.claimIdInternal || claim.claimId)} onCheckedChange={() => togglePayClaim(claim.claimIdInternal || claim.claimId)} aria-label={`Select ${claim.claimId}`} /></td>
              ) : null}
              <td className="p-3 font-mono text-xs">{claim.claimId}</td>
              <td className="p-3">{formatDate(claim.date)}</td>
              <td className="p-3">{claim.submittedBy}</td>
              <td className="p-3">{claim.site}</td>
              <td className="p-3 text-right font-bold text-primary">{formatCurrency(claim.verifiedAmount ?? claim.amount)}</td>
              <td className="p-3 text-center"><StatusBadge status={claim.status} /></td>
              <td className="p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => handleView(claim)}><Eye className="h-4 w-4" /></Button>
                {mode === 'verify' ? (
                  <Button variant="ghost" size="sm" className="text-success" onClick={() => void openVerify(claim)}><CheckCircle2 className="h-4 w-4" /></Button>
                ) : (
                  <Button variant="ghost" size="sm" className="text-success" onClick={() => void openPay(claim)}><CreditCard className="h-4 w-4" /></Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
      <div className="glass-card flex items-center justify-between p-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold"><CreditCard className="h-5 w-5" /> Accounts Processing</h2>
          <p className="text-sm text-muted-foreground">Verify final approved claims, then mark SAP-exported claims as paid.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadClaims}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
      </div>

      <section className="glass-card p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Accounts Verification</h3>
        <ClaimTable rows={accountsVerification} mode="verify" />
      </section>

      <section className="glass-card p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Payment Processing</h3>
            <p className="mt-1 text-xs text-muted-foreground">{selectedPayIds.length} selected · {formatCurrency(selectedPayTotal)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => toggleAllProcessing(!allProcessingSelected)} disabled={processingClaims.length === 0}>
              {allProcessingSelected ? 'Clear Selection' : 'Select All'}
            </Button>
            <Button type="button" size="sm" className="gradient-success text-success-foreground" onClick={() => setBulkPayOpen(true)} disabled={selectedPayIds.length === 0 || processing}>
              <WalletCards className="mr-2 h-4 w-4" />Mark Selected Paid
            </Button>
          </div>
        </div>
        <ClaimTable rows={processingClaims} mode="pay" />
      </section>

      <ResponsiveOverlay
        open={!!verifyClaim}
        onOpenChange={(open) => !open && setVerifyClaim(null)}
        title={`Accounts Verify - ${verifyClaim?.claimId || ''}`}
        desktopClassName="max-w-7xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[74vh] overflow-y-auto pr-1"
        footer={verifyClaim ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => setAccountingPopupOpen(true)} disabled={processing || selectedAccountingIds.length === 0}>Proceed to expense correction ({selectedAccountingIds.length})</Button>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setVerifyClaim(null)}>Cancel</Button>
            <Button onClick={handleVerify} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Verify & Process
            </Button>
            </div>
          </div>
        ) : undefined}
      >
        <div className="space-y-3">
          <ClaimDetailsPanel claim={verifyClaim} selectedIds={selectedAccountingIds} onToggle={toggleAccountingExpense} />
          <p className="text-sm text-muted-foreground">Select expense rows that include tax invoices. The selected rows open together for vendor and invoice amount correction; any unallocated remainder stays on the expense category GL.</p>
          <div><Label>Accounts Note</Label><Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional verification note" /></div>
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={accountingPopupOpen}
        onOpenChange={setAccountingPopupOpen}
        title={`Expense correction · ${selectedAccountingIds.length} selected`}
        description="Enter the invoice and vendor details for the selected expense rows. Any remaining row value posts to its category GL."
        desktopClassName="max-w-7xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[70vh] overflow-y-auto pr-1"
        footer={<div className="flex justify-end"><Button variant="outline" onClick={() => setAccountingPopupOpen(false)}>Done</Button></div>}
      >
        <AccountsExpenseCorrection
          expenses={(verifyClaim?.expenses || []).filter((expense: AccountingExpense) => selectedAccountingIds.includes(expense.id))}
          amounts={rowAmounts}
          onAmountsChange={setRowAmounts}
          disabled={processing}
          vendors={vendors}
          accounting={accountingRows}
          onAccountingChange={setAccountingRows}
          onAddVendor={openAddVendor}
          hasClaimAttachments={Boolean(verifyClaim?.fileIds?.length || verifyClaim?.generalFileIds?.length || (verifyClaim?.expenses || []).some((expense: AccountingExpense) => expense.attachmentIds?.length))}
        />
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={newVendorOpen}
        onOpenChange={(open) => !processing && setNewVendorOpen(open)}
        title="Add new vendor"
        description="Create a vendor record for this invoice and select it on the expense row."
        desktopClassName="max-w-lg"
        mobileClassName="max-h-[90svh]"
        footer={null}
      >
        <form className="space-y-3" onSubmit={handleSaveNewVendor}>
          <div><Label htmlFor="accounts-vendor-name">Vendor name</Label><Input id="accounts-vendor-name" required value={newVendor.vendor_name} onChange={(event) => setNewVendor((current) => ({ ...current, vendor_name: event.target.value }))} /></div>
          <div><Label htmlFor="accounts-vendor-short-form">Short name</Label><Input id="accounts-vendor-short-form" required value={newVendor.short_form} onChange={(event) => setNewVendor((current) => ({ ...current, short_form: event.target.value }))} /></div>
          <div><Label htmlFor="accounts-vendor-code">SAP vendor account code</Label><Input id="accounts-vendor-code" required value={newVendor.vendor_account_code} onChange={(event) => setNewVendor((current) => ({ ...current, vendor_account_code: event.target.value }))} /></div>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setNewVendorOpen(false)} disabled={processing}>Cancel</Button><Button type="submit" disabled={processing}>{processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save vendor</Button></div>
        </form>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={bulkPayOpen}
        onOpenChange={(open) => {
          if (!processing) setBulkPayOpen(open);
        }}
        title={`Mark ${selectedPayClaims.length} Claims Paid`}
        desktopClassName="max-w-3xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[72vh] overflow-y-auto pr-1"
        footer={bulkPayOpen ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setBulkPayOpen(false)} disabled={processing}>Cancel</Button>
            <Button className="gradient-success text-success-foreground" onClick={handleBulkPaid} disabled={processing || selectedPayClaims.length === 0}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WalletCards className="mr-2 h-4 w-4" />}
              Confirm & Mark All Paid
            </Button>
          </div>
        ) : undefined}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Selected Claims</p><p className="mt-1 text-xl font-bold">{selectedPayClaims.length}</p></div>
            <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Total Paid Amount</p><p className="mt-1 text-xl font-bold text-success">{formatCurrency(selectedPayTotal)}</p></div>
          </div>
          <div className="rounded-lg border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
            Each claim will be paid using its own accounts-approved amount. Ledger, payment status and audit information will be updated separately for every claim.
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 bg-card"><tr className="bg-muted/50"><th className="p-2 text-left">Claim</th><th className="p-2 text-left">Employee</th><th className="p-2 text-right">Paid Amount</th></tr></thead>
              <tbody>{selectedPayClaims.map((claim) => <tr key={claim.claimIdInternal || claim.claimId} className="border-t border-border"><td className="p-2 font-mono text-xs">{claim.claimId}</td><td className="p-2">{claim.submittedBy}</td><td className="p-2 text-right font-semibold">{formatCurrency(claim.verifiedAmount ?? claim.amount)}</td></tr>)}</tbody>
            </table>
          </div>
          <div><Label>Shared Payment Reference</Label><Input value={bulkReference} onChange={(event) => setBulkReference(event.target.value)} placeholder="UTR / cheque / cash reference applied to all selected claims" /></div>
          <div><Label>Shared Payment Note</Label><Textarea rows={3} value={bulkNote} onChange={(event) => setBulkNote(event.target.value)} placeholder="Optional note applied to all selected claims" /></div>
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={!!payClaim}
        onOpenChange={(open) => !open && setPayClaim(null)}
        title={`Mark Paid - ${payClaim?.claimId || ''}`}
        desktopClassName="max-w-5xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[74vh] overflow-y-auto pr-1"
        footer={payClaim ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPayClaim(null)}>Cancel</Button>
            <Button className="gradient-success text-success-foreground" onClick={handlePaid} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Mark Paid
            </Button>
          </div>
        ) : undefined}
      >
        <div className="space-y-3">
          <ClaimDetailsPanel claim={payClaim} />
          <div><Label>Paid Amount</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div><Label>Payment Reference</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR / cheque / cash reference" /></div>
          <div><Label>Payment Note</Label><Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional payment note" /></div>
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={!!viewClaim}
        onOpenChange={(open) => !open && setViewClaim(null)}
        title={`Claim Details - ${viewClaim?.claimId || ''}`}
        desktopClassName="max-w-5xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[75vh] overflow-y-auto"
      >
        {viewClaim && <ClaimDetailsPanel claim={viewClaim} />}
      </ResponsiveOverlay>
    </div>
  );
}
