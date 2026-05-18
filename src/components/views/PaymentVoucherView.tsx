import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getClaimsHistory, getCompanySettings, getAllUsers, getClaimApprovalTrail } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Receipt, RefreshCw, Eye, Printer, Download, Filter } from 'lucide-react';
import { amountToWords } from '@/lib/amount-to-words';
import AttachmentPreview from '@/components/views/AttachmentPreview';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function money(value: number) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function formatInputDate(d: string) {
  if (!d) return '';
  const date = new Date(d);
  return date.toISOString().slice(0, 10);
}

function buildVoucherNo(selectedClaims: any[]) {
  const prefix = `PV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  return `${prefix}-${String(selectedClaims.length).padStart(2, '0')}`;
}

type UserDirectoryEntry = {
  name: string;
  signatureUrl: string;
};

function buildUserDirectory(users: any[]) {
  return Object.fromEntries((users || []).map((entry: any) => [
    String(entry.email || '').trim().toLowerCase(),
    {
      name: entry.name || entry.email,
      signatureUrl: entry.signatureUrl || entry.signature_url || '',
    },
  ]));
}

function getClaimOwnerName(claim: any, userDirectory: Record<string, UserDirectoryEntry>) {
  const email = String(claim.userEmail || '').trim().toLowerCase();
  return userDirectory[email]?.name || claim.submittedBy || claim.userEmail || 'Unknown User';
}

function buildUserTotals(claimsForVoucher: any[], userDirectory: Record<string, UserDirectoryEntry>) {
  const byUser = new Map<string, { name: string; email: string; signatureUrl: string; claimCount: number; submittedAmount: number; verifiedPayable: number }>();

  claimsForVoucher.forEach((claim) => {
    const email = String(claim.userEmail || '').trim().toLowerCase() || 'unknown';
    const directoryEntry = email === 'unknown' ? undefined : userDirectory[email];
    const current = byUser.get(email) || {
      name: getClaimOwnerName(claim, userDirectory),
      email: email === 'unknown' ? '' : email,
      signatureUrl: directoryEntry?.signatureUrl || '',
      claimCount: 0,
      submittedAmount: 0,
      verifiedPayable: 0,
    };
    if (!current.signatureUrl && directoryEntry?.signatureUrl) current.signatureUrl = directoryEntry.signatureUrl;
    current.claimCount += 1;
    current.submittedAmount += claim.submittedAmount || claim.amount || 0;
    current.verifiedPayable += claim.amount || 0;
    byUser.set(email, current);
  });

  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildProjectCodeTotals(claimsForVoucher: any[]) {
  const byCode = new Map<string, { projectCode: string; claimCount: number; totalWithBill: number; totalWithoutBill: number; submittedTotal: number; verifiedPayable: number }>();

  claimsForVoucher.forEach((claim) => {
    const expenses = claim.expenses?.length ? claim.expenses : [{
      projectCode: 'Uncoded',
      amountWithBill: claim.totalWithBill || 0,
      amountWithoutBill: claim.totalWithoutBill || 0,
      amount: claim.submittedAmount || claim.amount || 0,
    }];
    const submittedTotal = expenses.reduce((sum: number, expense: any) => sum + (expense.amount || 0), 0) || claim.submittedAmount || claim.amount || 0;

    expenses.forEach((expense: any) => {
      const projectCode = expense.projectCode || 'Uncoded';
      const amount = expense.amount || 0;
      const verifiedShare = submittedTotal > 0
        ? ((claim.amount || 0) * amount) / submittedTotal
        : (claim.amount || 0) / expenses.length;
      const current = byCode.get(projectCode) || {
        projectCode,
        claimCount: 0,
        totalWithBill: 0,
        totalWithoutBill: 0,
        submittedTotal: 0,
        verifiedPayable: 0,
      };
      current.claimCount += 1;
      current.totalWithBill += expense.amountWithBill || 0;
      current.totalWithoutBill += expense.amountWithoutBill || 0;
      current.submittedTotal += amount;
      current.verifiedPayable += verifiedShare;
      byCode.set(projectCode, current);
    });
  });

  return [...byCode.values()].sort((a, b) => a.projectCode.localeCompare(b.projectCode));
}

function getVoucherDocumentStyles() {
  return `
    body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; }
    .text-right { text-align: right; }
    .voucher-header { display:grid; grid-template-columns:64px 1fr 64px; align-items:start; gap:12px; margin-bottom:14px; }
    .voucher-logo { display:block; height:52px; width:52px; object-fit:contain; margin:0; }
    .voucher-title-block { text-align:center; }
    .voucher-title-block h2 { color:#2563eb; font-size:18px; margin:0 0 4px; }
    .voucher-title-block h3 { border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; font-size:15px; margin:8px 0 0; padding:4px 0; }
    .voucher-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; background: #f8fafc; font-size: 11px; }
    .voucher-meta, .voucher-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 12px 0; font-size:11px; }
    .voucher-section-title { margin:0 0 8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
    .voucher-total-box { margin-top:10px; padding:10px; background:#f8fafc; border-radius:6px; font-size:11px; }
    .voucher-signatures { display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; margin-top:44px; text-align:center; font-size:11px; }
    .voucher-payee-signatures { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:24px; margin-top:26px; text-align:center; font-size:11px; }
    .voucher-signature-image-wrap { height:46px; display:flex; align-items:flex-end; justify-content:center; margin-bottom:6px; }
    .voucher-signature-image { max-width:150px; max-height:42px; width:auto; height:auto; object-fit:contain; }
    .voucher-signatures strong, .voucher-payee-signatures strong { display:block; border-top:1px solid #111827; padding-top:8px; font-size:11px; }
    .voucher-signatures span, .voucher-payee-signatures span { display:block; color:#4b5563; font-size:10px; margin-top:4px; }
    @media (max-width: 700px) {
      .voucher-header { grid-template-columns:56px 1fr; }
      .voucher-header-spacer { display:none; }
      .voucher-meta, .voucher-summary-grid, .voucher-signatures, .voucher-payee-signatures { grid-template-columns:1fr; }
      table { font-size:10px; }
    }
    @media print { body { padding: 10px; } }
  `;
}

function summarizeApproval(voucher: any, stage: 'admin' | 'manager' | 'final') {
  const stamps = (voucher?.claims || [])
    .map((claim: any) => voucher?.approvals?.[claim.claimIdInternal]?.[stage])
    .filter(Boolean);
  const names = [...new Set(stamps.map((stamp: any) => stamp.name || stamp.email).filter(Boolean))];
  const latestDate = stamps
    .map((stamp: any) => stamp.date)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    name: names.length ? names.join(', ') : 'Not available',
    date: latestDate ? formatDateTime(latestDate) : 'Not available',
    signatureUrl: stamps.find((stamp: any) => stamp.signatureUrl)?.signatureUrl || '',
  };
}

function SignatureBlock({ title, approval }: { title: string; approval: any }) {
  return (
    <div>
      <div className="voucher-signature-image-wrap flex h-[46px] items-end justify-center mb-1">
        {approval?.signatureUrl && (
          <img
            src={approval.signatureUrl}
            alt={`${title} signature`}
            className="voucher-signature-image max-h-[42px] max-w-[150px] object-contain"
            style={{ maxWidth: '150px', maxHeight: '42px', width: 'auto', height: 'auto', objectFit: 'contain' }}
          />
        )}
      </div>
      <strong className="block border-t border-foreground pt-2">{title}</strong>
      <span className="mt-1 block text-muted-foreground">{approval?.name}</span>
      <span className="mt-1 block text-muted-foreground">Approved: {approval?.date}</span>
    </div>
  );
}

function PayeeSignatureBlock({ entry }: { entry: any }) {
  return (
    <div>
      <div className="voucher-signature-image-wrap flex h-[46px] items-end justify-center mb-1">
        {entry?.signatureUrl && (
          <img
            src={entry.signatureUrl}
            alt={`${entry.name} signature`}
            className="voucher-signature-image max-h-[42px] max-w-[150px] object-contain"
            style={{ maxWidth: '150px', maxHeight: '42px', width: 'auto', height: 'auto', objectFit: 'contain' }}
          />
        )}
      </div>
      <strong className="block border-t border-foreground pt-2">Payee Signature</strong>
      <span className="mt-1 block text-muted-foreground">{entry?.name}</span>
    </div>
  );
}

export default function PaymentVoucherView() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [voucher, setVoucher] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userDirectory, setUserDirectory] = useState<Record<string, UserDirectoryEntry>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({ userEmail: '', startDate: '', endDate: '' });
  const [exportingPdf, setExportingPdf] = useState(false);

  const loadClaims = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [all, settings, allUsers] = await Promise.all([
        getClaimsHistory(user.email, user.role),
        getCompanySettings(),
        getAllUsers(),
      ]);
      setClaims(all.filter(c => ['approved', 'closed'].includes(c.status.toLowerCase())));
      setCompanySettings(settings);
      setUsers(allUsers || []);
      setUserDirectory(buildUserDirectory(allUsers || []));
      setSelectedIds(new Set());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadClaims(); }, [user]);

  const filteredClaims = useMemo(() => {
    return claims.filter((claim) => {
      if (filters.userEmail && claim.userEmail !== filters.userEmail) return false;
      if (filters.startDate && formatInputDate(claim.date) < filters.startDate) return false;
      if (filters.endDate && formatInputDate(claim.date) > filters.endDate) return false;
      return true;
    });
  }, [claims, filters]);

  const selectedClaims = useMemo(
    () => filteredClaims.filter((claim) => selectedIds.has(claim.claimIdInternal)),
    [filteredClaims, selectedIds]
  );

  const selectedTotals = useMemo(() => ({
    totalWithBill: selectedClaims.reduce((sum, claim) => sum + (claim.totalWithBill || 0), 0),
    totalWithoutBill: selectedClaims.reduce((sum, claim) => sum + (claim.totalWithoutBill || 0), 0),
    totalAmount: selectedClaims.reduce((sum, claim) => sum + (claim.amount || 0), 0),
    submittedAmount: selectedClaims.reduce((sum, claim) => sum + (claim.submittedAmount || claim.amount || 0), 0),
  }), [selectedClaims]);

  const toggleSelect = (claimId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(claimId)) next.delete(claimId);
      else next.add(claimId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filteredClaims.length === 0) return;
    const allSelected = filteredClaims.every((claim) => selectedIds.has(claim.claimIdInternal));
    setSelectedIds(prev => {
      const next = new Set(prev);
      filteredClaims.forEach((claim) => {
        if (allSelected) next.delete(claim.claimIdInternal);
        else next.add(claim.claimIdInternal);
      });
      return next;
    });
  };

  const openVoucher = async (claimsForVoucher: any[]) => {
    if (claimsForVoucher.length === 0) return;
    let voucherUserDirectory = userDirectory;
    const emails = [...new Set(claimsForVoucher.map((claim) => String(claim.userEmail || '').trim().toLowerCase()).filter(Boolean))];

    if (emails.length > 0) {
      const { data, error } = await supabase
        .from('users')
        .select('email,name,signature_url')
        .in('email', emails);
      if (error) {
        console.warn('Could not refresh voucher user signatures', error);
      } else {
        voucherUserDirectory = {
          ...userDirectory,
          ...buildUserDirectory(data || []),
        };
        setUserDirectory(voucherUserDirectory);
      }
    }

    const userTotals = buildUserTotals(claimsForVoucher, voucherUserDirectory);
    const projectCodeTotals = buildProjectCodeTotals(claimsForVoucher);
    const approvals = await getClaimApprovalTrail(claimsForVoucher.map((claim) => claim.claimIdInternal));
    setVoucher({
      voucherNo: buildVoucherNo(claimsForVoucher),
      date: new Date().toISOString(),
      claims: claimsForVoucher,
      claimIds: claimsForVoucher.map((claim) => claim.claimId),
      approvals,
      paidTo: userTotals.length === 1 ? `${userTotals[0].name}${userTotals[0].email ? ` (${userTotals[0].email})` : ''}` : 'Multiple Users',
      periodFrom: claimsForVoucher.reduce((min, claim) => !min || claim.date < min ? claim.date : min, ''),
      periodTo: claimsForVoucher.reduce((max, claim) => !max || claim.date > max ? claim.date : max, ''),
      userTotals,
      projectCodeTotals,
      totalWithBill: claimsForVoucher.reduce((sum, claim) => sum + (claim.totalWithBill || 0), 0),
      totalWithoutBill: claimsForVoucher.reduce((sum, claim) => sum + (claim.totalWithoutBill || 0), 0),
      submittedAmount: claimsForVoucher.reduce((sum, claim) => sum + (claim.submittedAmount || claim.amount || 0), 0),
      amount: claimsForVoucher.reduce((sum, claim) => sum + (claim.amount || 0), 0),
    });
  };

  const getVoucherMarkup = () => {
    const content = document.getElementById('voucher-content');
    if (!content) return '';
    const clone = content.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('img.voucher-logo').forEach((img) => {
      img.setAttribute('style', 'display:block;height:52px;width:52px;object-fit:contain;margin:0;');
    });
    clone.querySelectorAll('img.voucher-signature-image').forEach((img) => {
      img.setAttribute('style', 'max-width:150px;max-height:42px;width:auto;height:auto;object-fit:contain;');
    });
    return clone.innerHTML;
  };

  const printVoucher = () => {
    const markup = getVoucherMarkup();
    if (!markup) return;
    const w = window.open('', '', 'width=1100,height=750');
    if (!w) return;
    w.document.write(`<html><head><title>Payment Voucher</title><style>${getVoucherDocumentStyles()}</style></head><body>${markup}</body></html>`);
    w.document.close();
    w.print();
  };

  const downloadVoucherPDF = async () => {
    if (!voucher) return;
    const content = document.getElementById('voucher-content');
    if (!content) return;

    setExportingPdf(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageBodyHeight = pageHeight - margin * 2;
      const imageData = canvas.toDataURL('image/png');

      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(imageData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageBodyHeight;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imageData, 'PNG', margin, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pageBodyHeight;
      }

      pdf.save(`voucher-${voucher.voucherNo}.pdf`);
      toast.success('Payment voucher PDF downloaded');
    } catch (error) {
      console.error(error);
      toast.error('Could not generate PDF. Please use Print and choose Save as PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const allFilteredSelected = filteredClaims.length > 0 && filteredClaims.every((claim) => selectedIds.has(claim.claimIdInternal));
  const voucherFileIds = voucher
    ? [...new Set(voucher.claims.flatMap((claim: any) => claim.fileIds || []))]
    : [];
  const adminApproval = voucher ? summarizeApproval(voucher, 'admin') : null;
  const managerApproval = voucher ? summarizeApproval(voucher, 'manager') : null;
  const finalApproval = voucher ? summarizeApproval(voucher, 'final') : null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
      <div className="glass-card p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Filter className="h-4 w-4" /> Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">User</Label>
            <Select value={filters.userEmail} onValueChange={(value) => setFilters(prev => ({ ...prev, userEmail: value === 'all' ? '' : value }))}>
              <SelectTrigger><SelectValue placeholder="All users" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {users.map((entry) => (
                  <SelectItem key={entry.email} value={entry.email}>{entry.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From Date</Label>
            <Input type="date" value={filters.startDate} onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">To Date</Label>
            <Input type="date" value={filters.endDate} onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))} />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setFilters({ userEmail: '', startDate: '', endDate: '' })}>Reset</Button>
            <Button size="sm" onClick={loadClaims}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
          </div>
        </div>
      </div>

      {selectedClaims.length > 0 && (
        <div className="glass-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 border-l-primary">
          <div className="text-sm">
            <strong>{selectedClaims.length}</strong> claims selected.
            <span className="ml-2 text-muted-foreground">Verified payable: Rs. {selectedTotals.totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void openVoucher(selectedClaims)}>
              <Receipt className="h-4 w-4 mr-1" /> Create Combined Voucher
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <div className="glass-card">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <h2 className="font-bold flex items-center gap-2"><Receipt className="h-5 w-5" /> Payment Vouchers</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-3 w-10">
                  <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} />
                </th>
                <th className="p-3 text-left">Claim ID</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Site</th>
                <th className="p-3 text-right">With Bill</th>
                <th className="p-3 text-right">Without Bill</th>
                <th className="p-3 text-right">Submitted</th>
                <th className="p-3 text-right">Verified Payable</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center p-8 text-muted-foreground">Loading...</td></tr>
              ) : filteredClaims.length === 0 ? (
                <tr><td colSpan={9} className="text-center p-8 text-muted-foreground">No approved claims</td></tr>
              ) : filteredClaims.map((claim) => (
                <tr key={claim.claimIdInternal} className="border-b border-border hover:bg-muted/30">
                  <td className="p-3">
                    <Checkbox checked={selectedIds.has(claim.claimIdInternal)} onCheckedChange={() => toggleSelect(claim.claimIdInternal)} />
                  </td>
                  <td className="p-3 font-mono text-xs">{claim.claimId}</td>
                  <td className="p-3">{formatDate(claim.date)}</td>
                  <td className="p-3">{claim.site}</td>
                  <td className="p-3 text-right">{money(claim.totalWithBill ?? 0)}</td>
                  <td className="p-3 text-right">{money(claim.totalWithoutBill ?? 0)}</td>
                  <td className="p-3 text-right">{money(claim.submittedAmount ?? claim.amount)}</td>
                  <td className="p-3 text-right font-medium">{money(claim.amount)}</td>
                  <td className="p-3 text-center">
                    <Button variant="ghost" size="sm" onClick={() => void openVoucher([claim])}><Eye className="h-4 w-4 mr-1" /> Voucher</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!voucher} onOpenChange={() => setVoucher(null)}>
        <DialogContent className="max-w-[96vw] lg:max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Payment Voucher - {voucher?.voucherNo}</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void downloadVoucherPDF()} disabled={exportingPdf}>
                  <Download className="h-4 w-4 mr-1" /> {exportingPdf ? 'Creating PDF...' : 'Download PDF'}
                </Button>
                <Button variant="outline" size="sm" onClick={printVoucher}><Printer className="h-4 w-4 mr-1" /> Print</Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          {voucher && (
            <div id="voucher-content">
              <div className="border-2 border-border rounded-lg p-4 sm:p-6">
                <div className="voucher-header mb-4 grid grid-cols-[56px_1fr_56px] items-start gap-3 sm:grid-cols-[64px_1fr_64px]">
                  <div className="flex justify-start">
                    {(companySettings?.logo_url || '/ipi-logo.jpg') && (
                      <img
                        src={companySettings?.logo_url || '/ipi-logo.jpg'}
                        alt="Logo"
                        width="52"
                        height="52"
                        className="voucher-logo block object-contain"
                        style={{ width: '52px', height: '52px', maxWidth: '52px', maxHeight: '52px', objectFit: 'contain' }}
                      />
                    )}
                  </div>
                  <div className="voucher-title-block text-center">
                    <h2 className="text-lg font-bold text-primary sm:text-xl">{companySettings?.company_name || 'Company'}</h2>
                    <p className="text-xs font-medium text-muted-foreground">{formatDateTime(voucher.date)}</p>
                    {companySettings?.company_subtitle && (
                      <p className="text-xs text-muted-foreground sm:text-sm">{companySettings.company_subtitle}</p>
                    )}
                    <h3 className="mt-2 border-y border-border py-1 text-base font-semibold sm:text-lg">PAYMENT VOUCHER</h3>
                  </div>
                  <div className="voucher-header-spacer" aria-hidden="true" />
                </div>

                <div className="voucher-meta mb-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                  <div><strong>Voucher No:</strong> {voucher.voucherNo}</div>
                  <div><strong>Generated On:</strong> {formatDateTime(voucher.date)}</div>
                  <div><strong>Paid To:</strong> {voucher.paidTo}</div>
                  <div><strong>Claim Count:</strong> {voucher.claims.length}</div>
                  <div><strong>Period:</strong> {formatDate(voucher.periodFrom)} to {formatDate(voucher.periodTo)}</div>
                  <div><strong>Claim IDs:</strong> {voucher.claimIds.join(', ')}</div>
                  <div><strong>Submitted Amount:</strong> {money(voucher.submittedAmount ?? voucher.amount)}</div>
                  <div><strong>Verified Payable:</strong> {money(voucher.amount ?? 0)}</div>
                </div>

                {voucher.userTotals?.length > 0 && (
                  <div className="mb-4">
                    <h4 className="voucher-section-title mb-2 text-xs font-semibold uppercase tracking-wide">User Wise Summary</h4>
                    <div className="voucher-summary-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {voucher.userTotals.map((entry: any) => (
                        <div key={entry.email || entry.name} className="voucher-box rounded-lg border border-border bg-muted/20 p-3 text-xs">
                          <div className="font-semibold break-words">{entry.name}</div>
                          {entry.email && <div className="text-xs text-muted-foreground break-words">{entry.email}</div>}
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                            <div><span className="text-muted-foreground">Claims</span><div className="font-semibold">{entry.claimCount}</div></div>
                            <div><span className="text-muted-foreground">Submitted</span><div className="font-semibold">{money(entry.submittedAmount)}</div></div>
                            <div><span className="text-muted-foreground">Payable</span><div className="font-semibold text-primary">{money(entry.verifiedPayable)}</div></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {voucher.projectCodeTotals?.length > 0 && (
                  <div className="mb-4 overflow-x-auto">
                    <h4 className="voucher-section-title mb-2 text-xs font-semibold uppercase tracking-wide">Project Code Wise Summary</h4>
                    <table className="min-w-[760px] w-full text-xs border">
                      <thead>
                        <tr className="bg-muted">
                          <th className="p-2 text-left border">Project Code</th>
                          <th className="p-2 text-right border">With Bill</th>
                          <th className="p-2 text-right border">Without Bill</th>
                          <th className="p-2 text-right border">Submitted Total</th>
                          <th className="p-2 text-right border">Verified Payable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {voucher.projectCodeTotals.map((entry: any) => (
                          <tr key={entry.projectCode}>
                            <td className="p-2 border break-words">{entry.projectCode}</td>
                            <td className="p-2 text-right border">{money(entry.totalWithBill)}</td>
                            <td className="p-2 text-right border">{money(entry.totalWithoutBill)}</td>
                            <td className="p-2 text-right border">{money(entry.submittedTotal)}</td>
                            <td className="p-2 text-right border font-semibold">{money(entry.verifiedPayable)}</td>
                          </tr>
                        ))}
                        <tr className="font-bold bg-muted/50">
                          <td className="p-2 border text-right">PROJECT CODE TOTAL</td>
                          <td className="p-2 text-right border">{money(voucher.totalWithBill ?? 0)}</td>
                          <td className="p-2 text-right border">{money(voucher.totalWithoutBill ?? 0)}</td>
                          <td className="p-2 text-right border">{money(voucher.submittedAmount ?? voucher.amount ?? 0)}</td>
                          <td className="p-2 text-right border">{money(voucher.amount ?? 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="overflow-x-auto">
                <table className="min-w-[920px] w-full text-xs border">
                  <thead>
                    <tr className="bg-muted">
                      <th className="p-2 text-left border">Claim ID</th>
                      <th className="p-2 text-left border">Expense Date</th>
                      <th className="p-2 text-left border">Category</th>
                      <th className="p-2 text-left border">Description</th>
                      <th className="p-2 text-left border">Site</th>
                      <th className="p-2 text-right border">With Bill</th>
                      <th className="p-2 text-right border">Without Bill</th>
                      <th className="p-2 text-right border">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voucher.claims.map((claim: any) => (
                      claim.expenses?.length > 0 ? (
                        <Fragment key={claim.claimIdInternal}>
                          {claim.expenses.map((expense: any, index: number) => (
                            <tr key={`${claim.claimIdInternal}-${index}`}>
                              <td className="p-2 border">{claim.claimId}</td>
                              <td className="p-2 border">{formatDate(expense.claimDate || claim.date)}</td>
                              <td className="p-2 border">{expense.category}</td>
                              <td className="p-2 border">{expense.description}</td>
                              <td className="p-2 border">{claim.site}</td>
                              <td className="p-2 text-right border">{money(expense.amountWithBill ?? 0)}</td>
                              <td className="p-2 text-right border">{money(expense.amountWithoutBill ?? 0)}</td>
                              <td className="p-2 text-right border font-medium">{money(expense.amount ?? 0)}</td>
                            </tr>
                          ))}
                          <tr key={`${claim.claimIdInternal}-subtotal`} className="bg-muted/30 font-semibold">
                            <td colSpan={5} className="p-2 border text-right">Subtotal - {claim.claimId}</td>
                            <td className="p-2 text-right border">{money(claim.totalWithBill ?? 0)}</td>
                            <td className="p-2 text-right border">{money(claim.totalWithoutBill ?? 0)}</td>
                            <td className="p-2 text-right border">{money(claim.amount ?? 0)}</td>
                          </tr>
                        </Fragment>
                      ) : (
                        <tr key={claim.claimIdInternal}>
                          <td className="p-2 border">{claim.claimId}</td>
                          <td className="p-2 border">{formatDate(claim.date)}</td>
                          <td className="p-2 border">-</td>
                          <td className="p-2 border">-</td>
                          <td className="p-2 border">{claim.site}</td>
                          <td className="p-2 text-right border">{money(claim.totalWithBill ?? 0)}</td>
                          <td className="p-2 text-right border">{money(claim.totalWithoutBill ?? 0)}</td>
                          <td className="p-2 text-right border font-medium">{money(claim.amount ?? 0)}</td>
                        </tr>
                      )
                    ))}
                    <tr className="font-bold bg-muted/50">
                      <td colSpan={5} className="p-2 border text-right">GRAND TOTAL</td>
                      <td className="p-2 text-right border">{money(voucher.totalWithBill ?? 0)}</td>
                      <td className="p-2 text-right border">{money(voucher.totalWithoutBill ?? 0)}</td>
                      <td className="p-2 text-right border">{money(voucher.amount ?? 0)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>

                <div className="voucher-total-box mt-3 p-3 bg-muted/20 rounded text-xs">
                  <div><strong>Submitted Total:</strong> {money(voucher.submittedAmount ?? voucher.amount ?? 0)}</div>
                  <div><strong>Final Verified Payable:</strong> {money(voucher.amount ?? 0)}</div>
                </div>

                <div className="voucher-total-box mt-3 p-3 bg-muted/20 rounded text-xs">
                  <strong>Verified Amount in Words:</strong> {amountToWords(voucher.amount || 0)}
                </div>

                {voucher.userTotals?.length > 0 && (
                  <div className="voucher-payee-signatures mt-8 grid grid-cols-1 gap-8 text-center text-xs sm:grid-cols-2">
                    {voucher.userTotals.map((entry: any) => (
                      <PayeeSignatureBlock key={entry.email || entry.name} entry={entry} />
                    ))}
                  </div>
                )}

                <div className="voucher-signatures mt-10 grid grid-cols-1 gap-8 text-center text-xs sm:grid-cols-3">
                  <SignatureBlock title="Prepared & Verified by Admin" approval={adminApproval} />
                  <SignatureBlock title="Approved by Manager" approval={managerApproval} />
                  <SignatureBlock title="Final Approval by HOD" approval={finalApproval} />
                </div>
              </div>
            </div>
          )}
          {voucher && (
            <div className="mt-4 rounded-lg border border-border p-4">
              <h4 className="mb-3 text-sm font-semibold">Bill Attachments for Processing</h4>
              {voucherFileIds.length > 0 ? (
                <AttachmentPreview fileIds={voucherFileIds} claimId={voucher.voucherNo} compact />
              ) : (
                <p className="text-sm italic text-muted-foreground">No bills attached to the selected claims</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
