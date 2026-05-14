import { useEffect, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardChartData, getDashboardSummary, getManagerAssignedUsersWithBalances } from '@/lib/claims-api';
import { FileText, Users, Clock, UserCheck, ShieldCheck, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import RupeeIcon from '@/components/icons/RupeeIcon';

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
}

function formatCurrency(num: number) {
  return `Rs. ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({ icon: Icon, label, value, subtitle, color = 'text-primary' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="text-muted-foreground mb-3"><Icon className={`h-8 w-8 mx-auto ${color}`} /></div>
      <div className="text-sm text-muted-foreground mb-2">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-2">{subtitle}</div>
    </div>
  );
}

function DashboardHeader({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="glass-card p-6 mb-6 flex items-center justify-between">
      <div>
        <h2 className="text-xl font-bold text-gradient">Dashboard Overview</h2>
        <p className="text-sm text-muted-foreground">Quick summary of claims and balances</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRefresh}>
        <RefreshCw className="h-4 w-4 mr-2" /> Refresh
      </Button>
    </div>
  );
}

function UserDashboard({ data }: { data: DashboardSummary | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard icon={FileText} label="My Claims" value={data?.myClaims ?? 0} subtitle="Total claims submitted" />
      <StatCard icon={RupeeIcon} label="My Amount" value={formatCurrency(data?.myAmount ?? 0)} subtitle="Total amount claimed" color="text-success" />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard icon={FileText} label="Total Claims" value={data?.totalClaims ?? 0} subtitle="All claims in system" />
        <StatCard icon={Users} label="Total Users" value={data?.totalUsers ?? 0} subtitle="Registered users" color="text-info" />
        <StatCard icon={RupeeIcon} label="Total Amount" value={formatCurrency(data?.totalAmount ?? 0)} subtitle="Total claimed amount" color="text-success" />
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

const COLORS = ['#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16'];

const STATUS_COLORS: Record<string, string> = {
  Approved: '#22c55e',
  Closed: '#22c55e',
  Rejected: '#ef4444',
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
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
              <Pie
                data={chartData.byCategory}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="80%"
                label={({ name, percent }) => {
                  const full = `${name} (${((percent || 0) * 100).toFixed(0)}%)`;
                  // Truncate long labels so they don't overflow the chart container
                  return full.length > 24 ? `${full.slice(0, 21)}...` : full;
                }}
                labelLine={false}
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
          </div>
        )}

        {chartData.byStatus.length > 0 && (
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold mb-4 text-foreground">Claims by Status</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData.byStatus}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
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
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardView() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [chartData, setChartData] = useState<DashboardChartData | null>(null);
  const [managerUsers, setManagerUsers] = useState<ManagerAssignedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [result, charts] = await Promise.all([
        getDashboardSummary(user.email, user.role) as Promise<DashboardSummary>,
        getDashboardChartData(user.email, user.role) as Promise<DashboardChartData>,
      ]);

      setData(result);
      setChartData(charts);

      if (user.role === 'Manager') {
        const assignedUsers = await getManagerAssignedUsersWithBalances(user.email) as ManagerAssignedUser[];
        setManagerUsers(assignedUsers);
      } else {
        setManagerUsers([]);
      }
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadDashboard();
  }, [user]);

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

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <DashboardHeader onRefresh={() => void loadDashboard()} />

      {isUserRole ? (
        <UserDashboard data={data} />
      ) : (
        <AdminDashboard data={data} isManager={user?.role === 'Manager'} managerUsers={managerUsers} />
      )}

      {chartData ? <ChartsSection chartData={chartData} /> : null}
    </div>
  );
}
