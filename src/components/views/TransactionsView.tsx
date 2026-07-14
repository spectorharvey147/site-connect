import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getTransactions, getUsersDirectory } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Filter, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { exportLedgerExcel, exportLedgerPDF, LedgerExportTransaction } from '@/lib/export-utils';
import { Badge } from '@/components/ui/badge';
import { localIsoDate } from '@/lib/claim-validation';

interface DirectoryUser {
  email: string;
  name: string;
  manager_email?: string;
}

const PAGE_SIZE = 12;

function formatDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(value: number) {
  return `Rs. ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransactionsView() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<LedgerExportTransaction[]>([]);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [filters, setFilters] = useState({ userEmail: 'all', startDate: '', endDate: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [direction, setDirection] = useState<'all' | 'credit' | 'debit'>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const canFilterByUser = user?.role === 'Admin' || user?.role === 'Super Admin' || user?.role === 'Manager' || user?.role === 'Accounts';

  const visibleUsers = useMemo(() => {
    if (!user) return [];
    if (user.role === 'Manager') {
      return users.filter((item) => item.email === user.email || item.manager_email === user.email);
    }
    return users;
  }, [user, users]);

  const selectedUserLabel = useMemo(() => {
    if (!canFilterByUser || filters.userEmail === 'all') return canFilterByUser ? 'All permitted users' : user?.email || '';
    const match = visibleUsers.find((item) => item.email === filters.userEmail);
    return match ? `${match.name} (${match.email})` : filters.userEmail;
  }, [canFilterByUser, filters.userEmail, user?.email, visibleUsers]);

  const filteredTransactions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return transactions.filter((transaction) => {
      const isCredit = Number(transaction.credit || 0) > 0;
      if (direction === 'credit' && !isCredit) return false;
      if (direction === 'debit' && isCredit) return false;
      if (!query) return true;
      return [transaction.name, transaction.email, transaction.description, transaction.claimId, transaction.type]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [direction, searchTerm, transactions]);

  const summary = useMemo(() => filteredTransactions.reduce(
    (total, transaction) => ({
      credits: total.credits + Number(transaction.credit || 0),
      debits: total.debits + Number(transaction.debit || 0),
    }),
    { credits: 0, debits: 0 },
  ), [filteredTransactions]);
  const pageCount = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTransactions = useMemo(
    () => filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTransactions, page],
  );

  const fetchTransactions = useCallback(async (nextFilters: typeof filters) => {
    if (!user) return;
    setLoading(true);
    try {
      const queryFilters = {
        userEmail: canFilterByUser && nextFilters.userEmail !== 'all' ? nextFilters.userEmail : undefined,
        startDate: nextFilters.startDate || undefined,
        endDate: nextFilters.endDate || undefined,
      };
      const data = await getTransactions(user.email, user.role, queryFilters);
      setTransactions(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [canFilterByUser, user]);

  const loadTransactions = () => fetchTransactions(filters);

  useEffect(() => {
    const initialFilters = { userEmail: 'all', startDate: '', endDate: '' };
    setFilters(initialFilters);
    void fetchTransactions(initialFilters);
  }, [fetchTransactions]);
  useEffect(() => { setPage(1); }, [direction, searchTerm, transactions]);
  useEffect(() => {
    if (canFilterByUser) {
      getUsersDirectory().then(setUsers).catch((error) => console.error(error));
    }
  }, [canFilterByUser]);

  const exportMeta = {
    title: 'Ledger Statement',
    userLabel: selectedUserLabel,
    startDate: filters.startDate,
    endDate: filters.endDate,
    generatedBy: user?.name || user?.email,
  };

  const resetFilters = () => {
    const cleared = { userEmail: 'all', startDate: '', endDate: '' };
    setFilters(cleared);
    setSearchTerm('');
    setDirection('all');
    setPage(1);
    void fetchTransactions(cleared);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="glass-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><ArrowLeftRight className="h-5 w-5" /> Ledger Statement</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {canFilterByUser ? 'Review user-wise ledger entries by period.' : 'Your personal ledger statement.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => exportLedgerPDF(filteredTransactions, exportMeta)} disabled={filteredTransactions.length === 0}>
              <FileText className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportLedgerExcel(filteredTransactions, exportMeta)} disabled={filteredTransactions.length === 0}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadTransactions()} disabled={loading}>
              <RefreshCw className="mr-1 h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>

        <div className="border-b border-border bg-muted/20 p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {canFilterByUser && (
              <div className="space-y-2 lg:col-span-2">
                <Label>User</Label>
                <Select
                  value={filters.userEmail}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, userEmail: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All permitted users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All permitted users</SelectItem>
                    {visibleUsers.map((item) => (
                      <SelectItem key={item.email} value={item.email}>
                        {item.name} - {item.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ledger-start-date">From</Label>
              <Input
                id="ledger-start-date"
                type="date"
                max={localIsoDate()}
                value={filters.startDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ledger-end-date">To</Label>
              <Input
                id="ledger-end-date"
                type="date"
                max={localIsoDate()}
                value={filters.endDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button className="h-12 w-full md:h-10" onClick={() => void loadTransactions()} disabled={loading}>
                <Filter className="mr-2 h-4 w-4" /> Apply
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="ledger-search">Search ledger</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="ledger-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Claim number, employee, description or type"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full space-y-2 md:w-48">
              <Label>Entry direction</Label>
              <Select value={direction} onValueChange={(value: 'all' | 'credit' | 'debit') => setDirection(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Credit and debit</SelectItem>
                  <SelectItem value="credit">Credit only</SelectItem>
                  <SelectItem value="debit">Debit only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" onClick={resetFilters}><X className="mr-2 h-4 w-4" />Reset</Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground">Matching Entries</div>
              <div className="mt-1 text-xl font-bold">{filteredTransactions.length}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground">Total Credit</div>
              <div className="mt-1 text-xl font-bold text-success">{formatCurrency(summary.credits)}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground">Total Debit</div>
              <div className="mt-1 text-xl font-bold text-destructive">{formatCurrency(summary.debits)}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground">Net Movement</div>
              <div className={`mt-1 text-xl font-bold ${summary.credits - summary.debits >= 0 ? 'text-success' : 'text-destructive'}`}>
                {formatCurrency(summary.credits - summary.debits)}
              </div>
            </div>
          </div>
        </div>

        <div className="max-h-[680px] overflow-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="sticky top-0 z-10 bg-card shadow-sm">
              <tr className="bg-muted/50">
                <th className="p-3 text-left">Date</th>
                {canFilterByUser && <th className="p-3 text-left">User</th>}
                <th className="p-3 text-left">Description</th>
                <th className="p-3 text-left">Reference</th>
                <th className="p-3 text-left">Credit/Debit</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canFilterByUser ? 7 : 6} className="p-10 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading ledger entries...</td></tr>
              ) : filteredTransactions.length === 0 ? (
                <tr><td colSpan={canFilterByUser ? 7 : 6} className="p-10 text-center text-muted-foreground"><ArrowLeftRight className="mx-auto mb-2 h-7 w-7 opacity-50" />No ledger entries match these filters</td></tr>
              ) : paginatedTransactions.map((transaction, index) => {
                const isCredit = (transaction.credit || 0) > 0;
                const amount = isCredit ? transaction.credit : transaction.debit;

                return (
                  <tr key={`${transaction.createdAt}-${(page - 1) * PAGE_SIZE + index}`} className={`border-b border-border hover:bg-muted/30 ${transaction.type === 'claim_waived' ? 'bg-red-50' : ''}`}>
                    <td className="p-3 text-xs">{formatDate(transaction.createdAt)}</td>
                    {canFilterByUser && (
                      <td className="p-3">
                        <div className="font-medium">{transaction.name || transaction.email}</div>
                      </td>
                    )}
                    <td className="p-3">{transaction.description || '-'}{transaction.type === 'claim_waived' ? <div className="text-xs text-destructive mt-1">Deduction</div> : null}</td>
                    <td className="p-3 text-xs text-muted-foreground">{transaction.claimId || '-'}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={isCredit ? 'border-success/25 bg-success/10 text-success' : 'border-destructive/25 bg-destructive/10 text-destructive'}>
                        {isCredit ? <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> : <ArrowDownRight className="mr-1 h-3.5 w-3.5" />}
                        {isCredit ? 'Credit' : 'Debit'}
                      </Badge>
                    </td>
                    <td className={`p-3 text-right font-medium ${isCredit ? 'text-success' : 'text-destructive'}`}>
                      {formatCurrency(amount || 0)}
                    </td>
                    <td className="p-3 text-right font-bold">{formatCurrency(transaction.balanceAfter || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filteredTransactions.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredTransactions.length)} of {filteredTransactions.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                <ChevronLeft className="mr-1 h-4 w-4" />Previous
              </Button>
              <span className="px-2 text-sm font-medium">Page {page} of {pageCount}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>
                Next<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
