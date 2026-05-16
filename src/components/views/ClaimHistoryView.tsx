import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getClaimsHistory, getClaimById, getUsersDirectory, getCompanySettings } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveOverlay } from '@/components/ui/responsive-overlay';
import { History, RefreshCw, Eye, Filter, Download, FileText, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import AttachmentPreview from '@/components/views/AttachmentPreview';
import { supabase } from '@/integrations/supabase/client';
import { exportClaimsCSV } from '@/lib/export-utils';
import { amountToWords } from '@/lib/amount-to-words';

function statusBadge(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === 'closed' || (normalized.includes('approved') && !normalized.includes('pending'))) {
    return <Badge className="bg-green-100 px-2 py-1 text-sm font-medium text-green-800 hover:bg-green-100">{normalized === 'closed' ? 'Closed' : 'Approved'}</Badge>;
  }
  if (normalized.includes('reject')) {
    return <Badge className="bg-red-100 px-2 py-1 text-sm font-medium text-red-800 hover:bg-red-100">Rejected</Badge>;
  }
  return <Badge className="bg-yellow-100 px-2 py-1 text-sm font-medium text-yellow-800 hover:bg-yellow-100">{status}</Badge>;
}

function formatDate(date: string) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function generateClaimPDFHtml(claims: any[], companySettings: any) {
  const logo = companySettings?.logo_url ? `<img src="${companySettings.logo_url}" style="height:50px;margin-bottom:8px" />` : '';
  const companyName = companySettings?.company_name || 'Company';
  const nonRejected = claims.filter((claim) => !claim.status.toLowerCase().includes('reject'));
  const rejectedAmount = claims.filter((claim) => claim.status.toLowerCase().includes('reject')).reduce((sum, claim) => sum + (claim.amount || 0), 0);
  const totalAmount = nonRejected.reduce((sum, claim) => sum + (claim.amount || 0), 0);
  const grandTotal = claims.reduce((sum, claim) => sum + (claim.amount || 0), 0);

  const rows = claims.map((claim) => `
    <tr>
      <td>${claim.claimId}</td>
      <td>${formatDate(claim.date)}</td>
      <td>${claim.submittedBy}</td>
      <td>${claim.site}</td>
      <td class="text-right">Rs. ${(claim.totalWithBill ?? 0).toFixed(2)}</td>
      <td class="text-right">Rs. ${(claim.totalWithoutBill ?? 0).toFixed(2)}</td>
      <td class="text-right"><strong>Rs. ${(claim.amount ?? 0).toFixed(2)}</strong></td>
      <td>${claim.status}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Claims Report - ${companyName}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  .text-right { text-align: right; }
  h1 { color: #2563eb; font-size: 18px; margin: 0; }
  .header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 15px; }
  .summary { margin-top: 15px; font-size: 13px; }
  .rejected { color: #dc2626; }
  @media print { body { padding: 0; } }
</style></head><body>
  <div class="header">
    ${logo}
    <div>
      <h1>${companyName}</h1>
      <p style="margin:2px 0;color:#666">Claims Report | Generated: ${new Date().toLocaleDateString('en-IN')}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>Claim ID</th><th>Date</th><th>Submitted By</th><th>Site</th><th class="text-right">With Bill</th><th class="text-right">Without Bill</th><th class="text-right">Total</th><th>Status</th></tr></thead>
    <tbody>${rows}
      <tr style="font-weight:bold;background:#f5f5f5">
        <td colspan="6" class="text-right">GRAND TOTAL</td>
        <td class="text-right">Rs. ${grandTotal.toFixed(2)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <div class="summary">
    <p><strong>Total Claims:</strong> ${claims.length} | <strong>Total Amount:</strong> Rs. ${grandTotal.toFixed(2)}</p>
    ${rejectedAmount > 0 ? `<p class="rejected"><strong>Rejected Amount:</strong> Rs. ${rejectedAmount.toFixed(2)} | <strong>Net Amount (excl. rejected):</strong> Rs. ${totalAmount.toFixed(2)}</p>` : ''}
    <p><strong>Amount in Words:</strong> ${amountToWords(totalAmount)}</p>
  </div>
</body></html>`;
}

export default function ClaimHistoryView() {
  const { user, isAdmin } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [filters, setFilters] = useState({ userEmail: '', startDate: '', endDate: '' });
  const [users, setUsers] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reportPreview, setReportPreview] = useState<{ url: string; title: string } | null>(null);
  const canViewUserColumn = isAdmin || user?.role === 'Manager' || user?.role === 'Accounts';
  const visibleUsers = user?.role === 'Manager'
    ? users.filter((u) => u.email === user.email || u.manager_email === user.email)
    : users;

  const loadHistory = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getClaimsHistory(user.email, user.role, filters.userEmail || filters.startDate || filters.endDate ? filters : undefined);
      setClaims(data);
      setSelectedIds(new Set());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, [user]);
  useEffect(() => {
    if (canViewUserColumn) getUsersDirectory().then(setUsers);
    getCompanySettings().then(setCompanySettings);
  }, [canViewUserColumn]);

  const viewClaim = async (claimId: string) => {
    const data = await getClaimById(claimId);
    setSelectedClaim(data);
  };

  const toggleSelect = (claimId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(claimId)) next.delete(claimId);
      else next.add(claimId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === claims.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(claims.map((claim) => claim.claimId)));
    }
  };

  const getSelectedClaims = () => claims.filter((claim) => selectedIds.has(claim.claimId));

  const openReportPreview = (claimsForPdf?: any[], title = 'Claims Report') => {
    const target = claimsForPdf || claims;
    if (target.length === 0) return;
    const html = generateClaimPDFHtml(target, companySettings);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    setReportPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { url, title };
    });
  };

  const selectedTotal = getSelectedClaims().reduce((sum, claim) => sum + (claim.amount || 0), 0);

  const claimFooter = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={() => setSelectedClaim(null)}>Close</Button>
    </div>
  );

  const reportFooter = reportPreview ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" asChild>
        <a href={reportPreview.url} target="_blank" rel="noopener noreferrer">Open</a>
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          URL.revokeObjectURL(reportPreview.url);
          setReportPreview(null);
        }}
      >
        Close
      </Button>
    </div>
  ) : undefined;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4 duration-500">
      <div className="glass-card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Filter className="h-4 w-4" /> Filters</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {canViewUserColumn && (
            <div>
              <Label className="text-xs">User</Label>
              <Select value={filters.userEmail} onValueChange={(value) => setFilters({ ...filters, userEmail: value === 'all' ? '' : value })}>
                <SelectTrigger><SelectValue placeholder="All users" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {visibleUsers.map((visibleUser) => <SelectItem key={visibleUser.email} value={visibleUser.email}>{visibleUser.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">From Date</Label>
            <Input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">To Date</Label>
            <Input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={loadHistory}><Filter className="mr-1 h-4 w-4" /> Apply</Button>
            <Button size="sm" variant="outline" onClick={() => { setFilters({ userEmail: '', startDate: '', endDate: '' }); loadHistory(); }}>Reset</Button>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="glass-card flex items-center justify-between border-l-4 border-l-primary p-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-sm">{selectedIds.size} selected</Badge>
            <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground">Rs. {selectedTotal.toFixed(2)}</strong></span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openReportPreview(getSelectedClaims(), 'Selected Claims Report')}>
              <FileText className="mr-1 h-4 w-4" /> Download Selected PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <div className="glass-card">
        <div className="flex flex-col justify-between gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:p-4">
          <h2 className="flex items-center gap-2 font-bold"><History className="h-5 w-5" /> Claim History</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => openReportPreview()} disabled={claims.length === 0} className="flex-1 sm:flex-none">
              <FileText className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">PDF Report</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportClaimsCSV(claims)} disabled={claims.length === 0} className="flex-1 sm:flex-none">
              <Download className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button variant="outline" size="sm" onClick={loadHistory}>
              <RefreshCw className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        <div className="block space-y-3 p-3 md:hidden">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-border p-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))
          ) : claims.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No claims found</div>
          ) : claims.map((claim) => (
            <div key={claim.claimId} className={`space-y-3 rounded-lg border border-border bg-card p-4 ${selectedIds.has(claim.claimId) ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.has(claim.claimId)}
                      onCheckedChange={() => toggleSelect(claim.claimId)}
                    />
                    <p className="font-mono text-xs text-muted-foreground">{claim.claimId}</p>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-primary">Rs. {claim.amount.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">{claim.site}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(claim.date)}</p>
                  {canViewUserColumn && <p className="text-xs text-muted-foreground">By: {claim.submittedBy}</p>}
                </div>
                {statusBadge(claim.status)}
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
                <Button variant="outline" size="sm" className="flex-1" onClick={() => viewClaim(claim.claimIdInternal)}>
                  <Eye className="mr-1 h-4 w-4" /> Details
                </Button>
                {claim.fileIds && claim.fileIds.length > 0 && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => viewClaim(claim.claimIdInternal)}>
                    <Paperclip className="mr-1 h-4 w-4 text-primary" /> Attachments ({claim.fileIds.length})
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="w-10 p-3">
                  <Checkbox
                    checked={claims.length > 0 && selectedIds.size === claims.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="p-3 text-left font-semibold">ID</th>
                <th className="p-3 text-left font-semibold">Date</th>
                {canViewUserColumn && <th className="p-3 text-left font-semibold">User</th>}
                <th className="p-3 text-left font-semibold">Site</th>
                <th className="p-3 text-right font-semibold">With Bill</th>
                <th className="p-3 text-right font-semibold">Without Bill</th>
                <th className="p-3 text-right font-semibold">Total</th>
                <th className="p-3 text-center font-semibold">Status</th>
                <th className="p-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: canViewUserColumn ? 10 : 9 }).map((__, j) => (
                      <td key={j} className="p-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : claims.length === 0 ? (
                <tr><td colSpan={canViewUserColumn ? 10 : 9} className="p-8 text-center text-muted-foreground">No claims found</td></tr>
              ) : claims.map((claim) => (
                <tr key={claim.claimId} className={`border-b border-border transition-colors hover:bg-muted/30 ${selectedIds.has(claim.claimId) ? 'bg-primary/5' : ''}`}>
                  <td className="p-3">
                    <Checkbox
                      checked={selectedIds.has(claim.claimId)}
                      onCheckedChange={() => toggleSelect(claim.claimId)}
                    />
                  </td>
                  <td className="p-3 font-mono text-xs">{claim.claimId}</td>
                  <td className="p-3">{formatDate(claim.date)}</td>
                  {canViewUserColumn && <td className="p-3">{claim.submittedBy}</td>}
                  <td className="p-3">{claim.site}</td>
                  <td className="p-3 text-right">Rs. {(claim.totalWithBill ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right">Rs. {(claim.totalWithoutBill ?? 0).toFixed(2)}</td>
                  <td className="p-3 text-right text-base font-bold">Rs. {claim.amount.toFixed(2)}</td>
                  <td className="p-3 text-center">{statusBadge(claim.status)}</td>
                  <td className="space-x-1 p-3 text-center">
                    <Button variant="ghost" size="sm" onClick={() => viewClaim(claim.claimIdInternal)} title="View Details">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ResponsiveOverlay
        open={!!selectedClaim}
        onOpenChange={(open) => {
          if (!open) setSelectedClaim(null);
        }}
        title={`Claim Details - ${selectedClaim?.claimId || ''}`}
        desktopClassName="max-w-3xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[75vh] overflow-y-auto"
        footer={selectedClaim ? claimFooter : undefined}
      >
        {selectedClaim && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-2">{statusBadge(selectedClaim.status)}</div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Grand Total</p>
                <p className="mt-2 text-2xl font-bold text-primary">Rs. {(selectedClaim.amount ?? 0).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Submitted By</p>
                <p className="mt-1 font-medium">{selectedClaim.submittedBy}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Site</p>
                <p className="mt-1 font-medium">{selectedClaim.site}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="mt-1 font-medium">{formatDate(selectedClaim.date)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">With Bill / Without Bill</p>
                <p className="mt-1 font-medium">Rs. {(selectedClaim.totalWithBill ?? 0).toFixed(2)} / Rs. {(selectedClaim.totalWithoutBill ?? 0).toFixed(2)}</p>
              </div>
              {selectedClaim.rejectionReason && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive sm:col-span-2">
                  <strong>Rejection Reason:</strong> {selectedClaim.rejectionReason}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Paperclip className="h-4 w-4" /> Attachments ({selectedClaim.fileIds?.length || 0})
              </h4>
              {selectedClaim.fileIds && selectedClaim.fileIds.length > 0 ? (
                <AttachmentPreview fileIds={selectedClaim.fileIds} claimId={selectedClaim.claimId} />
              ) : (
                <p className="text-sm italic text-muted-foreground">No attachments for this claim</p>
              )}
            </div>

            <h4 className="text-sm font-semibold sm:text-base">Expenses</h4>

            <div className="block space-y-2 sm:hidden">
              {selectedClaim.expenses?.map((expense: any, i: number) => (
                <div key={i} className="space-y-1 rounded border border-border bg-card p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="font-medium">{expense.category}</span></div>
                  {expense.projectCode && <div className="flex justify-between"><span className="text-muted-foreground">Code</span><span>{expense.projectCode}</span></div>}
                  {expense.claimDate && <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{formatDate(expense.claimDate)}</span></div>}
                  {expense.description && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Desc</span><span className="max-w-[60%] text-right">{expense.description}</span></div>}
                  <div className="mt-1 flex justify-between border-t border-border pt-1">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-bold text-primary">Rs. {(expense.amount ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full border text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-2 text-left">Category</th>
                    <th className="border p-2 text-left">Code</th>
                    <th className="border p-2 text-left">Date</th>
                    <th className="border p-2 text-left">Description</th>
                    <th className="border p-2 text-right">With Bill (Rs.)</th>
                    <th className="border p-2 text-right">Without Bill (Rs.)</th>
                    <th className="border p-2 text-right">Total (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClaim.expenses?.map((expense: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="border p-2">{expense.category}</td>
                      <td className="border p-2">{expense.projectCode}</td>
                      <td className="border p-2">{expense.claimDate ? formatDate(expense.claimDate) : ''}</td>
                      <td className="border p-2">{expense.description}</td>
                      <td className="border p-2 text-right">Rs. {(expense.amountWithBill ?? 0).toFixed(2)}</td>
                      <td className="border p-2 text-right">Rs. {(expense.amountWithoutBill ?? 0).toFixed(2)}</td>
                      <td className="border p-2 text-right font-medium">Rs. {(expense.amount ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50 font-bold">
                    <td colSpan={4} className="border p-2 text-right">TOTAL</td>
                    <td className="border p-2 text-right">Rs. {(selectedClaim.totalWithBill ?? 0).toFixed(2)}</td>
                    <td className="border p-2 text-right">Rs. {(selectedClaim.totalWithoutBill ?? 0).toFixed(2)}</td>
                    <td className="border p-2 text-right">Rs. {(selectedClaim.amount ?? 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={!!reportPreview}
        onOpenChange={(open) => {
          if (!open && reportPreview?.url) URL.revokeObjectURL(reportPreview.url);
          if (!open) setReportPreview(null);
        }}
        title={reportPreview?.title || 'Claims Report'}
        desktopClassName="max-w-5xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="space-y-4"
        footer={reportFooter}
      >
        {reportPreview && (
          <iframe src={reportPreview.url} className="h-[65vh] w-full rounded border" title={reportPreview.title} />
        )}
      </ResponsiveOverlay>
    </div>
  );
}
