import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserBalanceSummary } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Scale, Search, Users, WalletCards, X } from 'lucide-react';
import { exportBalancesCSV } from '@/lib/export-utils';
import { Skeleton } from '@/components/ui/skeleton';
import RupeeIcon from '@/components/icons/RupeeIcon';

interface UserBalanceSummary {
  name: string;
  email: string;
  role: string;
  initialAdvance: number;
  totalClaimAmount: number;
  pendingClaims: number;
  approvedClaims: number;
  rejectedClaims?: number;
  currentBalance: number;
}

const PAGE_SIZE = 10;

function formatCurrency(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function UserBalanceView() {
  const { user } = useAuth();
  const [data, setData] = useState<UserBalanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [sort, setSort] = useState('balance-desc');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setData(await getUserBalanceSummary(user.email, user.role) as UserBalanceSummary[]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const roles = useMemo(() => [...new Set(data.map((entry) => entry.role).filter(Boolean))].sort(), [data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data
      .filter((entry) => !query || entry.name.toLowerCase().includes(query) || entry.email.toLowerCase().includes(query))
      .filter((entry) => roleFilter === 'all' || entry.role === roleFilter)
      .filter((entry) => balanceFilter === 'all' || (balanceFilter === 'available' ? entry.currentBalance >= 0 : entry.currentBalance < 0))
      .sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'pending-desc') return b.pendingClaims - a.pendingClaims;
        return b.currentBalance - a.currentBalance;
      });
  }, [balanceFilter, data, roleFilter, search, sort]);
  const totals = useMemo(() => filtered.reduce((summary, entry) => ({
    advances: summary.advances + Number(entry.initialAdvance || 0),
    pending: summary.pending + Number(entry.pendingClaims || 0),
    balances: summary.balances + Number(entry.currentBalance || 0),
  }), { advances: 0, pending: 0, balances: 0 }), [filtered]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => { setPage(1); }, [balanceFilter, roleFilter, search, sort]);

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setBalanceFilter('all');
    setSort('balance-desc');
    setPage(1);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="glass-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><Scale className="h-5 w-5 text-primary" /> User Balance Summary</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review advances, claim values and current employee balances.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportBalancesCSV(filtered)} disabled={filtered.length === 0}><Download className="mr-1 h-4 w-4" /> Export CSV</Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          </div>
        </div>

        <div className="border-b border-border bg-muted/20 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs font-medium text-muted-foreground">Matching Users</p><p className="mt-1 flex items-center gap-2 text-xl font-bold"><Users className="h-4 w-4 text-primary" />{filtered.length}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs font-medium text-muted-foreground">Initial Advances</p><p className="mt-1 text-xl font-bold text-info">{formatCurrency(totals.advances)}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs font-medium text-muted-foreground">Pending Claims</p><p className="mt-1 text-xl font-bold text-warning">{formatCurrency(totals.pending)}</p></div>
            <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs font-medium text-muted-foreground">Combined Balance</p><p className={`mt-1 text-xl font-bold ${totals.balances >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(totals.balances)}</p></div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative xl:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" placeholder="Search employee name or email" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <Select value={roleFilter} onValueChange={setRoleFilter}><SelectTrigger><SelectValue placeholder="All roles" /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{roles.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select>
            <Select value={balanceFilter} onValueChange={setBalanceFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All balances</SelectItem><SelectItem value="available">Zero or above</SelectItem><SelectItem value="negative">Negative balances</SelectItem></SelectContent></Select>
            <div className="flex gap-2"><Select value={sort} onValueChange={setSort}><SelectTrigger className="flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="balance-desc">Highest balance</SelectItem><SelectItem value="pending-desc">Highest pending</SelectItem><SelectItem value="name">Employee name</SelectItem></SelectContent></Select><Button variant="ghost" size="icon" onClick={resetFilters} title="Reset filters"><X className="h-4 w-4" /></Button></div>
          </div>
        </div>

        <div className="max-h-[680px] overflow-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-sm"><tr className="bg-muted/50">
              <th className="p-3 text-left">User</th><th className="p-3 text-right">Initial Advance</th><th className="p-3 text-right">Total Submitted</th><th className="p-3 text-right">Pending</th><th className="p-3 text-right">Approved / Paid</th><th className="p-3 text-right">Rejected</th><th className="p-3 text-right">Current Balance</th>
            </tr></thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, row) => (
                <tr key={row} className="border-b border-border">{Array.from({ length: 7 }).map((__, column) => <td key={column} className="p-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
              )) : visibleRows.length === 0 ? (
                <tr><td colSpan={7} className="p-10 text-center text-muted-foreground"><WalletCards className="mx-auto mb-2 h-7 w-7 opacity-50" />No users match these filters</td></tr>
              ) : visibleRows.map((entry) => (
                <tr key={entry.email} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="p-3"><div className="font-medium">{entry.name}</div><div className="text-xs text-muted-foreground">{entry.email} · {entry.role}</div></td>
                  <td className="p-3 text-right">{formatCurrency(entry.initialAdvance)}</td><td className="p-3 text-right">{formatCurrency(entry.totalClaimAmount)}</td><td className="p-3 text-right text-warning">{formatCurrency(entry.pendingClaims)}</td><td className="p-3 text-right text-success">{formatCurrency(entry.approvedClaims)}</td><td className="p-3 text-right text-destructive">{formatCurrency(entry.rejectedClaims ?? 0)}</td>
                  <td className="p-3 text-right"><Badge variant="outline" className={entry.currentBalance >= 0 ? 'border-success/25 bg-success/10 text-success' : 'border-destructive/25 bg-destructive/10 text-destructive'}><RupeeIcon className="mr-1 h-3.5 w-3.5" />{formatCurrency(entry.currentBalance).replace('Rs. ', '')}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
            <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><span className="px-2 text-sm font-medium">Page {page} of {pageCount}</span><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
