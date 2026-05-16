import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import LoginPage from '@/components/LoginPage';
import AppSidebar from '@/components/AppSidebar';
import AppHeader from '@/components/AppHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

const viewRoles: Record<string, string[]> = {
  dashboard: ['all'],
  submit: ['User', 'Manager', 'Admin', 'Super Admin'],
  history: ['all'],
  ledger: ['all'],
  transactions: ['all'],
  balances: ['all'],
  'manager-approval': ['Manager', 'Super Admin'],
  'admin-approval': ['Admin', 'Super Admin'],
  'final-approval': ['Super Admin'],
  voucher: ['Accounts', 'Admin', 'Super Admin'],
  users: ['Admin', 'Super Admin'],
  settings: ['Admin', 'Super Admin'],
  audit: ['Admin', 'Super Admin'],
  profile: ['all'],
};

function canAccessView(view: string, role?: string) {
  const roles = viewRoles[view] || ['all'];
  return roles.includes('all') || roles.includes(role || '');
}

export default function Index() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const activeView = location.pathname.split('/')[1] || 'dashboard';

  const handleNavigate = (view: string) => {
    navigate(view === 'dashboard' ? '/' : `/${view}`);
  };

  useEffect(() => {
    if (user && !canAccessView(activeView, user.role)) {
      navigate('/', { replace: true });
    }
  }, [activeView, navigate, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden md:block">
        <AppSidebar activeView={activeView} onNavigate={handleNavigate} />
      </div>

      <div className="md:ml-[70px] transition-all duration-300">
        <AppHeader />
        <main className="main-content px-3 sm:px-4 md:pb-8">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav activeView={activeView} onNavigate={handleNavigate} />
    </div>
  );
}
