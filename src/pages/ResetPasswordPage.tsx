import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GridBackground } from '@/components/ui/grid-background';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

function getRecoveryError() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return hash.get('error_description') || query.get('error_description') || '';
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [checking, setChecking] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const passwordsMatch = useMemo(
    () => password.length > 0 && password === confirmPassword,
    [confirmPassword, password]
  );
  const canSubmit = canReset && password.length >= 8 && passwordsMatch && !saving;

  useEffect(() => {
    const recoveryError = getRecoveryError();
    if (recoveryError) {
      setErrorMessage(recoveryError);
      setChecking(false);
      return;
    }

    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') {
        setErrorMessage('');
        setCanReset(true);
        setChecking(false);
      }
    });

    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (error) {
        setErrorMessage(error.message);
        setChecking(false);
        return;
      }

      if (sessionData.session) {
        setCanReset(true);
      } else {
        setErrorMessage('Open the newest password reset link from your email.');
      }
      setChecking(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success('Password updated');
      await signOut();
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white px-5 py-6 sm:px-6 sm:py-6">
      <GridBackground />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <Card className="mx-auto w-full max-w-[30rem] overflow-hidden border-0 bg-white/94 shadow-[0_18px_48px_rgba(15,23,42,0.10)] backdrop-blur-sm sm:rounded-xl sm:border sm:border-white/80">
          <CardContent className="p-7">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex h-28 w-full max-w-[15rem] items-center justify-center">
                <img
                  src="/all-zentro-logo.png"
                  alt="All Zentro Solutions"
                  className="h-full w-full object-contain"
                />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Accounting access</p>
              <h1 className="mt-3 text-3xl font-semibold text-foreground">Reset password</h1>
            </div>

            {checking ? (
              <p className="text-center text-sm text-muted-foreground">Checking reset link...</p>
            ) : errorMessage ? (
              <div className="space-y-5 text-center">
                <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {errorMessage}
                </p>
                <Button type="button" className="h-12 w-full rounded-2xl text-sm font-bold" onClick={() => navigate('/login')}>
                  Back to login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">New password</Label>
                  <Input
                    required
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="h-12 rounded-2xl border-border/70 bg-white px-4 text-base"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Confirm password</Label>
                  <Input
                    required
                    type="password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    className="h-12 rounded-2xl border-border/70 bg-white px-4 text-base"
                    autoComplete="new-password"
                  />
                </div>
                <p className="min-h-5 text-center text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  {password && password.length < 8
                    ? 'Use at least 8 characters'
                    : confirmPassword && !passwordsMatch
                    ? 'Passwords do not match'
                    : ''}
                </p>
                <Button type="submit" className="h-12 w-full rounded-2xl text-sm font-bold" disabled={!canSubmit}>
                  {saving ? 'Updating password...' : 'Update password'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
