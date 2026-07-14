import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getClaimsHistory, getDashboardChartData, getDashboardSummary, getManagerAssignedUsersWithBalances } from '@/lib/claims-api';
import { CheckCircle2, CreditCard, FileText, Users, Clock, UserCheck, ShieldCheck, RefreshCw, CalendarDays, ArrowRight, Plus, History, WalletCards } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import RupeeIcon from '@/components/icons/RupeeIcon';
import { useNavigate } from 'react-router-dom';

type IconComponent = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;

interface DashboardSummary {
  role: string;
  totalClaims?: number;
  totalUsers?: number;
  totalAmount?: number;
  pendingClaims?: number;
  pendingManagerClaims?: number;
  pendingAdminClaims?: number;
  pendingFinalClaims?: number;
  pendingAccountsClaims?: number;
  accountsProcessingClaims?: number;
  paidClaims?: number;
  myClaims?: number;
  myAmount?: number;
  myBalance?: number;
}

interface MonthlyChartItem {
  month: string;
  withBill: number;
  withoutBill: number;
  total: number;
  count: number;
}

interface PieChartItem {
  name: string;
  value: number;
}

interface DashboardChartData {
  monthly: MonthlyChartItem[];
  byCategory: PieChartItem[];
  byStatus: PieChartItem[];
}

interface DashboardClaim {
  claimId: string;
  claimIdInternal: string;
  date: string;
  submittedBy: string;
  site: string;
  amount: number;
  submittedAmount?: number;
  status: string;
}

interface ManagerAssignedUser {
  name: string;
  email: string;
  balance: number;
  lastTransactionDate: string | null;
}

interface StatCardProps {
  icon: IconComponent;
  label: string;
  value: string | number;
  subtitle: string;
  color?: string;
  onClick?: () => void;
}

