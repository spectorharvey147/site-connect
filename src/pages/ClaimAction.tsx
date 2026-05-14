import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { approveClaimAsAdmin, approveClaimAsManager, approveClaimAsSuperAdmin, getClaimById, rejectClaim } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Paperclip } from 'lucide-react';
import AttachmentPreview from '@/components/views/AttachmentPreview';

export default function ClaimAction() {
  const [searchParams] = useSearchParams();
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [verifiedAmount, setVerifiedAmount] = useState('');
  const [autoProcessed, setAutoProcessed] = useState(false);

  const claimId = searchParams.get('claimId') || '';
  const role = (searchParams.get('role') || '').toLowerCase();
  const action = (searchParams.get('action') || '').toLowerCase();
  const approverEmail = searchParams.get('approverEmail') || '';

  const mode = useMemo(() => ({
    isApprove: action === 'approve',
    isReject: action === 'reject',
    isManager: role === 'manager',
    isAdmin: role === 'admin',
    isSuperAdmin: role === 'super-admin' || role === 'super_admin',
  }), [action, role]);

  useEffect(() => {
    async function loadClaim() {
      if (!claimId) {
        setMessage('Missing claim id.');
        setLoading(false);
        return;
      }
      const data = await getClaimById(claimId);
      setClaim(data);
      setVerifiedAmount(String((data?.verifiedAmount ?? data?.amount ?? 0).toFixed(2)));
      setLoading(false);
    }

    void loadClaim();
  }, [claimId]);

  useEffect(() => {
    if (loading || autoProcessed || message || !mode.isApprove || mode.isAdmin || !claimId || !approverEmail) return;
    setAutoProcessed(true);
    void processApprove();
  }, [loading, autoProcessed, message, mode.isApprove, claimId, approverEmail]);

  const processApprove = async () => {
    if (!claimId || !approverEmail) return;
    const amount = Number(verifiedAmount);
    if ((mode.isAdmin || mode.isManager || mode.isSuperAdmin) && (!verifiedAmount || Number.isNaN(amount) || amount < 0)) {
      setMessage('Enter a valid final approved amount.');
      return;
    }
    setProcessing(true);
    try {
      if (mode.isManager) {
        await approveClaimAsManager(claimId, approverEmail, 'Approved from email link', amount);
        setMessage('Claim approved by manager. Awaiting final approval.');
      } else if (mode.isSuperAdmin) {
        // super admin finalizes - pass verified amount
        await approveClaimAsSuperAdmin(claimId, approverEmail, 'Approved from email link', amount);
        setMessage('Claim closed successfully.');
      } else if (mode.isAdmin) {
        await approveClaimAsAdmin(claimId, approverEmail, 'Approved from email link', amount);
        setMessage('Claim verified and forwarded successfully.');
      } else {
        throw new Error('Invalid approval role');
      }
    } catch (error: any) {
      setMessage(error.message || 'Failed to approve claim.');
    }
    setProcessing(false);
  };

  const processReject = async () => {
    if (!claimId || !approverEmail || !rejectReason.trim()) return;
    setProcessing(true);
    try {
      await rejectClaim(claimId, rejectReason.trim(), approverEmail, mode.isManager ? 'Manager' : mode.isSuperAdmin ? 'Super Admin' : 'Admin');
      setMessage('Claim rejected successfully.');
    } catch (error: any) {
      setMessage(error.message || 'Failed to reject claim.');
    }
    setProcessing(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Claim Email Action</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-1 text-sm">
                <div className="flex items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{claim?.claimId || claimId}</span><span className="text-xs text-muted-foreground">{claim?.status || ''}</span></div>
                <div className="flex flex-wrap gap-4">
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Submitted By</div>
                    <div className="font-semibold">{claim?.submittedBy || '-'}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Site</div>
                    <div className="font-semibold">{claim?.site || '-'}</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Submitted Amount</div>
                    <div className="text-lg font-bold">Rs. {(claim?.submittedAmount ?? claim?.amount ?? 0).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {(mode.isAdmin || mode.isManager || mode.isSuperAdmin) && mode.isApprove && !message && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Final Approved Amount</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={verifiedAmount}
                    onChange={(e) => setVerifiedAmount(e.target.value)}
                    placeholder="Enter final approved amount"
                  />
                </div>
              )}

              {mode.isReject && !message && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rejection Reason</label>
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} placeholder="Enter rejection reason" />
                </div>
              )}

              {/* Show full claim expenses and attachments so approver can review here */}
              {claim && (
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs text-muted-foreground">With Bill / Without Bill</div>
                      <div className="font-semibold">Rs. {(claim.totalWithBill ?? 0).toFixed(2)} / Rs. {(claim.totalWithoutBill ?? 0).toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Grand Total</div>
                      <div className="text-2xl font-bold text-primary">Rs. {(claim.amount ?? 0).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="py-2 px-3 text-left">Category</th>
                          <th className="py-2 px-3 text-left">Project Code</th>
                          <th className="py-2 px-3 text-left">Description</th>
                          <th className="py-2 px-3 text-right">With Bill</th>
                          <th className="py-2 px-3 text-right">Without Bill</th>
                          <th className="py-2 px-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claim.expenses?.map((expense: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="py-2 px-3">{expense.category}</td>
                            <td className="py-2 px-3">{expense.projectCode}</td>
                            <td className="py-2 px-3">{expense.description}</td>
                            <td className="py-2 px-3 text-right">Rs. {(expense.amountWithBill ?? 0).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right">Rs. {(expense.amountWithoutBill ?? 0).toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-medium">Rs. {(expense.amount ?? 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {claim.fileIds && claim.fileIds.length > 0 && (
                    <div className="mt-2">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4" /> Attachments ({claim.fileIds.length})</h4>
                      <AttachmentPreview fileIds={claim.fileIds} claimId={claim.claimId} />
                    </div>
                  )}
                </div>
              )}

              {message ? (
                <div className="rounded border border-border bg-muted/40 p-4 text-sm">{message}</div>
              ) : (
                <div className="flex gap-2">
                  {mode.isApprove && (
                    <Button onClick={() => void processApprove()} disabled={processing || !approverEmail}>
                      {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {processing ? 'Processing Approval...' : 'Approve Claim'}
                    </Button>
                  )}
                  {mode.isReject && (
                    <Button variant="destructive" onClick={() => void processReject()} disabled={processing || !approverEmail || !rejectReason.trim()}>
                      {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Reject Claim
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
