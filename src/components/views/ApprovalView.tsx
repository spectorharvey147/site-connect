import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getPendingManagerClaims, getPendingAdminClaims, getPendingSuperAdminClaims, approveClaimAsManager, approveClaimAsAdmin, approveClaimAsSuperAdmin, rejectClaim, getClaimById } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { ResponsiveOverlay } from '@/components/ui/responsive-overlay';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Eye, RefreshCw, UserCheck, ShieldCheck, Loader2, Paperclip, Search, Clock3, ReceiptText, WalletCards, BadgeCheck, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import AttachmentPreview from '@/components/views/AttachmentPreview';
import ClaimApprovalTimeline from '@/components/views/ClaimApprovalTimeline';
import ClaimDetailsOverview from '@/components/views/ClaimDetailsOverview';
import ClaimAttachmentsSection from '@/components/views/ClaimAttachmentsSection';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

function formatDate(date: string) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface ApprovalViewProps {
  type: 'manager' | 'admin' | 'super-admin';
}

function ClaimExpenseDetails({ claim }: { claim: any }) {
  if (!claim?.expenses?.length) return null;

  return (
    <>
      <div className="block space-y-2 sm:hidden">
        {claim.expenses.map((expense: any, i: number) => (
          <div key={i} className="space-y-1 rounded border border-border bg-card p-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Category</span><span className="font-medium text-right">{expense.category}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Code</span><span className="text-right">{expense.projectCode || '-'}</span></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Claim Date</span><span className="text-right">{formatDate(expense.claimDate || claim.date)}</span></div>
            {expense.description && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Description</span><span className="max-w-[60%] break-words text-right">{expense.description}</span></div>}
            {expense.attachmentIds?.length > 0 && (
              <div className="mt-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Bills</span>
                <p className="mt-1 text-xs font-medium text-primary">{expense.attachmentIds.length} file(s) shown in Attachments</p>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border pt-1">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-primary">Rs. {(expense.amount ?? 0).toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden max-w-full overflow-x-auto sm:block">
        <table className="min-w-[1080px] w-full table-fixed border text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="w-[14%] border p-2 text-left">Category</th>
              <th className="w-[18%] border p-2 text-left">Code</th>
              <th className="w-[12%] border p-2 text-left">Claim Date</th>
              <th className="w-[24%] border p-2 text-left">Description</th>
              <th className="border p-2 text-right">With Bill (Rs.)</th>
              <th className="border p-2 text-right">Without Bill (Rs.)</th>
              <th className="w-[16%] border p-2 text-left">Bills</th>
              <th className="border p-2 text-right">Total (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {claim.expenses.map((expense: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="break-words border p-2">{expense.category}</td>
                <td className="break-words border p-2">{expense.projectCode}</td>
                <td className="border p-2">{formatDate(expense.claimDate || claim.date)}</td>
                <td className="break-words border p-2">{expense.description}</td>
                <td className="border p-2 text-right">Rs. {(expense.amountWithBill ?? 0).toFixed(2)}</td>
                <td className="border p-2 text-right">Rs. {(expense.amountWithoutBill ?? 0).toFixed(2)}</td>
                <td className="border p-2">
                  {expense.attachmentIds?.length > 0 ? (
                    <span className="text-xs font-medium text-primary">{expense.attachmentIds.length} file(s)</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No bill</span>
                  )}
                </td>
                <td className="border p-2 text-right font-medium">Rs. {(expense.amount ?? 0).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-bold">
              <td colSpan={4} className="border p-2 text-right">TOTAL</td>
              <td className="border p-2 text-right">Rs. {(claim.totalWithBill ?? 0).toFixed(2)}</td>
              <td className="border p-2 text-right">Rs. {(claim.totalWithoutBill ?? 0).toFixed(2)}</td>
              <td className="border p-2"></td>
              <td className="border p-2 text-right">Rs. {(claim.amount ?? 0).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ApprovalView({ type }: ApprovalViewProps) {
  const { user } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ claimId: string; internalId?: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveModal, setApproveModal] = useState<{ claimId: string; internalId?: string } | null>(null);
  const [approveDescription, setApproveDescription] = useState('');
  const [verifiedAmount, setVerifiedAmount] = useState('');
  const [processing, setProcessing] = useState(false);
  const [viewClaim, setViewClaim] = useState<any>(null);
  const [approveDetails, setApproveDetails] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('oldest');
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filteredClaims = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = claims.filter((claim) => !query || [
      claim.claimId,
      claim.submittedBy,
      claim.userEmail,
      claim.site,
      claim.status,
    ].some((value) => String(value || '').toLowerCase().includes(query)));

    return [...matching].sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === 'amount-high') return (b.amount || 0) - (a.amount || 0);
      if (sortBy === 'amount-low') return (a.amount || 0) - (b.amount || 0);
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [claims, search, sortBy]);

  const totalAmount = claims.reduce((sum, claim) => sum + Number(claim.amount || 0), 0);
  const totalWithBill = claims.reduce((sum, claim) => sum + Number(claim.totalWithBill || 0), 0);
  const oldestClaim = claims.reduce<any | null>((oldest, claim) => !oldest || new Date(claim.date) < new Date(oldest.date) ? claim : oldest, null);
  const oldestWaitingDays = oldestClaim ? Math.max(0, Math.floor((Date.now() - new Date(oldestClaim.date).getTime()) / 86400000)) : 0;
  const pageCount = Math.max(1, Math.ceil(filteredClaims.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedClaims = filteredClaims.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const loadClaims = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = type === 'manager'
        ? await getPendingManagerClaims(user.email, user.role)
        : type === 'admin'
          ? await getPendingAdminClaims()
          : await getPendingSuperAdminClaims();
      setClaims(data);
      setPage(1);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadClaims(); }, [user, type]);
  useEffect(() => {
    if (viewClaim || approveModal) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [viewClaim, approveModal]);

  const handleApprove = async () => {
    if (!approveModal) return;
    const amount = Number(verifiedAmount);
    if ((type === 'admin' || type === 'manager' || type === 'super-admin') && (!verifiedAmount || Number.isNaN(amount) || amount < 0)) {
      toast.error('Enter a valid final approved amount');
      return;
    }
    setProcessing(true);
    try {
      const internalId = approveModal.internalId || approveModal.claimId;
      if (type === 'manager') await approveClaimAsManager(internalId, user!.email, approveDescription, amount);
      else if (type === 'super-admin') await approveClaimAsSuperAdmin(internalId, user!.email, approveDescription, amount);
      else await approveClaimAsAdmin(internalId, user!.email, approveDescription, amount);
      toast.success(type === 'admin' ? 'Claim verified and forwarded' : type === 'super-admin' ? 'Claim sent for accounts verification' : 'Claim approved');
      setApproveModal(null);
      setApproveDetails(null);
      setApproveDescription('');
      setVerifiedAmount('');
      loadClaims();
    } catch (e: any) {
      toast.error(e.message);
    }
    setProcessing(false);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    setProcessing(true);
    try {
      const internal = rejectModal!.internalId || rejectModal!.claimId;
      await rejectClaim(internal, rejectReason, user!.email, type === 'manager' ? 'Manager' : 'Admin');
      toast.success('Claim rejected');
      setRejectModal(null);
      setRejectReason('');
      loadClaims();
    } catch (e: any) {
      toast.error(e.message);
    }
    setProcessing(false);
  };

  const handleView = async (internalId: string) => {
    const data = await getClaimById(internalId);
    setViewClaim(data);
  };

  const openApproveModal = (claim: any) => {
    setApproveModal({ claimId: claim.claimId, internalId: claim.claimIdInternal || claim.claimId });
    setApproveDetails(null);
    setApproveDescription('');
    setVerifiedAmount(String((claim.verifiedAmount ?? claim.amount ?? 0).toFixed(2)));
    // Fetch full claim details so approver can review attachments and line items in the same modal
    void (async () => {
      try {
        const details = await getClaimById(claim.claimIdInternal || claim.claimId);
        setApproveDetails(details);
      } catch (e) {
        console.error('Failed to load claim details for approval', e);
        setApproveDetails(null);
      }
    })();
  };

  const Icon = type === 'manager' ? UserCheck : type === 'admin' ? ShieldCheck : BadgeCheck;
  const title = type === 'manager' ? 'Manager Approval' : type === 'admin' ? 'Admin Verification' : 'Final Approval';
  const approveLabel = type === 'admin' ? 'Verify & Forward' : type === 'super-admin' ? 'Final Approve' : 'Approve';
  const stageColor = type === 'manager' ? 'text-indigo-600' : type === 'admin' ? 'text-sky-600' : 'text-violet-600';
  const statusBadge = (
    <Badge variant="outline" className={type === 'manager'
      ? 'border-indigo-200 bg-indigo-100 text-indigo-800 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300'
      : type === 'admin'
        ? 'border-sky-200 bg-sky-100 text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300'
        : 'border-violet-200 bg-violet-100 text-violet-800 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300'}>
      {type === 'admin' ? 'Pending Verification' : type === 'super-admin' ? 'Pending Final Approval' : 'Pending Manager Approval'}
    </Badge>
  );

  if (viewClaim) {
    return (
      <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-right-4 space-y-4 pb-8 duration-300">
        <div className="sticky top-0 z-20 flex flex-col gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setViewClaim(null)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold sm:text-lg">Claim Details</h2>
              <p className="truncate text-xs text-muted-foreground">{viewClaim.claimId} · {viewClaim.submittedBy}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setViewClaim(null)}>Close Details</Button>
        </div>

        <ClaimDetailsOverview claim={viewClaim} />
        <ClaimAttachmentsSection claim={viewClaim} />
        <ClaimApprovalTimeline claim={viewClaim} />
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <h3 className="mb-4 text-base font-semibold">Expense Details</h3>
          <ClaimExpenseDetails claim={viewClaim} />
        </section>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setViewClaim(null)}><ArrowLeft className="mr-1 h-4 w-4" /> Back to {title}</Button>
        </div>
      </div>
    );
  }

  if (approveModal) {
    const closeApprovalPage = () => {
      setApproveModal(null);
      setApproveDetails(null);
      setApproveDescription('');
      setVerifiedAmount('');
    };

    return (
      <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-right-4 space-y-4 pb-8 duration-300">
        <div className="sticky top-0 z-20 flex flex-col gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" onClick={closeApprovalPage}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold sm:text-lg">{approveLabel} Claim</h2>
              <p className="truncate text-xs text-muted-foreground">{approveModal.claimId}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeApprovalPage}>Cancel</Button>
            <Button className="gradient-success text-success-foreground" onClick={handleApprove} disabled={processing || !approveDetails}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} {approveLabel}
            </Button>
          </div>
        </div>

        {!approveDetails ? (
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <ClaimDetailsOverview claim={approveDetails} />
            <ClaimAttachmentsSection claim={approveDetails} />
            <ClaimApprovalTimeline claim={approveDetails} />
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <h3 className="mb-4 text-base font-semibold">Expense Details</h3>
              <ClaimExpenseDetails claim={approveDetails} />
            </section>
          </>
        )}

        <section className="rounded-xl border border-primary/20 bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold">Approval Decision</h3>
            <p className="mt-1 text-xs text-muted-foreground">Review the claim above before confirming this action.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <Label>Final Approved Amount *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={verifiedAmount}
                onChange={(event) => setVerifiedAmount(event.target.value)}
                placeholder="Enter final approved amount"
                className="mt-1"
              />
              {approveDetails?.submittedAmount != null && (
                <p className="mt-1 text-xs text-muted-foreground">Submitted: Rs. {approveDetails.submittedAmount.toFixed(2)}</p>
              )}
            </div>
            <div>
              <Label>Notes / Description (optional)</Label>
              <Textarea
                placeholder="Add notes about this approval..."
                value={approveDescription}
                onChange={(event) => setApproveDescription(event.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closeApprovalPage}>Cancel</Button>
            <Button className="gradient-success text-success-foreground" onClick={handleApprove} disabled={processing || !approveDetails}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Confirm {approveLabel}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4 duration-500">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Pending Claims</p>
            <span className="rounded-lg bg-orange-100 p-2 text-orange-600 dark:bg-orange-950/50"><Clock3 className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-2xl font-bold">{claims.length}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Awaiting this stage</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Pending Amount</p>
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><WalletCards className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-xl font-bold text-primary">Rs. {totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Current claim value</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">With Bills</p>
            <span className="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-950/50"><ReceiptText className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-xl font-bold">Rs. {totalWithBill.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Documented expenses</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Oldest Waiting</p>
            <span className={`rounded-lg bg-muted p-2 ${stageColor}`}><Icon className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-2xl font-bold">{oldestWaitingDays} <span className="text-sm font-medium text-muted-foreground">days</span></p>
          <p className="mt-1 text-[11px] text-muted-foreground">Queue ageing</p>
        </div>
      </div>

      <div className="glass-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><Icon className={`h-5 w-5 ${stageColor}`} /> {title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Review claims in oldest-first priority</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadClaims()}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
        </div>

        <div className="grid grid-cols-1 gap-2 border-b border-border bg-muted/20 p-3 sm:grid-cols-[minmax(240px,1fr)_200px] sm:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search claim, employee, email or site..."
              className="pl-9"
            />
          </div>
          <select
            value={sortBy}
            onChange={(event) => { setSortBy(event.target.value); setPage(1); }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label="Sort approval queue"
          >
            <option value="oldest">Oldest First</option>
            <option value="newest">Newest First</option>
            <option value="amount-high">Amount: High to Low</option>
            <option value="amount-low">Amount: Low to High</option>
          </select>
        </div>

        <div className="block space-y-3 p-3 md:hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <Skeleton className="mb-3 h-5 w-1/2" />
                <Skeleton className="mb-2 h-4 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))
          ) : filteredClaims.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="font-medium text-foreground">No matching pending claims</p>
              <p className="mt-1 text-xs">Try a different employee, claim number, or site.</p>
            </div>
          ) : paginatedClaims.map((claim) => (
            <div key={claim.claimId} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{claim.claimId}</p>
                  <p className="mt-2 text-2xl font-bold text-primary">Rs. {claim.amount.toFixed(2)}</p>
                  {claim.submittedAmount != null && claim.submittedAmount !== claim.amount && (
                    <p className="text-xs text-muted-foreground">Submitted Rs. {claim.submittedAmount.toFixed(2)}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{claim.site}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(claim.date)}</p>
                  <p className="text-xs text-muted-foreground">Submitted by {claim.submittedBy}</p>
                </div>
                {statusBadge}
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">With Bill</p>
                  <p className="font-medium">Rs. {(claim.totalWithBill ?? 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Without Bill</p>
                  <p className="font-medium">Rs. {(claim.totalWithoutBill ?? 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => handleView(claim.claimIdInternal || claim.claimId)}>
                  <Eye className="mr-1 h-4 w-4" /> Details
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-success" onClick={() => openApproveModal(claim)} disabled={processing}>
                  <Check className="mr-1 h-4 w-4" /> {approveLabel}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-destructive" onClick={() => setRejectModal({ claimId: claim.claimId, internalId: claim.claimIdInternal || claim.claimId })}>
                  <X className="mr-1 h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden max-w-full overflow-x-auto md:block">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted shadow-sm">
              <tr className="bg-muted/50">
                <th className="p-3 text-left">Claim ID</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Site</th>
                <th className="p-3 text-right">With Bill</th>
                <th className="p-3 text-right">Without Bill</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-center">Stage</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredClaims.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No matching pending claims</td></tr>
              ) : paginatedClaims.map((claim) => (
                <tr key={claim.claimId} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{claim.claimId}</td>
                  <td className="p-3">{formatDate(claim.date)}</td>
                  <td className="p-3 break-words">{claim.submittedBy}</td>
                  <td className="p-3 break-words">{claim.site}</td>
                  <td className="p-3 text-right">Rs. {(claim.totalWithBill ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right">Rs. {(claim.totalWithoutBill ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right text-base font-bold">
                    Rs. {claim.amount.toFixed(2)}
                    {claim.submittedAmount != null && claim.submittedAmount !== claim.amount && (
                      <div className="text-xs font-normal text-muted-foreground">Submitted Rs. {claim.submittedAmount.toFixed(2)}</div>
                    )}
                  </td>
                  <td className="p-3 text-center">{statusBadge}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => handleView(claim.claimIdInternal || claim.claimId)}><Eye className="mr-1 h-4 w-4" /> Details</Button>
                      <Button variant="outline" size="sm" className="whitespace-nowrap border-success/30 bg-success/5 text-success hover:bg-success/10" onClick={() => openApproveModal(claim)} disabled={processing}><Check className="mr-1 h-4 w-4" /> {approveLabel}</Button>
                      <Button variant="outline" size="sm" className="border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10" onClick={() => setRejectModal({ claimId: claim.claimId, internalId: claim.claimIdInternal || claim.claimId })}><X className="mr-1 h-4 w-4" /> Reject</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filteredClaims.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border bg-muted/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredClaims.length)} of {filteredClaims.length} pending claims
            </p>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="min-w-20 text-center text-xs font-medium">Page {currentPage} of {pageCount}</span>
              <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ResponsiveOverlay
        open={!!approveModal}
        onOpenChange={(open) => {
          if (!open) {
            setApproveModal(null);
            setApproveDetails(null);
            setApproveDescription('');
            setVerifiedAmount('');
          }
        }}
        title={`${approveLabel} Claim - ${approveModal?.claimId || ''}`}
        footer={approveModal ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setApproveModal(null)}>Cancel</Button>
            <Button className="gradient-success text-success-foreground" onClick={handleApprove} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} {approveLabel}
            </Button>
          </div>
        ) : undefined}
        desktopClassName="max-w-5xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[74vh] overflow-y-auto pr-1"
        >
        <div className="space-y-3">
          {approveDetails && (
            <div className="rounded-lg border border-border bg-muted/20 p-2">
              <ClaimDetailsOverview claim={approveDetails} />

              {approveDetails.generalFileIds && approveDetails.generalFileIds.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> General Attachments ({approveDetails.generalFileIds.length})</h4>
                  <AttachmentPreview fileIds={approveDetails.generalFileIds} claimId={approveDetails.claimId} />
                </div>
              )}
            </div>
          )}
          {approveDetails && <ClaimApprovalTimeline claim={approveDetails} />}
          {approveDetails?.expenses?.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <h4 className="mb-3 text-sm font-semibold">Expense Details</h4>
              <ClaimExpenseDetails claim={approveDetails} />
            </div>
          )}
          {(type === 'admin' || type === 'manager' || type === 'super-admin') && (
            <div>
              <Label>Final Approved Amount *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={verifiedAmount}
                onChange={e => setVerifiedAmount(e.target.value)}
                placeholder="Enter final approved amount"
              />
            </div>
          )}
          {approveModal && (
            <div className="text-xs text-muted-foreground">Submitted: Rs. {claims.find(c => c.claimId === approveModal.claimId)?.submittedAmount?.toFixed(2) ?? '0.00'}</div>
          )}
          <div>
            <Label>Notes / Description (optional)</Label>
            <Textarea
              placeholder="Add any notes about this approval..."
              value={approveDescription}
              onChange={e => setApproveDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={!!rejectModal}
        onOpenChange={(open) => {
          if (!open) {
            setRejectModal(null);
            setRejectReason('');
          }
        }}
        title={`Reject Claim - ${rejectModal?.claimId || ''}`}
        footer={rejectModal ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />} Reject
            </Button>
          </div>
        ) : undefined}
      >
        <div>
          <Label>Reason for Rejection *</Label>
          <Textarea placeholder="Reason for rejection..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={5} />
        </div>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={!!viewClaim}
        onOpenChange={(open) => {
          if (!open) setViewClaim(null);
        }}
        title={`Claim Details - ${viewClaim?.claimId || ''}`}
        desktopClassName="max-w-3xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[75vh] overflow-y-auto"
        footer={viewClaim ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setViewClaim(null)}>Close</Button>
          </div>
        ) : undefined}
      >
        {viewClaim && (
          <div className="space-y-4">
            <ClaimDetailsOverview claim={viewClaim} />

            {viewClaim.generalFileIds && viewClaim.generalFileIds.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Paperclip className="h-4 w-4" /> General Attachments ({viewClaim.generalFileIds.length})
                </h4>
                <AttachmentPreview fileIds={viewClaim.generalFileIds} claimId={viewClaim.claimId} />
              </div>
            )}

            <ClaimApprovalTimeline claim={viewClaim} />

            <ClaimExpenseDetails claim={viewClaim} />
          </div>
        )}
      </ResponsiveOverlay>
    </div>
  );
}
