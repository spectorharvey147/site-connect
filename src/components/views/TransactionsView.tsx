import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getTransactions, getUsersDirectory } from '@/lib/claims-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftRight, FileSpreadsheet, FileText, Filter, RefreshCw } from 'lucide-react';
import { exportLedgerExcel, exportLedgerPDF, LedgerExportTransaction } from '@/lib/export-utils';

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
  const [users, setUsers] = useState<any[]>([]);
  const [filters, setFilters] = useState({ userEmail: 'all', startDate: '', endDate: '' });
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

  const summary = useMemo(() => transactions.reduce(
    (total, transaction) => ({
      credits: total.credits + Number(transaction.credit || 0),
      debits: total.debits + Number(transaction.debit || 0),
    }),
    { credits: 0, debits: 0 },
  ), [transactions]);

  const loadTransactions = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const queryFilters = {
        userEmail: canFilterByUser && filters.userEmail !== 'all' ? filters.userEmail : undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
      };
      const data = await getTransactions(user.email, user.role, queryFilters);
      setTransactions(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { void loadTransactions(); }, [user]);
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
            <Button variant="outline" size="sm" onClick={() => exportLedgerPDF(transactions, exportMeta)} disabled={transactions.length === 0}>
              <FileText className="mr-1 h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportLedgerExcel(transactions, exportMeta)} disabled={transactions.length === 0}>
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
                value={filters.startDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ledger-end-date">To</Label>
              <Input
                id="ledger-end-date"
                type="date"
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

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground">Entries</div>
              <div className="mt-1 text-xl font-bold">{transactions.length}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground">Total Credit</div>
              <div className="mt-1 text-xl font-bold text-success">{formatCurrency(summary.credits)}</div>
            </div>
            <div className="rounded-md border border-border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground">Total Debit</div>
              <div className="mt-1 text-xl font-bold text-destructive">{formatCurrency(summary.debits)}</div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
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
                <tr><td colSpan={canFilterByUser ? 7 : 6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={canFilterByUser ? 7 : 6} className="p-8 text-center text-muted-foreground">No ledger entries</td></tr>
              ) : transactions.map((transaction, index) => {
                const isCredit = (transaction.credit || 0) > 0;
                const amount = isCredit ? transaction.credit : transaction.debit;

                return (
                  <tr key={`${transaction.createdAt}-${index}`} className={`border-b border-border hover:bg-muted/30 ${transaction.type === 'claim_waived' ? 'bg-red-50' : ''}`}>
                    <td className="p-3 text-xs">{formatDate(transaction.createdAt)}</td>
                    {canFilterByUser && (
                      <td className="p-3">
                        <div className="font-medium">{transaction.name || transaction.email}</div>
                      </td>
                    )}
                    <td className="p-3">{transaction.description || '-'}{transaction.type === 'claim_waived' ? <div className="text-xs text-destructive mt-1">Deduction</div> : null}</td>
                    <td className="p-3 text-xs text-muted-foreground">{transaction.claimId || '-'}</td>
                    <td className={`p-3 font-medium ${isCredit ? 'text-success' : 'text-destructive'}`}>
                      {isCredit ? 'Credit' : 'Debit'}
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
      </div>
    </div>
  );
}
