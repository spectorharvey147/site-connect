import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getPendingManagerClaims, getPendingAdminClaims, getPendingSuperAdminClaims, approveClaimAsManager, approveClaimAsAdmin, approveClaimAsSuperAdmin, rejectClaim, getClaimById } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { ResponsiveOverlay } from '@/components/ui/responsive-overlay';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Eye, RefreshCw, UserCheck, ShieldCheck, Loader2, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import AttachmentPreview from '@/components/views/AttachmentPreview';
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
            {expense.description && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Description</span><span className="max-w-[60%] break-words text-right">{expense.description}</span></div>}
            {expense.attachmentIds?.length > 0 && (
              <div className="mt-2 border-t border-border pt-2">
                <span className="text-muted-foreground">Bills</span>
                <AttachmentPreview fileIds={expense.attachmentIds} claimId={claim.claimId} compact />
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
        <table className="min-w-[980px] w-full table-fixed border text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="w-[16%] border p-2 text-left">Category</th>
              <th className="w-[20%] border p-2 text-left">Code</th>
              <th className="w-[28%] border p-2 text-left">Description</th>
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
                <td className="break-words border p-2">{expense.description}</td>
                <td className="border p-2 text-right">Rs. {(expense.amountWithBill ?? 0).toFixed(2)}</td>
                <td className="border p-2 text-right">Rs. {(expense.amountWithoutBill ?? 0).toFixed(2)}</td>
                <td className="border p-2">
                  {expense.attachmentIds?.length > 0 ? (
                    <AttachmentPreview fileIds={expense.attachmentIds} claimId={claim.claimId} compact />
                  ) : (
                    <span className="text-xs text-muted-foreground">No bill</span>
                  )}
                </td>
                <td className="border p-2 text-right font-medium">Rs. {(expense.amount ?? 0).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-bold">
              <td colSpan={3} className="border p-2 text-right">TOTAL</td>
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
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadClaims(); }, [user, type]);

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
      toast.success(type === 'admin' ? 'Claim verified and forwarded' : type === 'super-admin' ? 'Claim closed' : 'Claim approved');
      setApproveModal(null);
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

  const Icon = type === 'manager' ? UserCheck : ShieldCheck;
  const title = type === 'manager' ? 'Manager Approval' : type === 'admin' ? 'Admin Verification' : 'Final Approval';
  const approveLabel = type === 'admin' ? 'Verify & Forward' : type === 'super-admin' ? 'Final Approve' : 'Approve';
  const statusBadge = <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">{type === 'admin' ? 'Pending Verification' : 'Pending'}</Badge>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="glass-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5" /> {title}</h2>
          <Button variant="outline" size="sm" onClick={loadClaims}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
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
          ) : claims.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No pending claims</div>
          ) : claims.map((claim) => (
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
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-3 text-left">Claim ID</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">User</th>
                <th className="p-3 text-left">Site</th>
                <th className="p-3 text-right">With Bill</th>
                <th className="p-3 text-right">Without Bill</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : claims.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No pending claims</td></tr>
              ) : claims.map((claim) => (
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
                  <td className="space-x-1 p-3 text-center">
                    <Button variant="ghost" size="sm" onClick={() => handleView(claim.claimIdInternal || claim.claimId)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-success" onClick={() => openApproveModal(claim)} disabled={processing}><Check className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setRejectModal({ claimId: claim.claimId, internalId: claim.claimIdInternal || claim.claimId })}><X className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ResponsiveOverlay
        open={!!approveModal}
        onOpenChange={(open) => {
          if (!open) {
            setApproveModal(null);
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Submitted By</p>
                  <p className="mt-1 font-semibold text-sm">{approveDetails.submittedBy}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Site</p>
                  <p className="mt-1 font-semibold text-sm">{approveDetails.site}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">With Bill / Without Bill</p>
                  <p className="mt-1 font-semibold text-sm">Rs. {(approveDetails.totalWithBill ?? 0).toFixed(2)} / Rs. {(approveDetails.totalWithoutBill ?? 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Grand Total</p>
                  <p className="mt-1 text-2xl font-semibold text-primary">Rs. {(approveDetails.amount ?? 0).toFixed(2)}</p>
                  {approveDetails.submittedAmount != null && approveDetails.submittedAmount !== approveDetails.amount && (
                    <p className="text-xs text-muted-foreground">Submitted Rs. {approveDetails.submittedAmount.toFixed(2)}</p>
                  )}
                </div>
              </div>

              {approveDetails.fileIds && approveDetails.fileIds.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> Attachments ({approveDetails.fileIds.length})</h4>
                  <AttachmentPreview fileIds={approveDetails.fileIds} claimId={approveDetails.claimId} />
                </div>
              )}
            </div>
          )}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Submitted By</p>
                <p className="mt-1 font-medium">{viewClaim.submittedBy}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Site</p>
                <p className="mt-1 font-medium">{viewClaim.site}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">With Bill / Without Bill</p>
                <p className="mt-1 font-medium">Rs. {(viewClaim.totalWithBill ?? 0).toFixed(2)} / Rs. {(viewClaim.totalWithoutBill ?? 0).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Grand Total</p>
                <p className="mt-1 text-2xl font-bold text-primary">Rs. {(viewClaim.amount ?? 0).toFixed(2)}</p>
                {viewClaim.submittedAmount != null && viewClaim.submittedAmount !== viewClaim.amount && (
                  <p className="text-xs text-muted-foreground">Submitted Rs. {viewClaim.submittedAmount.toFixed(2)}</p>
                )}
              </div>
            </div>

            {viewClaim.fileIds && viewClaim.fileIds.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Paperclip className="h-4 w-4" /> Attachments ({viewClaim.fileIds.length})
                </h4>
                <AttachmentPreview fileIds={viewClaim.fileIds} claimId={viewClaim.claimId} />
              </div>
            )}

            <ClaimExpenseDetails claim={viewClaim} />
          </div>
        )}
      </ResponsiveOverlay>
    </div>
  );
}
