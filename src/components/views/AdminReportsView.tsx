import { useEffect, useMemo, useState } from 'react';
import { Download, FileBarChart, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminReportData, type AdminReportClaim, type AdminReportUser } from '@/lib/claims-api';
import { exportToCSV } from '@/lib/export-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const UNASSIGNED = '__unassigned__';

function normalizeStatus(value: string) {
  return String(value || '').trim().toLowerCase();
}

function isPendingManager(value: string) {
  const status = normalizeStatus(value);
  return status === 'pending manager approval' || status === 'admin verified';
}

function isRejected(value: string) {
  return normalizeStatus(value).includes('reject');
}

function isClosed(value: string) {
  const status = normalizeStatus(value);
  return ['paid', 'closed', 'settled'].includes(status);
}

function isOpen(value: string) {
  return !isRejected(value) && !isClosed(value);
}

function ageInDays(date: string) {
  const created = new Date(date).getTime();
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, Math.floor((Date.now() - created) / 86400000));
}

function formatAmount(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ManagerReportRow {
  email: string;
  name: string;
  assignedUsers: number;
  totalClaims: number;
  pendingManager: number;
  otherPending: number;
  closed: number;
  rejected: number;
  oldestPending: number;
  amount: number;
}

export default function AdminReportsView() {
  const [claims, setClaims] = useState<AdminReportClaim[]>([]);
  const [users, setUsers] = useState<AdminReportUser[]>([]);
  const [managerFilter, setManagerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAdminReportData();
      setClaims(result.claims);
      setUsers(result.users);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const managers = useMemo(
    () => users.filter((entry) => ['Manager', 'Super Admin'].includes(entry.role)),
    [users],
  );
  const managerNames = useMemo(
    () => Object.fromEntries(managers.map((manager) => [manager.email.toLowerCase(), manager.name])),
    [managers],
  );
  const statuses = useMemo(
    () => [...new Set(claims.map((claim) => claim.status).filter(Boolean))].sort(),
    [claims],
  );
  const filteredClaims = useMemo(() => {
    const query = search.trim().toLowerCase();
    const from = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const through = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;
    return claims.filter((claim) => {
      const manager = claim.managerEmail.toLowerCase();
      const created = new Date(claim.date).getTime();
      const matchesManager = managerFilter === 'all'
        || (managerFilter === UNASSIGNED ? !manager : manager === managerFilter.toLowerCase());
      const matchesStatus = statusFilter === 'all' || claim.status === statusFilter;
      const matchesDate = (from == null || created >= from) && (through == null || created <= through);
      const matchesSearch = !query
        || claim.claimId.toLowerCase().includes(query)
        || claim.submittedBy.toLowerCase().includes(query)
        || claim.userEmail.toLowerCase().includes(query)
        || claim.site.toLowerCase().includes(query);
      return matchesManager && matchesStatus && matchesDate && matchesSearch;
    });
  }, [claims, endDate, managerFilter, search, startDate, statusFilter]);

  const managerRows = useMemo<ManagerReportRow[]>(() => {
    const knownEmails = new Set<string>();
    if (managerFilter === 'all') {
      managers.forEach((manager) => knownEmails.add(manager.email.toLowerCase()));
    } else if (managerFilter === UNASSIGNED) {
      knownEmails.add('');
    } else {
      knownEmails.add(managerFilter.toLowerCase());
    }
    filteredClaims.forEach((claim) => knownEmails.add(claim.managerEmail.toLowerCase()));
    if (filteredClaims.some((claim) => !claim.managerEmail)) knownEmails.add('');

    return [...knownEmails].map((email) => {
      const managerClaims = filteredClaims.filter((claim) => claim.managerEmail.toLowerCase() === email);
      const openClaims = managerClaims.filter((claim) => isOpen(claim.status));
      return {
        email,
        name: email ? managerNames[email] || email : 'Unassigned',
        assignedUsers: email ? users.filter((entry) => entry.active && entry.managerEmail.toLowerCase() === email).length : users.filter((entry) => entry.active && entry.role === 'User' && !entry.managerEmail).length,
        totalClaims: managerClaims.length,
        pendingManager: managerClaims.filter((claim) => isPendingManager(claim.status)).length,
        otherPending: managerClaims.filter((claim) => isOpen(claim.status) && !isPendingManager(claim.status)).length,
        closed: managerClaims.filter((claim) => isClosed(claim.status)).length,
        rejected: managerClaims.filter((claim) => isRejected(claim.status)).length,
        oldestPending: openClaims.reduce((oldest, claim) => Math.max(oldest, ageInDays(claim.date)), 0),
        amount: managerClaims.reduce((sum, claim) => sum + claim.amount, 0),
      };
    }).filter((row) => row.totalClaims > 0 || row.assignedUsers > 0)
      .sort((a, b) => b.pendingManager - a.pendingManager || b.otherPending - a.otherPending || a.name.localeCompare(b.name));
  }, [filteredClaims, managerFilter, managerNames, managers, users]);

  const statusRows = useMemo(() => {
    const grouped = new Map<string, { count: number; amount: number }>();
    filteredClaims.forEach((claim) => {
      const current = grouped.get(claim.status) || { count: 0, amount: 0 };
      current.count += 1;
      current.amount += claim.amount;
      grouped.set(claim.status, current);
    });
    return [...grouped.entries()].map(([status, values]) => ({ status, ...values })).sort((a, b) => b.count - a.count);
  }, [filteredClaims]);

  const agingRows = useMemo(() => {
    const buckets = [
      { label: '0-7 days', min: 0, max: 7 },
      { label: '8-15 days', min: 8, max: 15 },
      { label: '16-30 days', min: 16, max: 30 },
      { label: '30+ days', min: 31, max: Number.POSITIVE_INFINITY },
    ];
    const openClaims = filteredClaims.filter((claim) => isOpen(claim.status));
    return buckets.map((bucket) => {
      const matches = openClaims.filter((claim) => {
        const age = ageInDays(claim.date);
        return age >= bucket.min && age <= bucket.max;
      });
      return {
        label: bucket.label,
        count: matches.length,
        amount: matches.reduce((sum, claim) => sum + claim.amount, 0),
      };
    });
  }, [filteredClaims]);

  const summary = useMemo(() => ({
    total: filteredClaims.length,
    open: filteredClaims.filter((claim) => isOpen(claim.status)).length,
    pendingManager: filteredClaims.filter((claim) => isPendingManager(claim.status)).length,
    closed: filteredClaims.filter((claim) => isClosed(claim.status)).length,
    rejected: filteredClaims.filter((claim) => isRejected(claim.status)).length,
  }), [filteredClaims]);

  const exportManagerReport = () => {
    if (!managerRows.length) {
      toast.info('There is no report data to export.');
      return;
    }
    exportToCSV(managerRows, `manager-claim-report-${new Date().toISOString().slice(0, 10)}`, [
      { key: 'name', label: 'Manager' },
      { key: 'email', label: 'Manager Email' },
      { key: 'assignedUsers', label: 'Assigned Users' },
      { key: 'totalClaims', label: 'Total Claims' },
      { key: 'pendingManager', label: 'Pending With Manager' },
      { key: 'otherPending', label: 'Other Pending' },
      { key: 'closed', label: 'Paid / Closed' },
      { key: 'rejected', label: 'Rejected' },
      { key: 'oldestPending', label: 'Oldest Pending Days' },
      { key: 'amount', label: 'Claim Amount' },
    ]);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4 duration-500">
      <div className="glass-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold"><FileBarChart className="h-5 w-5 text-primary" /> Reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review manager workload, claim status, and pending age.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
            <Button size="sm" onClick={exportManagerReport}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
          </div>
        </div>
      </div>

      <section className="border-y bg-card/50 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div><Label>Manager</Label><Select value={managerFilter} onValueChange={setManagerFilter}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All managers</SelectItem><SelectItem value={UNASSIGNED}>Unassigned</SelectItem>{managers.map((manager) => <SelectItem key={manager.email} value={manager.email}>{manager.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Status</Label><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{statuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
          <div><Label htmlFor="report-start">From</Label><Input id="report-start" type="date" className="mt-1" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
          <div><Label htmlFor="report-end">To</Label><Input id="report-end" type="date" className="mt-1" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
          <div><Label htmlFor="report-search">Search</Label><div className="relative mt-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="report-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Claim, user, site" /></div></div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Total Claims</p><p className="mt-1 text-2xl font-bold">{summary.total}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">All Pending</p><p className="mt-1 text-2xl font-bold text-warning">{summary.open}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Pending With Manager</p><p className="mt-1 text-2xl font-bold text-destructive">{summary.pendingManager}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Paid / Closed</p><p className="mt-1 text-2xl font-bold text-success">{summary.closed}</p></div>
        <div className="rounded-lg border bg-card p-4"><p className="text-xs text-muted-foreground">Rejected</p><p className="mt-1 text-2xl font-bold text-muted-foreground">{summary.rejected}</p></div>
      </div>

      {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}

      <Tabs defaultValue="manager" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="manager">Manager-wise</TabsTrigger>
          <TabsTrigger value="status">Status summary</TabsTrigger>
          <TabsTrigger value="aging">Pending aging</TabsTrigger>
          <TabsTrigger value="claims">Claim details</TabsTrigger>
        </TabsList>

        <TabsContent value="manager">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table><TableHeader><TableRow><TableHead>Manager</TableHead><TableHead className="text-right">Users</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Pending With Manager</TableHead><TableHead className="text-right">Other Pending</TableHead><TableHead className="text-right">Paid / Closed</TableHead><TableHead className="text-right">Oldest Pending</TableHead></TableRow></TableHeader>
              <TableBody>{managerRows.length ? managerRows.map((row) => <TableRow key={row.email || UNASSIGNED}><TableCell><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.email || 'No manager assigned'}</p></TableCell><TableCell className="text-right">{row.assignedUsers}</TableCell><TableCell className="text-right">{row.totalClaims}</TableCell><TableCell className="text-right font-semibold text-destructive">{row.pendingManager}</TableCell><TableCell className="text-right text-warning">{row.otherPending}</TableCell><TableCell className="text-right text-success">{row.closed}</TableCell><TableCell className="text-right">{row.oldestPending ? `${row.oldestPending} days` : '-'}</TableCell></TableRow>) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{loading ? 'Loading reports...' : 'No manager report data.'}</TableCell></TableRow>}</TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="status">
          <div className="overflow-hidden rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead>Status</TableHead><TableHead className="text-right">Claims</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{statusRows.map((row) => <TableRow key={row.status}><TableCell><Badge variant="outline">{row.status}</Badge></TableCell><TableCell className="text-right font-semibold">{row.count}</TableCell><TableCell className="text-right">{formatAmount(row.amount)}</TableCell></TableRow>)}</TableBody></Table></div>
        </TabsContent>

        <TabsContent value="aging">
          <div className="overflow-hidden rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead>Pending age</TableHead><TableHead className="text-right">Claims</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{agingRows.map((row) => <TableRow key={row.label}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right font-semibold">{row.count}</TableCell><TableCell className="text-right">{formatAmount(row.amount)}</TableCell></TableRow>)}</TableBody></Table></div>
        </TabsContent>

        <TabsContent value="claims">
          <div className="overflow-hidden rounded-lg border bg-card"><Table><TableHeader><TableRow><TableHead>Claim</TableHead><TableHead>Employee</TableHead><TableHead>Manager</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Age</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{filteredClaims.length ? filteredClaims.map((claim) => <TableRow key={claim.claimId}><TableCell><p className="font-medium">{claim.claimId}</p><p className="text-xs text-muted-foreground">{new Date(claim.date).toLocaleDateString('en-IN')}</p></TableCell><TableCell><p>{claim.submittedBy}</p><p className="text-xs text-muted-foreground">{claim.userEmail}</p></TableCell><TableCell>{claim.managerEmail ? managerNames[claim.managerEmail.toLowerCase()] || claim.managerEmail : <Badge variant="outline">Unassigned</Badge>}</TableCell><TableCell><Badge variant="outline">{claim.status}</Badge></TableCell><TableCell className="text-right">{isOpen(claim.status) ? `${ageInDays(claim.date)} days` : '-'}</TableCell><TableCell className="text-right font-medium">{formatAmount(claim.amount)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No claims match these filters.</TableCell></TableRow>}</TableBody></Table></div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
