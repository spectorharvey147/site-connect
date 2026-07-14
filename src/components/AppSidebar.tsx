import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  ArrowLeftRight, Banknote, BarChart3, ChevronLeft, Crown, FileSpreadsheet,
  FileUp, History, LogOut, Menu, Receipt, Scale, Settings, Shield, ShieldCheck,
  UserCheck, UserCircle, Users,
} from 'lucide-react';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
}

const navGroups = [
  { label: 'Claims', items: [
    { id: 'dashboard', icon: BarChart3, label: 'Dashboard', roles: ['all'] },
    { id: 'submit', icon: FileUp, label: 'Submit Claim', roles: ['User', 'Manager', 'Admin', 'Super Admin'] },
    { id: 'history', icon: History, label: 'Claim History', roles: ['all'] },
    { id: 'ledger', icon: ArrowLeftRight, label: 'Ledger Statement', roles: ['all'] },
    { id: 'balances', icon: Scale, label: 'User Balances', roles: ['all'] },
  ] },
  { label: 'Approvals', items: [
    { id: 'manager-approval', icon: UserCheck, iconClassName: 'text-indigo-200', label: 'Manager Approval', roles: ['Manager', 'Super Admin'] },
    { id: 'admin-approval', icon: ShieldCheck, iconClassName: 'text-sky-200', label: 'Admin Verification', roles: ['Admin', 'Super Admin'] },
    { id: 'final-approval', icon: Crown, iconClassName: 'text-violet-200', label: 'Final Approval', roles: ['Super Admin'] },
  ] },
  { label: 'Accounts', items: [
    { id: 'accounts-processing', icon: Receipt, iconClassName: 'text-emerald-200', label: 'Accounts Processing', roles: ['Accounts', 'Super Admin'] },
    { id: 'accounts-sap-entry', icon: FileSpreadsheet, label: 'Accounts SAP Entry', roles: ['Accounts', 'Super Admin'] },
    { id: 'voucher', icon: Banknote, label: 'Payment Voucher', roles: ['Accounts', 'Admin', 'Super Admin'] },
  ] },
  { label: 'Administration', items: [
    { id: 'users', icon: Users, label: 'User Management', roles: ['Admin', 'Super Admin'] },
    { id: 'audit', icon: Shield, label: 'Audit Trail', roles: ['Admin', 'Super Admin'] },
    { id: 'settings', icon: Settings, label: 'Settings', roles: ['Admin', 'Super Admin'] },
  ] },
  { label: 'Account', items: [
    { id: 'profile', icon: UserCircle, label: 'My Profile', roles: ['all'] },
  ] },
];

export default function AppSidebar({ activeView, onNavigate }: SidebarProps) {
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const filteredGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes('all') || item.roles.includes(user?.role || '')),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-expanded={expanded}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-lg transition-all duration-300 hover:scale-110 lg:h-12 lg:w-12"
      >
        {expanded ? <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5" /> : <Menu className="h-4 w-4 lg:h-5 lg:w-5" />}
      </button>

      <aside
        aria-label="Main navigation"
        className={cn(
          'fixed left-0 top-0 z-40 flex h-full flex-col overflow-y-auto pt-16 gradient-primary shadow-xl transition-all duration-300 lg:pt-20',
          expanded ? 'w-[240px] lg:w-[280px]' : 'w-[70px]',
        )}
      >
        <nav className="flex min-h-full flex-1 flex-col" aria-label="Application sections">
          <div className="flex-1">
            {filteredGroups.map((group, groupIndex) => (
              <div key={group.label} className={cn(groupIndex > 0 && 'border-t border-white/10 pt-2')}>
                {expanded && <p className="px-6 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">{group.label}</p>}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={!expanded ? item.label : undefined}
                      aria-label={item.label}
                      aria-current={activeView === item.id ? 'page' : undefined}
                      onClick={() => { onNavigate(item.id); setExpanded(false); }}
                      className={cn('sidebar-nav-btn', activeView === item.id && 'active')}
                    >
                      <Icon className={cn('mr-4 h-5 w-5 min-w-[20px]', 'iconClassName' in item && item.iconClassName)} />
                      <span className={cn('whitespace-nowrap transition-opacity duration-300', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title={!expanded ? 'Logout' : undefined}
            aria-label="Logout"
            className="sidebar-nav-btn mt-2 border-t border-white/20 py-4"
          >
            <LogOut className="mr-4 h-5 w-5 min-w-[20px]" />
            <span className={cn('whitespace-nowrap transition-opacity duration-300', expanded ? 'opacity-100' : 'pointer-events-none opacity-0')}>Logout</span>
          </button>
        </nav>
      </aside>

      {expanded && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/20" onClick={() => setExpanded(false)} />}
    </>
  );
}
