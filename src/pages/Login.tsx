import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettingsStore } from '../store/useSettingsStore';
import { Loader2, Mail, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { dashboardName, logo } = useSettingsStore();
  const { signIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  const initials = dashboardName?.substring(0, 3).toUpperCase() || 'ERP';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[420px] bg-card border border-border rounded-2xl p-8 md:p-10 animate-in fade-in zoom-in-95 duration-500 shadow-sm">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            {logo ? (
              <img src={logo} alt="Logo" className="h-10 object-contain" />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-semibold text-sm tracking-wide">{initials}</span>
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">{dashboardName}</h1>
              <p className="text-xs text-muted-foreground">ERP Professional</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Sign in</h2>
          <p className="text-sm text-muted-foreground">Enter your credentials to access your account.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                placeholder="admin@miaoda.com"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground flex justify-between">
              Password
              <a href="#" className="text-muted-foreground hover:text-foreground text-xs transition-colors">Forgot password?</a>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              "w-full flex items-center justify-center py-3 px-4 mt-2 rounded-xl text-sm font-semibold transition-all",
              "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]",
              "disabled:opacity-60 disabled:cursor-not-allowed"
            )}
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-foreground" />
            <p>Contact your administrator to request account access. New accounts can only be created by an authorized administrator.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
