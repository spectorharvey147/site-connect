import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  downloadSapPreviewExcel,
  generateSapExcelExport,
  getSapExportBatchClaims,
  getSapExportBatches,
  getSapHistoricalClaims,
  getSapPendingClaims,
  logSapReportDownloaded,
} from '@/lib/claims-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveOverlay } from '@/components/ui/responsive-overlay';

function formatCurrency(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
}

export default function AccountsSapEntryView() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [historicalClaims, setHistoricalClaims] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedHistorical, setSelectedHistorical] = useState<string[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [loadingHistorical, setLoadingHistorical] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [viewBatch, setViewBatch] = useState<any | null>(null);
  const [batchClaims, setBatchClaims] = useState<any[]>([]);
  const [loadingBatchClaims, setLoadingBatchClaims] = useState(false);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedHistoricalSet = useMemo(() => new Set(selectedHistorical), [selectedHistorical]);
  const allSelected = claims.length > 0 && selected.length === claims.length;
  const allHistoricalSelected = historicalClaims.length > 0 && selectedHistorical.length === historicalClaims.length;

  const loadClaims = async () => {
    setLoadingClaims(true);
    try {
      const rows = await getSapPendingClaims();
      setClaims(rows);
      setSelected((current) => current.filter((id) => rows.some((claim) => claim.claimIdInternal === id)));
    } catch (error: any) {
      toast.error(error.message || 'Failed to load verified claims');
    } finally {
      setLoadingClaims(false);
    }
  };

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      setReports(await getSapExportBatches());
    } catch (error: any) {
      toast.error(error.message || 'Failed to load SAP reports');
    } finally {
      setLoadingReports(false);
    }
  };

  const loadHistoricalClaims = async () => {
    setLoadingHistorical(true);
    try {
      const rows = await getSapHistoricalClaims();
      setHistoricalClaims(rows);
      setSelectedHistorical((current) => current.filter((id) => rows.some((claim) => claim.claimIdInternal === id)));
    } catch (error: any) {
      toast.error(error.message || 'Failed to load historical SAP claims');
    } finally {
      setLoadingHistorical(false);
    }
  };

  useEffect(() => {
    void loadClaims();
    void loadHistoricalClaims();
    void loadReports();
  }, []);

  const toggleClaim = (claimId: string) => {
    setSelected((current) => current.includes(claimId) ? current.filter((id) => id !== claimId) : [...current, claimId]);
  };

  const toggleHistoricalClaim = (claimId: string) => {
    setSelectedHistorical((current) => current.includes(claimId) ? current.filter((id) => id !== claimId) : [...current, claimId]);
  };

  const handleGenerate = async () => {
    if (!user || selected.length === 0) return;
    setGenerating(true);
    try {
      const result = await generateSapExcelExport(selected, user.email);
      toast.success(`Generated ${result.batchId}`);
      setSelected([]);
      await Promise.all([loadClaims(), loadReports()]);
      if (result.fileUrl) window.open(result.fileUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate SAP Excel');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (report: any) => {
    if (!report.file_url) {
      toast.error('No file is available for this batch');
      return;
    }
    if (user?.email) void logSapReportDownloaded(report.batch_id, user.email);
    window.open(report.file_url, '_blank', 'noopener,noreferrer');
  };

  const handlePreviewDownload = async () => {
    if (!user || selectedHistorical.length === 0) return;
    setPreviewing(true);
    try {
      const result = await downloadSapPreviewExcel(selectedHistorical, user.email);
      toast.success(`Downloaded ${result.fileName}`);
      if (result.fileUrl) window.open(result.fileUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast.error(error.message || 'Failed to download SAP preview');
    } finally {
      setPreviewing(false);
    }
  };

  const handleViewClaims = async (report: any) => {
    setViewBatch(report);
    setLoadingBatchClaims(true);
    try {
      setBatchClaims(await getSapExportBatchClaims(report.batch_id));
    } catch (error: any) {
      toast.error(error.message || 'Failed to load batch claims');
    } finally {
      setLoadingBatchClaims(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-bold"><FileSpreadsheet className="h-5 w-5" /> Accounts SAP Entry</h2>
          <p className="text-sm text-muted-foreground">Export accounts-verified claims to SAP and keep batch history.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void loadClaims(); void loadHistoricalClaims(); void loadReports(); }}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="claims" className="space-y-4">
        <TabsList>
          <TabsTrigger value="claims">Verified Claims</TabsTrigger>
          <TabsTrigger value="historical">Historical Preview</TabsTrigger>
          <TabsTrigger value="reports">Generated SAP Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="claims" className="space-y-3">
          <div className="sticky top-16 z-10 flex flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {selected.length} selected from {claims.length} pending claim{claims.length === 1 ? '' : 's'}
            </div>
            <Button onClick={handleGenerate} disabled={selected.length === 0 || generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
              Generate SAP Excel
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="min-w-[1540px] w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-12 p-3 text-center">
                    <Checkbox checked={allSelected} onCheckedChange={(checked) => setSelected(checked ? claims.map((claim) => claim.claimIdInternal) : [])} />
                  </th>
                  <th className="p-3 text-left">Claim ID</th>
                  <th className="p-3 text-left">Project Code</th>
                  <th className="p-3 text-left">Customer Name</th>
                  <th className="p-3 text-left">Employee Name</th>
                  <th className="p-3 text-left">Claim Submitted Date</th>
                  <th className="p-3 text-left">Service Type</th>
                  <th className="p-3 text-right">Boarding Amount</th>
                  <th className="p-3 text-right">Other Amount</th>
                  <th className="p-3 text-right">DA Amount</th>
                  <th className="p-3 text-right">Travel Amount</th>
                  <th className="p-3 text-right">Grand Total</th>
                  <th className="p-3 text-left">Remarks</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingClaims ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={index} className="border-t border-border">
                      {Array.from({ length: 14 }).map((__, cell) => <td key={cell} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))
                ) : claims.length === 0 ? (
                  <tr><td colSpan={14} className="p-8 text-center text-muted-foreground">No fresh accounts-verified claims pending SAP export</td></tr>
                ) : claims.map((claim) => (
                  <tr key={claim.claimIdInternal} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 text-center"><Checkbox checked={selectedSet.has(claim.claimIdInternal)} onCheckedChange={() => toggleClaim(claim.claimIdInternal)} /></td>
                    <td className="p-3 font-mono text-xs">{claim.claimId}</td>
                    <td className="p-3">{claim.projectCode || '-'}</td>
                    <td className="p-3">{claim.customerName || '-'}</td>
                    <td className="p-3">{claim.employeeName}</td>
                    <td className="p-3">{formatDate(claim.submittedDate)}</td>
                    <td className="p-3">{claim.serviceType}</td>
                    <td className="p-3 text-right">{formatCurrency(claim.boardingAmount)}</td>
                    <td className="p-3 text-right">{formatCurrency(claim.otherAmount)}</td>
                    <td className="p-3 text-right">{formatCurrency(claim.daAmount)}</td>
                    <td className="p-3 text-right">{formatCurrency(claim.travelAmount)}</td>
                    <td className="p-3 text-right font-bold text-primary">{formatCurrency(claim.grandTotal)}</td>
                    <td className="max-w-[260px] p-3">{claim.remarks || '-'}</td>
                    <td className="p-3 text-center"><Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">{claim.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="historical" className="space-y-3">
          <div className="sticky top-16 z-10 flex flex-col gap-3 rounded-md border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {selectedHistorical.length} selected from {historicalClaims.length} previous accounts/paid claim{historicalClaims.length === 1 ? '' : 's'}
            </div>
            <Button onClick={handlePreviewDownload} disabled={selectedHistorical.length === 0 || previewing}>
              {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download SAP Preview
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="min-w-[1540px] w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="w-12 p-3 text-center">
                    <Checkbox checked={allHistoricalSelected} onCheckedChange={(checked) => setSelectedHistorical(checked ? historicalClaims.map((claim) => claim.claimIdInternal) : [])} />
                  </th>
                  <th className="p-3 text-left">Claim ID</th>
                  <th className="p-3 text-left">Project Code</th>
                  <th className="p-3 text-left">Customer Name</th>
                  <th className="p-3 text-left">Employee Name</th>
                  <th className="p-3 text-left">Claim Submitted Date</th>
                  <th className="p-3 text-left">Service Type</th>
                  <th className="p-3 text-right">Boarding Amount</th>
                  <th className="p-3 text-right">Other Amount</th>
                  <th className="p-3 text-right">DA Amount</th>
                  <th className="p-3 text-right">Travel Amount</th>
                  <th className="p-3 text-right">Grand Total</th>
                  <th className="p-3 text-left">Remarks</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistorical ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <tr key={index} className="border-t border-border">
                      {Array.from({ length: 14 }).map((__, cell) => <td key={cell} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))
                ) : historicalClaims.length === 0 ? (
                  <tr><td colSpan={14} className="p-8 text-center text-muted-foreground">No previous accounts verified or paid claims found</td></tr>
                ) : historicalClaims.map((claim) => (
                  <tr key={claim.claimIdInternal} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 text-center"><Checkbox checked={selectedHistoricalSet.has(claim.claimIdInternal)} onCheckedChange={() => toggleHistoricalClaim(claim.claimIdInternal)} /></td>
                    <td className="p-3 font-mono text-xs">{claim.claimId}</td>
                    <td className="p-3">{claim.projectCode || '-'}</td>
                    <td className="p-3">{claim.customerName || '-'}</td>
                    <td className="p-3">{claim.employeeName}</td>
                    <td className="p-3">{formatDate(claim.submittedDate)}</td>
                    <td className="p-3">{claim.serviceType}</td>
                    <td className="p-3 text-right">{formatCurrency(claim.boardingAmount)}</td>
                    <td className="p-3 text-right">{formatCurrency(claim.otherAmount)}</td>
                    <td className="p-3 text-right">{formatCurrency(claim.daAmount)}</td>
                    <td className="p-3 text-right">{formatCurrency(claim.travelAmount)}</td>
                    <td className="p-3 text-right font-bold text-primary">{formatCurrency(claim.grandTotal)}</td>
                    <td className="max-w-[260px] p-3">{claim.remarks || '-'}</td>
                    <td className="p-3 text-center"><Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{claim.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="reports">
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-left">Batch ID</th>
                  <th className="p-3 text-left">Generated Date & Time</th>
                  <th className="p-3 text-left">Generated By</th>
                  <th className="p-3 text-right">No of Claims</th>
                  <th className="p-3 text-right">Total Amount</th>
                  <th className="p-3 text-center">Download</th>
                  <th className="p-3 text-center">View Claims</th>
                </tr>
              </thead>
              <tbody>
                {loadingReports ? (
                  Array.from({ length: 3 }).map((_, index) => (
                    <tr key={index} className="border-t border-border">
                      {Array.from({ length: 7 }).map((__, cell) => <td key={cell} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                    </tr>
                  ))
                ) : reports.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No SAP reports generated yet</td></tr>
                ) : reports.map((report) => (
                  <tr key={report.batch_id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{report.batch_id}</td>
                    <td className="p-3">{formatDateTime(report.generated_at)}</td>
                    <td className="p-3">{report.generated_by}</td>
                    <td className="p-3 text-right">{report.total_claims}</td>
                    <td className="p-3 text-right font-bold text-primary">{formatCurrency(report.total_amount)}</td>
                    <td className="p-3 text-center"><Button variant="ghost" size="sm" onClick={() => void handleDownload(report)}><Download className="h-4 w-4" /></Button></td>
                    <td className="p-3 text-center"><Button variant="ghost" size="sm" onClick={() => void handleViewClaims(report)}><Eye className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <ResponsiveOverlay
        open={!!viewBatch}
        onOpenChange={(open) => !open && setViewBatch(null)}
        title={`SAP Batch Claims - ${viewBatch?.batch_id || ''}`}
        desktopClassName="max-w-4xl"
        mobileClassName="max-h-[94svh]"
        bodyClassName="max-h-[70vh] overflow-y-auto"
      >
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left">Claim ID</th>
                <th className="p-3 text-left">Employee Name</th>
                <th className="p-3 text-left">Project</th>
                <th className="p-3 text-right">Total Amount</th>
                <th className="p-3 text-center">SAP Status</th>
              </tr>
            </thead>
            <tbody>
              {loadingBatchClaims ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <tr key={index} className="border-t border-border">
                    {Array.from({ length: 5 }).map((__, cell) => <td key={cell} className="p-3"><Skeleton className="h-4 w-full" /></td>)}
                  </tr>
                ))
              ) : batchClaims.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No claims found for this batch</td></tr>
              ) : batchClaims.map((claim) => (
                <tr key={claim.claimIdInternal} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{claim.claimId}</td>
                  <td className="p-3">{claim.employeeName}</td>
                  <td className="p-3">{claim.projectCode || '-'}</td>
                  <td className="p-3 text-right font-medium">{formatCurrency(claim.grandTotal)}</td>
                  <td className="p-3 text-center"><Badge className="bg-green-100 text-green-800 hover:bg-green-100">{claim.sapStatus}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ResponsiveOverlay>
    </div>
  );
}