function formatCurrency(num: number) {
  return `Rs. ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ icon: Icon, label, value, subtitle, color = 'text-primary', onClick }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-left">
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          <div className={`mt-2 text-2xl font-bold tracking-tight ${color}`}>{value}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 p-2.5 shadow-sm">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-left text-xs text-muted-foreground">
        <span>{subtitle}</span>
        {onClick ? <ArrowRight className="h-3.5 w-3.5 shrink-0" /> : null}
      </div>
    </>
  );

  if (onClick) {
    return <button type="button" onClick={onClick} className="stat-card w-full text-left transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">{content}</button>;
  }
  return <div className="stat-card">{content}</div>;
}

function DashboardHeader({ name, role, loading, onRefresh }: { name: string; role: string; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="glass-card p-5 sm:p-6 mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between overflow-hidden relative">
      <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full">{role}</Badge>
          <span className="text-xs text-muted-foreground">Claims workspace</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-gradient">Welcome back, {name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Here is the latest claims and approval activity.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="relative self-start sm:self-auto">
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
      </Button>
    </div>
  );
}

function UserDashboard({ data }: { data: DashboardSummary | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <StatCard icon={FileText} label="My Claims" value={data?.myClaims ?? 0} subtitle="Total claims submitted" />
      <StatCard icon={RupeeIcon} label="My Balance" value={formatCurrency(data?.myBalance ?? 0)} subtitle="Available balance" color="text-info" />
    </div>
  );
}

function ManagerAssignedUsersTable({ managerUsers }: { managerUsers: ManagerAssignedUser[] }) {
  if (managerUsers.length === 0) return null;

  return (
    <div className="glass-card p-6 mt-4">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Users className="h-5 w-5" /> Assigned Employees</h3>
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="h-10 px-4 text-left font-medium text-muted-foreground">Employee Name</th>
              <th className="h-10 px-4 text-right font-medium text-muted-foreground">Current Balance</th>
              <th className="h-10 px-4 text-right font-medium text-muted-foreground">Last Transaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {managerUsers.map((employee) => (
              <tr key={employee.email} className="hover:bg-muted/30 transition-colors">
                <td className="p-4 font-medium text-foreground">{employee.name}</td>
                <td className="p-4 text-right font-bold text-primary">{formatCurrency(employee.balance)}</td>
                <td className="p-4 text-right text-muted-foreground">
                  {employee.lastTransactionDate ? new Date(employee.lastTransactionDate).toLocaleDateString('en-IN') : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminDashboard({ data, isManager, managerUsers }: { data: DashboardSummary | null; isManager: boolean; managerUsers: ManagerAssignedUser[] }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        <StatCard icon={FileText} label="Total Claims" value={data?.totalClaims ?? 0} subtitle="All claims in system" />
        <StatCard icon={Users} label="Total Users" value={data?.totalUsers ?? 0} subtitle="Registered users" color="text-info" />
        <StatCard icon={Clock} label="Pending Claims" value={data?.pendingClaims ?? 0} subtitle="Awaiting approval" color="text-warning" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <StatCard icon={UserCheck} label="Pending Manager" value={data?.pendingManagerClaims ?? 0} subtitle="Awaiting manager approval" color="text-warning" />
        <StatCard icon={ShieldCheck} label="Pending Admin" value={data?.pendingAdminClaims ?? 0} subtitle="Awaiting admin verification" color="text-destructive" />
        <StatCard icon={ShieldCheck} label="Pending Final" value={data?.pendingFinalClaims ?? 0} subtitle="Awaiting super admin" color="text-info" />
      </div>
      {isManager ? <ManagerAssignedUsersTable managerUsers={managerUsers} /> : null}
    </>
  );
}

function AccountsDashboard({ data }: { data: DashboardSummary | null }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        <StatCard icon={FileText} label="Accounts Verification" value={data?.pendingAccountsClaims ?? 0} subtitle="Final approved, awaiting accounts" color="text-warning" />
        <StatCard icon={CreditCard} label="Processing" value={data?.accountsProcessingClaims ?? 0} subtitle="Accounts verified, payment pending" color="text-info" />
        <StatCard icon={CheckCircle2} label="Paid Claims" value={data?.paidClaims ?? 0} subtitle="Marked paid by accounts" color="text-success" />
      </div>
    </>
  );
}

type ClaimBucket = 'pending' | 'approved' | 'rejected' | 'paid';

function getClaimBucket(status: string): ClaimBucket {
  const value = String(status || '').trim().toLowerCase();
  if (value.includes('reject')) return 'rejected';
  if (value === 'paid' || value === 'closed' || value.includes('payment completed')) return 'paid';
  if (
    value === 'approved'
    || value === 'settled'
    || value.includes('final approved')
    || value.includes('accounts verification')
    || value.includes('accounts verified')
    || value.includes('accounts processing')
    || value.includes('payment processing')
    || value.includes('sent to accounts')
  ) return 'approved';
  return 'pending';
}

function statusBadgeClass(status: string) {
  const bucket = getClaimBucket(status);
  if (bucket === 'paid') return 'border-success/25 bg-success/10 text-success';
  if (bucket === 'approved') return 'border-info/25 bg-info/10 text-info';
  if (bucket === 'rejected') return 'border-destructive/25 bg-destructive/10 text-destructive';
  return 'border-warning/25 bg-warning/10 text-warning';
}

function QuickActions({ role, onNavigate }: { role: string; onNavigate: (path: string) => void }) {
  const common = [
    { label: 'Claim History', path: '/history', icon: History },
    { label: 'Transactions', path: '/ledger', icon: WalletCards },
  ];
  const byRole: Record<string, Array<{ label: string; path: string; icon: LucideIcon }>> = {
    User: [{ label: 'New Claim', path: '/submit', icon: Plus }, ...common],
    Manager: [{ label: 'Manager Queue', path: '/manager-approval', icon: UserCheck }, ...common],
    Admin: [{ label: 'Admin Queue', path: '/admin-approval', icon: ShieldCheck }, { label: 'Payment Vouchers', path: '/voucher', icon: CreditCard }, common[0]],
    'Super Admin': [{ label: 'Final Approval', path: '/final-approval', icon: CheckCircle2 }, { label: 'Accounts Queue', path: '/accounts-processing', icon: CreditCard }, common[0]],
    Accounts: [{ label: 'Accounts Queue', path: '/accounts-processing', icon: CreditCard }, { label: 'SAP Entry', path: '/accounts-sap-entry', icon: FileText }, { label: 'Payment Vouchers', path: '/voucher', icon: WalletCards }],
  };
  const actions = byRole[role] || common;

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Quick actions</h3>
          <p className="text-xs text-muted-foreground">Go directly to your regular tasks</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {actions.map(({ label, path, icon: Icon }) => (
          <Button key={path} variant="outline" className="h-auto justify-between px-3 py-3" onClick={() => onNavigate(path)}>
            <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" />{label}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        ))}
      </div>
    </div>
  );
}

function RecentClaims({ claims, onViewAll }: { claims: DashboardClaim[]; onViewAll: () => void }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 p-4 sm:p-5">
        <div>
          <h3 className="font-semibold">Recent claims</h3>
          <p className="text-xs text-muted-foreground">Latest submissions in your access scope</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onViewAll}>View all <ArrowRight className="ml-1 h-4 w-4" /></Button>
      </div>
      {claims.length === 0 ? (
        <div className="p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No claims available</p>
          <p className="text-xs text-muted-foreground">New submissions will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/45 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Claim</th>
                <th className="px-4 py-3 text-left font-medium">Employee / Site</th>
                <th className="px-4 py-3 text-left font-medium">Submitted</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {claims.map((claim) => (
                <tr key={claim.claimIdInternal || claim.claimId} className="transition-colors hover:bg-muted/25">
                  <td className="px-4 py-3 font-semibold text-primary">{claim.claimId}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{claim.submittedBy || 'Unknown employee'}</div>
                    <div className="max-w-[220px] truncate text-xs text-muted-foreground">{claim.site || 'No site'}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(claim.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(claim.submittedAmount ?? claim.amount ?? 0)}</td>
                  <td className="px-4 py-3 text-right"><Badge variant="outline" className={statusBadgeClass(claim.status)}>{claim.status || 'Unknown'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const COLORS = ['#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];

const STATUS_COLORS: Record<string, string> = {
  Approved: '#22c55e',
  Closed: '#22c55e',
  Rejected: '#ef4444',
  Submitted: '#0ea5e9',
  'Admin Verified': '#f59e0b',
  'Manager Approved': '#8b5cf6',
  'Accounts Verification': '#06b6d4',
  'Sent to Accounts': '#06b6d4',
  'Accounts Processing': '#0284c7',
  Paid: '#22c55e',
  'Pending Admin Verification': '#0ea5e9',
  'Pending Manager Approval': '#f59e0b',
  'Pending Super Admin Approval': '#8b5cf6',
  'Pending Admin Approval': '#8b5cf6',
};

function ChartsSection({ chartData }: { chartData: DashboardChartData }) {
  return (
    <div className="mt-6 space-y-6">
      {chartData.monthly.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-bold mb-4 text-foreground">Monthly Claims Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value: number) => `Rs.${(value / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                formatter={(value: number, name: string) => [`Rs. ${value.toLocaleString('en-IN')}`, name]}
              />
              <Legend />
              <Bar dataKey="withBill" name="With Bill" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="withoutBill" name="Without Bill" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {chartData.byCategory.length > 0 && (
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 text-foreground">Spend by Category</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData.byCategory}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={82}
                  paddingAngle={2}
                >
                  {chartData.byCategory.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                  formatter={(value: number) => [`Rs. ${value.toLocaleString('en-IN')}`, 'Amount']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {chartData.byCategory.map((entry, index) => (
                <div key={entry.name} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/45 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="break-words text-xs font-medium" title={entry.name}>{entry.name}</span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">{formatCurrency(entry.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {chartData.byStatus.length > 0 && (
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 text-foreground">Claims by Status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartData.byStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={82}
                  paddingAngle={2}
                >
                  {chartData.byStatus.map((entry, index) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {chartData.byStatus.map((entry, index) => (
                <div key={entry.name} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/45 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[entry.name] || COLORS[index % COLORS.length] }}
                    />
                    <span className="break-words text-xs font-medium" title={entry.name}>{entry.name}</span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [chartData, setChartData] = useState<DashboardChartData | null>(null);
  const [claims, setClaims] = useState<DashboardClaim[]>([]);
  const [managerUsers, setManagerUsers] = useState<ManagerAssignedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [result, charts, claimHistory] = await Promise.all([
        getDashboardSummary(user.email, user.role) as Promise<DashboardSummary>,
        getDashboardChartData(user.email, user.role) as Promise<DashboardChartData>,
        getClaimsHistory(user.email, user.role) as Promise<DashboardClaim[]>,
      ]);

      setData(result);
      setChartData(charts);
      setClaims(claimHistory);

      if (user.role === 'Manager') {
        const assignedUsers = await getManagerAssignedUsersWithBalances(user.email) as ManagerAssignedUser[];
        setManagerUsers(assignedUsers);
      } else {
        setManagerUsers([]);
      }
    } catch (error) {
      console.error(error);
      setError('Dashboard data could not be loaded. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metrics = useMemo(() => {
    const current = new Date();
    const totals = { pending: 0, approved: 0, rejected: 0, paid: 0, monthly: 0, paidAmount: 0 };
    claims.forEach((claim) => {
      const bucket = getClaimBucket(claim.status);
      totals[bucket] += 1;
      const date = new Date(claim.date);
      if (date.getFullYear() === current.getFullYear() && date.getMonth() === current.getMonth()) totals.monthly += 1;
      if (bucket === 'paid') totals.paidAmount += Number(claim.amount ?? claim.submittedAmount ?? 0);
    });
    return totals;
  }, [claims]);
  const recentClaims = useMemo(
    () => [...claims].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6),
    [claims],
  );

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse p-4">
        <div className="h-20 rounded-2xl bg-muted" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((item) => <div key={item} className="h-32 rounded-2xl bg-muted" />)}
        </div>
      </div>
    );
  }

  const isUserRole = data?.role === 'User';
  const isAccountsRole = user?.role === 'Accounts';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <DashboardHeader name={user?.name || user?.email || 'User'} role={user?.role || 'User'} loading={loading} onRefresh={() => void loadDashboard()} />

      {error ? (
        <div className="glass-card border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium text-destructive">Unable to load dashboard</p><p className="text-sm text-muted-foreground">{error}</p></div>
          <Button variant="outline" size="sm" onClick={() => void loadDashboard()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button>
        </div>
      ) : null}

      <section>
        <div className="mb-3">
          <h3 className="text-base font-semibold">Claims overview</h3>
          <p className="text-xs text-muted-foreground">Current totals within your permitted claim scope</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Clock} label="Pending Claims" value={metrics.pending} subtitle="Still in workflow" color="text-warning" onClick={() => navigate('/history')} />
          <StatCard icon={CreditCard} label="Paid Claims" value={metrics.paid} subtitle="Payment completed" color="text-success" onClick={() => navigate('/history')} />
          <StatCard icon={CalendarDays} label="Monthly Claims" value={metrics.monthly} subtitle={new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} color="text-primary" />
          <StatCard icon={RupeeIcon} label="Total Paid Amount" value={formatCurrency(metrics.paidAmount)} subtitle={`${metrics.paid} paid claims`} color="text-success" />
        </div>
      </section>

      <QuickActions role={user?.role || 'User'} onNavigate={navigate} />

      {isUserRole ? (
        <UserDashboard data={data} />
      ) : isAccountsRole ? (
        <AccountsDashboard data={data} />
      ) : (
        <AdminDashboard data={data} isManager={user?.role === 'Manager'} managerUsers={managerUsers} />
      )}

      {chartData ? <ChartsSection chartData={chartData} /> : null}
      <RecentClaims claims={recentClaims} onViewAll={() => navigate('/history')} />
    </div>
  );
}
