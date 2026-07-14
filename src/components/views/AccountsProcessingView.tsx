import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Eye, Loader2, RefreshCw, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { approveClaimAsAccounts, getAccountsClaims, getClaimById, markClaimPaid } from '@/lib/claims-api';
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

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === 'accounts verified') return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Accounts Verified</Badge>;
  if (normalized === 'payment processing' || normalized === 'accounts processing') return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Payment Processing</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Accounts Verification</Badge>;
}

function ClaimExpenseDetails({ claim }: { claim: any }) {
  if (!claim?.expenses?.length) return null;

  return (
    <>
      <div className="block space-y-2 sm:hidden">
        {claim.expenses.map((expense: any, index: number) => (
          <div key={index} className="space-y-1 rounded border border-border bg-card p-3 text-sm">
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
        <table className="min-w-[980px] w-full table-fixed border text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="w-[14%] border p-2 text-left">Category</th>
              <th className="w-[14%] border p-2 text-left">Code</th>
              <th className="w-[12%] border p-2 text-left">Date</th>
              <th className="w-[24%] border p-2 text-left">Description</th>
              <th className="border p-2 text-right">With Bill (Rs.)</th>
              <th className="border p-2 text-right">Without Bill (Rs.)</th>
              <th className="w-[14%] border p-2 text-left">Bills</th>
              <th className="border p-2 text-right">Total (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {claim.expenses.map((expense: any, index: number) => (
              <tr key={index} className="border-t">
                <td className="break-words border p-2">{expense.category}</td>
                <td className="break-words border p-2">{expense.projectCode || '-'}</td>
                <td className="border p-2">{formatDate(expense.claimDate)}</td>
                <td className="break-words border p-2">{expense.description || '-'}</td>
                <td className="border p-2 text-right">{formatCurrency(expense.amountWithBill)}</td>
                <td className="border p-2 text-right">{formatCurrency(expense.amountWithoutBill)}</td>
                <td className="border p-2">
                  {expense.attachmentIds?.length > 0 ? (
                    <span className="text-xs font-medium text-primary">{expense.attachmentIds.length} file(s)</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No bill</span>
                  )}
                </td>
                <td className="border p-2 text-right font-medium">{formatCurrency(expense.amount)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-bold">
              <td colSpan={4} className="border p-2 text-right">TOTAL</td>
              <td className="border p-2 text-right">{formatCurrency(claim.totalWithBill)}</td>
              <td className="border p-2 text-right">{formatCurrency(claim.totalWithoutBill)}</td>
              <td className="border p-2"></td>
              <td className="border p-2 text-right">{formatCurrency(claim.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function ClaimDetailsPanel({ claim }: { claim: any }) {
  if (!claim) return null;

  return (
    <div className="space-y-4 text-sm">
      <ClaimDetailsOverview claim={claim} />

      <ClaimAttachmentsSection claim={claim} />

      <ClaimApprovalTimeline claim={claim} />

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <h4 className="mb-3 text-sm font-semibold">Expense Details</h4>
        <ClaimExpenseDetails claim={claim} />
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
    setAmount(String((claim.verifiedAmount ?? claim.amount ?? 0).toFixed(2)));
    setNote('');
    try {
      const details = await getClaimById(claim.claimIdInternal || claim.claimId);
      if (details) setVerifyClaim(details);
    } catch (error: any) {
      toast.error(error.message || 'Unable to load claim details');
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
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value < 0) {
      toast.error('Enter a valid accounts verified amount');
      return;
    }
    setProcessing(true);
    try {
      await approveClaimAsAccounts(verifyClaim.claimIdInternal || verifyClaim.claimId, user.email, note, value);
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
        desktopClassName="max-w-5xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[74vh] overflow-y-auto pr-1"
        footer={verifyClaim ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setVerifyClaim(null)}>Cancel</Button>
            <Button onClick={handleVerify} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Verify & Process
            </Button>
          </div>
        ) : undefined}
      >
        <div className="space-y-3">
          <ClaimDetailsPanel claim={verifyClaim} />
          <div><Label>Accounts Verified Amount</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div><Label>Accounts Note</Label><Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional verification note" /></div>
        </div>
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
