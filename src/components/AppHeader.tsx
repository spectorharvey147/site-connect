import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/NotificationBell';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getCompanySettings } from '@/lib/claims-api';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

function formatHeaderDateTime(date: Date) {
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AppHeader() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [brand, setBrand] = useState({ name: 'ClaimFlow Pro', subtitle: 'Claims Management System', logo: '/ipi-logo.jpg' });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    getCompanySettings()
      .then((settings) => {
        if (!settings) return;
        setBrand({
          name: settings.company_name || 'ClaimFlow Pro',
          subtitle: settings.company_subtitle || 'Claims Management System',
          logo: settings.logo_url || '/ipi-logo.jpg',
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="glass-card sticky top-0 z-40 mx-3 mb-4 mt-[env(safe-area-inset-top,12px)] flex select-none items-center justify-between bg-card/95 px-3 py-3 backdrop-blur-md sm:mx-4 sm:mb-6 sm:mt-4 sm:px-6 sm:py-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <img
          src={brand.logo}
          alt={brand.name}
          className="h-10 w-10 flex-shrink-0 rounded-md border border-border bg-white p-1 object-contain"
        />
        <div className="min-w-0">
          <h1 className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-bold text-foreground sm:text-lg">
            <span className="min-w-0 truncate">{brand.name}</span>
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground sm:text-xs">{formatHeaderDateTime(now)}</span>
          </h1>
          <p className="truncate text-xs text-muted-foreground sm:text-sm">
            <span className="font-medium text-foreground">{user?.name}</span>
            <span className="hidden md:inline"> | {brand.subtitle}</span>
            <span className="hidden sm:inline"> ({user?.role})</span>
          </p>
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1 sm:gap-3">
        <NotificationBell />
        <button
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-md p-2 hover:bg-muted/30"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="hidden items-center gap-2 sm:flex">
          <Avatar className="h-8 w-8 border border-border">
            {user?.profile_picture_url ? (
              <AvatarImage src={user.profile_picture_url} alt={user.name} />
            ) : (
              <AvatarFallback className="bg-primary/10 text-xs text-primary">
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </AvatarFallback>
            )}
          </Avatar>
          <span className="hidden text-sm font-medium text-foreground lg:inline">{user?.name}</span>
        </div>
        <button
          onClick={() => void logout()}
          className="inline-flex items-center gap-2 rounded-md text-sm border border-input bg-background px-2 sm:px-3 h-9 hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
