import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuditLogs } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, Search, Shield, X, XCircle } from 'lucide-react';
import { localIsoDate } from '@/lib/claim-validation';

interface AuditLog {
  id: string;
  action: string;
  performed_by: string;
  target_type?: string;
  target_id?: string;
  details?: string;
  created_at: string;
}

const PAGE_SIZE = 15;

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function actionLabel(action: string) {
  return String(action || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function actionColor(action: string) {
  const value = action.toLowerCase();
  if (value.includes('approved') || value.includes('verified') || value.includes('paid')) return 'border-success/25 bg-success/10 text-success';
  if (value.includes('rejected') || value.includes('deleted')) return 'border-destructive/25 bg-destructive/10 text-destructive';
  if (value.includes('submitted') || value.includes('created')) return 'border-info/25 bg-info/10 text-info';
  return 'border-border bg-muted text-muted-foreground';
}

export default function AuditLogView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLogs(await getAuditLogs() as AuditLog[]);
    } catch (caught) {
      console.error('Error loading audit logs:', caught);
      setError(caught instanceof Error ? caught.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((log) => {
      const action = String(log.action || '').toLowerCase();
      if (actionFilter === 'approvals' && !/(approved|verified)/.test(action)) return false;
      if (actionFilter === 'rejections' && !action.includes('reject')) return false;
      if (actionFilter === 'payments' && !/(paid|payment|advance)/.test(action)) return false;
      if (actionFilter === 'users' && !/(user|password|session)/.test(action)) return false;
      const date = String(log.created_at || '').slice(0, 10);
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      if (!query) return true;
      return [log.action, actionLabel(log.action), log.performed_by, log.target_type, log.target_id, log.details]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [actionFilter, endDate, logs, search, startDate]);
  const today = localIsoDate();
  const summary = useMemo(() => ({
    today: logs.filter((log) => String(log.created_at || '').slice(0, 10) === today).length,
    approvals: logs.filter((log) => /(approved|verified)/.test(String(log.action || '').toLowerCase())).length,
    rejections: logs.filter((log) => String(log.action || '').toLowerCase().includes('reject')).length,
  }), [logs, today]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleLogs = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => { setPage(1); }, [actionFilter, endDate, search, startDate]);

  const resetFilters = () => {
    setSearch('');
    setActionFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
      {error ? <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">Error: {error}</div> : null}
      <div className="glass-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="flex items-center gap-2 text-xl font-bold"><Shield className="h-5 w-5 text-primary" /> Audit Trail</h2><p className="mt-1 text-sm text-muted-foreground">Trace claim, payment, user and administration activity.</p></div>
          <Button variant="outline" size="sm" onClick={() => void loadLogs()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
        </div>

        <div className="border-b border-border bg-muted/20 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Total Events</p><p className="mt-1 text-xl font-bold">{logs.length}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Today</p><p className="mt-1 flex items-center gap-2 text-xl font-bold text-info"><CalendarDays className="h-4 w-4" />{summary.today}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Approvals / Verifications</p><p className="mt-1 flex items-center gap-2 text-xl font-bold text-success"><CheckCircle2 className="h-4 w-4" />{summary.approvals}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Rejections</p><p className="mt-1 flex items-center gap-2 text-xl font-bold text-destructive"><XCircle className="h-4 w-4" />{summary.rejections}</p></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative xl:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search action, person, claim or details" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <Select value={actionFilter} onValueChange={setActionFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem><SelectItem value="approvals">Approvals / verifications</SelectItem><SelectItem value="rejections">Rejections</SelectItem><SelectItem value="payments">Payments / advances</SelectItem><SelectItem value="users">User and security</SelectItem></SelectContent></Select>
            <Input type="date" max={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Audit start date" />
            <div className="flex gap-2"><Input type="date" max={today} value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="Audit end date" /><Button variant="ghost" size="icon" onClick={resetFilters} title="Reset filters"><X className="h-4 w-4" /></Button></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Showing {filtered.length} of {logs.length} events</p>
        </div>

        <div className="max-h-[680px] overflow-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-sm"><tr className="bg-muted/50"><th className="p-3 text-left">Time</th><th className="p-3 text-left">Action</th><th className="p-3 text-left">Performed By</th><th className="p-3 text-left">Target</th><th className="p-3 text-left">Details</th></tr></thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, index) => <tr key={index} className="border-b border-border"><td colSpan={5} className="p-3"><div className="h-5 animate-pulse rounded bg-muted" /></td></tr>) : visibleLogs.length === 0 ? (
                <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">No audit events match these filters</td></tr>
              ) : visibleLogs.map((log) => (
                <tr key={log.id} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="whitespace-nowrap p-3 text-xs">{formatDate(log.created_at)}</td>
                  <td className="p-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${actionColor(log.action)}`}>{actionLabel(log.action)}</span></td>
                  <td className="p-3 text-xs">{log.performed_by || '-'}</td>
                  <td className="p-3 text-xs"><span className="text-muted-foreground">{log.target_type || '-'}</span>{log.target_id ? <span className="ml-1 font-mono font-medium text-foreground">{log.target_id}</span> : null}</td>
                  <td className="max-w-[360px] break-words p-3 text-xs text-muted-foreground">{log.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 ? <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><span className="px-2 text-sm font-medium">Page {page} of {pageCount}</span><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div> : null}
      </div>
    </div>
  );
}
