import { useCallback, useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { getDefaultLandingPath } from '@/lib/permissions';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;
type Mode = 'login' | 'admin' | 'register';

export default function LoginPage() {
  const { beginSignIn, beginSignUp, completeSignIn } = useAuth();
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [verifiedAdminPasscode, setVerifiedAdminPasscode] = useState('');
  const autoSubmitLock = useRef(false);

  const isSignup = mode === 'register';
  const isAdminMode = mode === 'admin';

  const submit = useCallback(async () => {
    if (loading) return;
    if (isSignup && !name.trim()) return;
    if (passcode.length !== 4) return;

    setLoading(true);
    setStatusMessage(isAdminMode ? 'Verifying admin...' : isSignup ? 'Creating employee...' : 'Checking passcode...');
    try {
      if (isAdminMode) {
        setVerifiedAdminPasscode(passcode);
        setMode('register');
        setPasscode('');
        setStatusMessage('');
        setLoading(false);
        return;
      }

      const employee = isSignup ? await beginSignUp(name, passcode, verifiedAdminPasscode) : await beginSignIn(passcode);

      setSuccessName(employee.name);
      setStatusMessage('Opening workspace...');
      setShowSuccess(true);

      window.setTimeout(() => {
        const landingPath = getDefaultLandingPath(employee);
        completeSignIn(employee);
        window.location.replace(landingPath);
      }, 250);

      toast.success(`Welcome, ${employee.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign-in failed');
      setPasscode('');
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  }, [beginSignIn, beginSignUp, completeSignIn, isAdminMode, isSignup, loading, name, passcode, verifiedAdminPasscode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submit();
  };

  useEffect(() => {
    if (isSignup || isAdminMode || loading || showSuccess) return;
    if (passcode.length !== 4) {
      autoSubmitLock.current = false;
      return;
    }
    if (autoSubmitLock.current) return;

    autoSubmitLock.current = true;
    void submit();
  }, [isAdminMode, isSignup, loading, passcode, showSuccess, submit]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const handleKeypad = (key: (typeof KEYS)[number]) => {
    if (loading) return;
    if (key === 'clear') {
      setPasscode('');
      return;
    }
    if (key === 'back') {
      setPasscode(prev => prev.slice(0, -1));
      return;
    }
    setPasscode(prev => (prev.length < 4 ? `${prev}${key}` : prev));
  };

  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="app-surface min-h-screen px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
          <div className="hidden lg:flex flex-col justify-center">
            <div className="max-w-xl">
              <div className="mb-8 flex h-36 items-center px-1">
                <img
                  src="/modern-state-logo-v2.png"
                  alt="Modern State"
                  className="h-[10rem] w-full max-w-[37rem] object-contain mix-blend-multiply"
                />
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-white/75 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground shadow-sm backdrop-blur-sm">
                Modern State
              </div>
              <h1 className="mt-5 text-5xl font-semibold tracking-[-0.05em] text-foreground xl:text-6xl">
                All Zentro Solutions
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground xl:text-lg xl:leading-8">
                Use this app to receive incoming boxes and pallets before processing. Questions about the app? Contact Sebastian.
              </p>
            </div>
          </div>

          <Card className="relative mx-auto w-full max-w-[30rem] overflow-hidden rounded-xl border border-white/90 bg-white/96 panel-shadow backdrop-blur">
            <CardContent className="relative p-6 sm:p-7">
              <div
                className={cn(
                  'absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/96 px-8 text-center transition-all duration-500 backdrop-blur',
                  showSuccess ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                )}
              >
                <div className="mb-4 h-px w-16 bg-foreground/20" />
                <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">Welcome</p>
                <h3 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">{successName}</h3>
                <p className="mt-3 text-sm text-muted-foreground">{statusMessage || 'Opening workspace...'}</p>
              </div>

              <div className="mb-6 lg:hidden">
                <div className="mx-auto flex h-24 w-full max-w-[19rem] items-center justify-center px-1">
                  <img
                    src="/modern-state-logo-v2.png"
                    alt="Modern State"
                    className="h-[7rem] w-full object-contain mix-blend-multiply"
                  />
                </div>
              </div>

              <div className="mb-6 text-center">
                <p className="text-lg font-semibold tracking-tight text-foreground">All Zentro Solutions</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.34em] text-muted-foreground">Modern State</p>
                <div className="mt-3">
                  <p className="text-[0.8rem] uppercase tracking-[0.28em] text-muted-foreground">{formattedDate}</p>
                  <h2 className="mt-2 text-[2.15rem] font-semibold tracking-[-0.06em] text-foreground sm:text-[2.75rem]">
                    {formattedTime}
                  </h2>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {isAdminMode
                    ? 'Admin verification required'
                    : isSignup
                    ? 'Create a new employee passcode'
                    : 'Enter your 4-digit passcode'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {isSignup && (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Name</Label>
                    <Input
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="h-12 rounded-2xl border-border/70 bg-white px-4 text-base"
                      autoFocus
                      placeholder="Employee name"
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {isAdminMode ? 'Admin Passcode' : 'Passcode'}
                    </Label>
                    {mode === 'login' && <span className="text-xs text-muted-foreground">Returning users</span>}
                  </div>
                  <div className="flex items-center justify-center gap-3 py-1">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className={cn(
                          'h-2.5 w-2.5 rounded-full transition-all duration-300',
                          passcode[index]
                            ? 'scale-100 bg-foreground shadow-[0_3px_10px_rgba(15,23,42,0.18)]'
                            : 'scale-90 bg-black/10'
                        )}
                      />
                    ))}
                  </div>
                  {loading && !showSuccess && (
                    <p className="text-center text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      {statusMessage}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {KEYS.map(key => (
                    <Button
                      key={key}
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-14 rounded-xl text-lg font-medium shadow-none transition-all duration-200 active:scale-[0.98]',
                        key === 'clear'
                          ? 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/60'
                          : 'bg-white/94 ring-1 ring-black/6 hover:bg-[#f7f7f8] hover:ring-black/10'
                      )}
                      onClick={() => handleKeypad(key)}
                    >
                      {key === 'clear' ? 'Clear' : key === 'back' ? <Delete className="h-5 w-5" /> : key}
                    </Button>
                  ))}
                </div>

                {isSignup || isAdminMode ? (
                  <Button
                    type="submit"
                    disabled={loading || (isSignup && !name.trim()) || passcode.length !== 4}
                    className="h-12 w-full rounded-xl bg-foreground text-base font-semibold text-background shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition-transform duration-200 active:scale-[0.99] hover:bg-foreground/92"
                  >
                    {loading ? 'Please wait...' : isAdminMode ? 'Verify admin' : 'Register employee'}
                  </Button>
                ) : (
                  <div className="h-12" aria-hidden="true" />
                )}
              </form>

              <button
                className="mt-4 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => {
                  setMode(mode === 'register' ? 'login' : 'admin');
                  setPasscode('');
                  setName('');
                  setVerifiedAdminPasscode('');
                }}
              >
                {mode === 'register' ? 'Back to employee login' : 'Admin registration'}
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
