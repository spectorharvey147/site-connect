import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAccountingMasters, getJournalExportClaims, generateJournalExport, downloadJournalFile } from '@/lib/accounting-api';
import { buildSapJournal, type JournalPayload, type SapClaim, type SapMasters } from '@/lib/sap-journal';
import { localIsoDate } from '@/lib/claim-validation';

export default function SapJournalExportDialog({ claimIds, onClose, onComplete }: { claimIds: string[]; onClose: () => void; onComplete: () => Promise<void> }) {
  const [claims, setClaims] = useState<SapClaim[]>([]), [masters, setMasters] = useState<SapMasters | null>(null);
  const [postingDate, setPostingDate] = useState(localIsoDate()), [dueDate, setDueDate] = useState(localIsoDate());
  const [transactionCode, setTransactionCode] = useState('IPI');
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ batch_id: string; export_payload: JournalPayload } | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getJournalExportClaims(claimIds), getAccountingMasters()]).then(([c,m]) => {
      if (cancelled) return;
      setClaims(c); setMasters(m);
      setAllocations(Object.fromEntries(c.flatMap(claim => claim.expense_items.map(e => [e.id, Number(e.approved_amount ?? (Number(e.amount_with_bill) + Number(e.amount_without_bill))).toFixed(2)]))));
    }).catch(e => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [claimIds]);
  const options = useMemo(() => ({ postingDate, dueDate, transactionCode, allocations: Object.fromEntries(Object.entries(allocations).map(([id,amount]) => [id, amount.trim() ? Number(amount) : NaN])) }), [postingDate,dueDate,transactionCode,allocations]);
  const preview = useMemo(() => {
    if (!masters || !claims.length) return { payload: null, error: '' };
    try { return { payload: buildSapJournal(claims,masters,options), error: '' }; }
    catch(e) { return { payload: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [claims,masters,options]);
  const generate = async () => {
    if (!masters || !preview.payload) return;
    setBusy(true);
    try {
      const generated = await generateJournalExport(claims,masters,options);
      setResult({ batch_id: generated.batchId, export_payload: generated.payload });
      toast.success('SAP Excel and CSV files are ready');
      await onComplete();
    } catch(e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const download = async (kind: 'excel' | 'header' | 'details') => { if (!result) return; try { await downloadJournalFile(result,kind); } catch(e) { toast.error(e instanceof Error ? e.message : String(e)); } };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Review SAP journal export</DialogTitle><DialogDescription>Check expense allocations, GL accounts and locations before generating the Excel and CSV files.</DialogDescription></DialogHeader>
    {result ? <div className="space-y-4"><p>Export saved. Download the Excel workbook and both CSV files below. These files are also available in Generated SAP Reports.</p><div className="flex flex-wrap gap-2"><Button onClick={() => download('excel')}>Download Excel</Button><Button onClick={() => download('header')}>Claim header.csv</Button><Button onClick={() => download('details')}>Claim details.csv</Button></div></div> : <>
      {loadError ? <p role="alert" className="text-destructive">{loadError}</p> : !masters ? <p>Loading selected claims and mappings…</p> : <>
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Posting date<Input type="date" value={postingDate} disabled={busy} onChange={e => setPostingDate(e.target.value)} /></label><label className="text-sm">Due date<Input type="date" value={dueDate} disabled={busy} onChange={e => setDueDate(e.target.value)} /></label><label className="text-sm">Transaction code<Input value={transactionCode} disabled={busy} onChange={e => setTransactionCode(e.target.value)} /></label></div>
        <p className="text-sm text-muted-foreground">Allocate the approved amount to expenses. This changes the SAP allocation only; original submitted expenses stay in the claim history. Different project codes, customers and expense dates receive separate balanced journals under the same claim reference.</p>
        {claims.map(claim => <section key={claim.claim_id} className="rounded-lg border p-3 space-y-2"><h3 className="font-semibold">{claim.claim_number || claim.claim_id} — {claim.site_name}</h3><p className="text-sm">Approved: Rs. {Number(claim.verified_amount ?? claim.grand_total).toFixed(2)} · Allocated: Rs. {claim.expense_items.reduce((s,e) => s + (Number(allocations[e.id]) || 0),0).toFixed(2)}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Expense</th><th className="p-2">Project code / customer</th><th className="p-2">Date</th><th className="p-2">Submitted</th><th className="p-2">SAP amount</th></tr></thead><tbody>{claim.expense_items.map(e => <tr key={e.id}><td className="p-2">{e.category}</td><td className="p-2">{e.project_code}<br/>{e.customer_name || claim.customer_name}</td><td className="p-2 whitespace-nowrap">{e.expense_date}</td><td className="p-2">{(Number(e.amount_with_bill)+Number(e.amount_without_bill)).toFixed(2)}</td><td className="p-2"><Input className="min-w-28" aria-label={`${claim.claim_number || claim.claim_id}: ${e.category} ${e.expense_date} SAP amount`} type="number" min="0" step="0.01" value={allocations[e.id] ?? ''} readOnly={e.approved_amount != null} disabled={busy} onChange={event => setAllocations(a => ({ ...a,[e.id]:event.target.value }))}/></td></tr>)}</tbody></table></div></section>)}
        {preview.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{preview.error}</p>}
        {preview.payload && <><p className="text-sm">{preview.payload.claims.length} claims · {preview.payload.journalClaims.length} balanced journals · Rs. {preview.payload.claims.reduce((sum,c) => sum+c.amount,0).toFixed(2)}</p><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Review GL accounts and locations</summary><div className="overflow-x-auto"><table className="mt-3 w-full text-sm"><thead><tr className="text-left"><th className="p-2">Claim</th><th className="p-2">SAP project</th><th className="p-2">Location</th><th className="p-2">Account</th><th className="p-2">Debit</th><th className="p-2">Credit</th><th className="p-2">Distribution rule</th></tr></thead><tbody>{preview.payload.details.slice(2).map((row,i) => { const header = preview.payload!.headers.find((h,j) => j>1 && h[0]===row[0]); return <tr key={i}>{[header?.[3],header?.[7],header?.[11],row[3],row[4],row[5],row[6]].map((v,j) => <td className="p-2" key={j}>{v}</td>)}</tr>; })}</tbody></table></div></details></>}
        <Button disabled={busy || !preview.payload} onClick={generate}>{busy ? 'Generating…' : 'Generate Excel & CSV files'}</Button>
      </>}
    </>}
  </DialogContent></Dialog>;
}
