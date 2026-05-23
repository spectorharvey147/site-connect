import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CreditCard, Eye, Loader2, RefreshCw } from 'lucide-react';
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

function formatCurrency(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date?: string) {
  return date ? new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === 'accounts processing') return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Accounts Processing</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Accounts Verification</Badge>;
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

  const loadClaims = async () => {
    setLoading(true);
    try {
      setClaims(await getAccountsClaims());
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
  const processingClaims = useMemo(() => claims.filter((claim) => String(claim.status || '').toLowerCase() === 'accounts processing'), [claims]);

  const openVerify = (claim: any) => {
    setVerifyClaim(claim);
    setAmount(String((claim.verifiedAmount ?? claim.amount ?? 0).toFixed(2)));
    setNote('');
  };

  const openPay = (claim: any) => {
    setPayClaim(claim);
    setAmount(String((claim.verifiedAmount ?? claim.amount ?? 0).toFixed(2)));
    setReference('');
    setNote('');
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

  const ClaimTable = ({ rows, mode }: { rows: any[]; mode: 'verify' | 'pay' }) => (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
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
                {Array.from({ length: 7 }).map((__, cell) => <td key={cell} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No claims in this stage</td></tr>
          ) : rows.map((claim) => (
            <tr key={claim.claimIdInternal || claim.claimId} className="border-t border-border hover:bg-muted/30">
              <td className="p-3 font-mono text-xs">{claim.claimId}</td>
              <td className="p-3">{formatDate(claim.date)}</td>
              <td className="p-3">{claim.submittedBy}</td>
              <td className="p-3">{claim.site}</td>
              <td className="p-3 text-right font-bold text-primary">{formatCurrency(claim.verifiedAmount ?? claim.amount)}</td>
              <td className="p-3 text-center"><StatusBadge status={claim.status} /></td>
              <td className="p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => handleView(claim)}><Eye className="h-4 w-4" /></Button>
                {mode === 'verify' ? (
                  <Button variant="ghost" size="sm" className="text-success" onClick={() => openVerify(claim)}><CheckCircle2 className="h-4 w-4" /></Button>
                ) : (
                  <Button variant="ghost" size="sm" className="text-success" onClick={() => openPay(claim)}><CreditCard className="h-4 w-4" /></Button>
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
          <p className="text-sm text-muted-foreground">Verify final approved claims, then mark payments as paid.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadClaims}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
      </div>

      <section className="glass-card p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Accounts Verification</h3>
        <ClaimTable rows={accountsVerification} mode="verify" />
      </section>

      <section className="glass-card p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Payment Processing</h3>
        <ClaimTable rows={processingClaims} mode="pay" />
      </section>

      <ResponsiveOverlay
        open={!!verifyClaim}
        onOpenChange={(open) => !open && setVerifyClaim(null)}
        title={`Accounts Verify - ${verifyClaim?.claimId || ''}`}
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
          <div><Label>Accounts Verified Amount</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div><Label>Accounts Note</Label><Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional verification note" /></div>
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={!!payClaim}
        onOpenChange={(open) => !open && setPayClaim(null)}
        title={`Mark Paid - ${payClaim?.claimId || ''}`}
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
          <div><Label>Paid Amount</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div><Label>Payment Reference</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR / cheque / cash reference" /></div>
          <div><Label>Payment Note</Label><Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional payment note" /></div>
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay open={!!viewClaim} onOpenChange={(open) => !open && setViewClaim(null)} title={`Claim Details - ${viewClaim?.claimId || ''}`}>
        {viewClaim && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Submitted By</p><p className="font-semibold">{viewClaim.submittedBy}</p></div>
              <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Site</p><p className="font-semibold">{viewClaim.site}</p></div>
              <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Status</p><p className="font-semibold">{viewClaim.status}</p></div>
              <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">Amount</p><p className="font-semibold text-primary">{formatCurrency(viewClaim.verifiedAmount ?? viewClaim.amount)}</p></div>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-muted/50"><tr><th className="p-2 text-left">Category</th><th className="p-2 text-left">Project Code</th><th className="p-2 text-left">Description</th><th className="p-2 text-right">With Bill</th><th className="p-2 text-right">Without Bill</th><th className="p-2 text-right">Total</th></tr></thead>
                <tbody>
                  {viewClaim.expenses?.map((expense: any, index: number) => (
                    <tr key={index} className="border-t border-border">
                      <td className="p-2">{expense.category}</td>
                      <td className="p-2">{expense.projectCode}</td>
                      <td className="p-2">{expense.description}</td>
                      <td className="p-2 text-right">{formatCurrency(expense.amountWithBill)}</td>
                      <td className="p-2 text-right">{formatCurrency(expense.amountWithoutBill)}</td>
                      <td className="p-2 text-right font-semibold">{formatCurrency(expense.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ResponsiveOverlay>
    </div>
  );
}
