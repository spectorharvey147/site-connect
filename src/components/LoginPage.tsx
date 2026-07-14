import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getCompanySettings, checkAdminExists } from '@/lib/claims-api';
import { requestPasswordReset } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LogIn, Loader2, UserPlus, KeyRound, Eye, EyeOff, ArrowLeft, ShieldCheck } from 'lucide-react';
import AdminSignupForm from '@/components/AdminSignupForm';

interface LoginCompanySettings {
  logo_url?: string | null;
  company_name?: string | null;
  company_subtitle?: string | null;
}

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companySettings, setCompanySettings] = useState<LoginCompanySettings | null>(null);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [showSignup, setShowSignup] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);

  useEffect(() => {
    getCompanySettings().then(s => { if (s) setCompanySettings(s); }).catch(() => {});
    checkAdminExists().then(setAdminExists).catch(() => setAdminExists(true));
    const savedEmail = localStorage.getItem('claimsSavedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await login(email, password);
      if (!result.ok) {
        if (result.message?.toLowerCase().includes('invalid')) {
          setError('Invalid email or password. Please try again.');
        } else if (result.message?.toLowerCase().includes('deactivated')) {
          setError('Your account has been deactivated. Please contact an administrator.');
        } else {
          setError(result.message || 'Login failed. Please try again.');
        }
      } else if (rememberEmail) {
        localStorage.setItem('claimsSavedEmail', email.trim());
      } else {
        localStorage.removeItem('claimsSavedEmail');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError('Please enter your email address');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      const result = await requestPasswordReset(forgotEmail);
      if (result.ok) {
        setForgotSuccess('Check your email for the password reset link.');
        setForgotEmail('');
      } else {
        setForgotError(result.message || 'Failed to send reset email. Please try again.');
      }
    } catch {
      setForgotError('Network error. Please check your connection and try again.');
    }
    setForgotLoading(false);
  };

  const logoUrl = companySettings?.logo_url || '/ipi-logo.jpg';
  const companyName = companySettings?.company_name || 'Claims Management';
  const subtitle = companySettings?.company_subtitle || 'Sign in to continue';

  // Show signup form if no admin exists and user wants to sign up
  if (showSignup && adminExists === false) {
    return <AdminSignupForm onBack={() => setShowSignup(false)} onSuccess={() => { setShowSignup(false); setAdminExists(true); }} />;
  }

  return (
    <div className="relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden p-4 gradient-primary sm:p-6">
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
      }} />
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-primary-foreground/10 blur-3xl" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/25 bg-card/95 shadow-2xl backdrop-blur-xl">
        <div className="gradient-primary p-6 sm:p-8 text-center">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={companyName} 
              className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-3 rounded-full object-cover border-4 border-white/30 shadow-lg" 
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-3 rounded-full bg-white/20 flex items-center justify-center border-4 border-white/30 shadow-lg">
              <KeyRound className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
            </div>
          )}
          <h2 className="text-xl sm:text-2xl font-bold text-primary-foreground">{companyName}</h2>
          <p className="text-primary-foreground/70 text-sm mt-1">{subtitle}</p>
        </div>

        {!showForgotPassword ? (
          <div className="p-6 sm:p-8 space-y-4 sm:space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Welcome back</h3>
              <p className="mt-1 text-sm text-muted-foreground">Use your registered work account to continue.</p>
            </div>
            {error && (
              <div role="alert" aria-live="polite" className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  placeholder="Enter your email"
                  className="h-11 sm:h-10 text-base sm:text-sm"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required 
                    placeholder="Enter your password"
                    className="h-11 sm:h-10 text-base sm:text-sm pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-credentials"
                  checked={rememberEmail}
                  onCheckedChange={(checked) => setRememberEmail(Boolean(checked))}
                />
                <Label htmlFor="remember-credentials" className="text-sm font-normal">
                  Remember email address
                </Label>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 sm:h-10 gradient-primary text-primary-foreground text-base sm:text-sm" 
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(true);
                setError('');
                setForgotEmail('');
              }}
              className="text-sm text-primary hover:text-primary/80 font-medium w-full text-center py-2 transition-colors"
            >
              Forgot Password?
            </button>

            {/* Only show signup button if no admin exists */}
            {adminExists === false && (
              <Button 
                type="button" 
                variant="outline" 
                className="w-full h-11 sm:h-10 text-base sm:text-sm"
                onClick={() => setShowSignup(true)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Create Admin Account
              </Button>
            )}
          </div>
        ) : (
          <div className="p-6 sm:p-8 space-y-4 sm:space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Reset your password</h3>
              <p className="mt-1 text-sm text-muted-foreground">We will send a secure, time-limited reset link.</p>
            </div>
            {forgotError && (
              <div role="alert" aria-live="polite" className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div role="status" aria-live="polite" className="bg-success/10 text-success text-sm p-3 rounded-lg border border-success/20">
                {forgotSuccess}
              </div>
            )}
            <form onSubmit={handleForgotPassword} className="space-y-4 sm:space-y-5">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email Address</Label>
                <Input 
                  id="forgot-email" 
                  type="email" 
                  value={forgotEmail} 
                  onChange={e => setForgotEmail(e.target.value)} 
                  required 
                  placeholder="Enter your email"
                  className="h-11 sm:h-10 text-base sm:text-sm"
                  autoComplete="email"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  We'll send you a link to reset your password.
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 sm:h-10 gradient-primary text-primary-foreground text-base sm:text-sm" 
                disabled={forgotLoading}
              >
                {forgotLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <KeyRound className="mr-2 h-4 w-4" />}
                {forgotLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false);
                setForgotEmail('');
                setForgotError('');
                setForgotSuccess('');
              }}
              className="text-sm text-primary hover:text-primary/80 font-medium w-full text-center py-2 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sign In
            </button>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" /> Secure role-based claims access
        </div>
      </div>
    </div>
  );
}
