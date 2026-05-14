import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getCompanySettings, checkAdminExists } from '@/lib/claims-api';
import { requestPasswordReset } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { LogIn, Loader2, UserPlus, KeyRound, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import AdminSignupForm from '@/components/AdminSignupForm';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companySettings, setCompanySettings] = useState<any>(null);
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
    <div className="min-h-screen flex items-center justify-center p-4 gradient-primary animate-gradient relative overflow-hidden">
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
      }} />
      <div className="w-full max-w-md rounded-2xl shadow-2xl bg-card/95 backdrop-blur-xl overflow-hidden border border-white/20 relative z-10">
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
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
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
            {forgotError && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div className="bg-green-500/10 text-green-700 text-sm p-3 rounded-lg border border-green-500/20">
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
      </div>
    </div>
  );
}
