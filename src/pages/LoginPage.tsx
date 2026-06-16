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

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'spacer', '0', 'back'] as const;
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

  const handleKeypad = (key: (typeof KEYS)[number]) => {
    if (loading) return;
    if (key === 'spacer') return;
    if (key === 'back') {
      setPasscode(prev => prev.slice(0, -1));
      return;
    }
    setPasscode(prev => (prev.length < 4 ? `${prev}${key}` : prev));
  };

  return (
    <div className="app-surface min-h-screen px-5 py-6 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
          <div className="hidden lg:flex flex-col justify-center">
            <div className="max-w-xl">
              <div className="mb-8 flex h-52 items-center px-1">
                <img
                  src="/all-zentro-logo.png"
                  alt="All Zentro Solutions"
                  className="h-[13rem] w-full max-w-[34rem] object-contain"
                />
              </div>
              <h1 className="mt-5 text-5xl font-semibold tracking-[-0.05em] text-foreground xl:text-6xl">
                All Zentro Solutions
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground xl:text-lg xl:leading-8">
                Use this app to receive incoming boxes and pallets before processing. Questions about the app? Contact Sebastian.
              </p>
            </div>
          </div>

          <Card className="relative mx-auto w-full max-w-[24rem] overflow-hidden border-0 bg-transparent shadow-none sm:max-w-[30rem] sm:rounded-xl sm:border sm:border-white/90 sm:bg-white/96 sm:panel-shadow sm:backdrop-blur">
            <CardContent className="relative px-0 py-0 sm:p-7">
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
                <div className="mx-auto flex h-32 w-full max-w-[16rem] items-center justify-center px-1">
                  <img
                    src="/all-zentro-logo.png"
                    alt="All Zentro Solutions"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>

              <div className="mb-7 text-center">
                <p className="text-[0.95rem] font-medium leading-6 text-muted-foreground">
                  {isAdminMode
                    ? 'Admin verification required'
                    : isSignup
                    ? 'Create a new employee passcode'
                    : 'Enter your 4-digit passcode'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
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
                  <div className="flex items-center justify-center sm:justify-between">
                    <Label className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
                      {isAdminMode ? 'Admin Passcode' : 'Passcode'}
                    </Label>
                    {mode === 'login' && <span className="hidden text-xs text-muted-foreground sm:inline">Returning users</span>}
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
                  <p className="min-h-5 text-center text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    {loading && !showSuccess ? statusMessage : ''}
                  </p>
                </div>

                <div className="mx-auto grid w-fit grid-cols-3 justify-items-center gap-x-5 gap-y-4 sm:gap-x-8 sm:gap-y-4">
                  {KEYS.map(key => {
                    if (key === 'spacer') {
                      return <div key={key} className="h-[4.65rem] w-[4.65rem] sm:h-20 sm:w-20" aria-hidden="true" />;
                    }

                    return (
                      <Button
                        key={key}
                        type="button"
                        variant="ghost"
                        className={cn(
                          'h-[4.65rem] w-[4.65rem] rounded-full p-0 text-[1.7rem] font-medium shadow-none transition-all duration-150 active:scale-95 sm:h-20 sm:w-20 sm:text-3xl',
                          key === 'back'
                            ? 'border border-slate-400 bg-white text-slate-800 hover:bg-slate-50'
                            : 'bg-slate-700 text-white hover:bg-slate-800'
                        )}
                        onClick={() => handleKeypad(key)}
                        aria-label={key === 'back' ? 'Backspace' : `Number ${key}`}
                      >
                        {key === 'back' ? <Delete className="h-5 w-5 sm:h-6 sm:w-6" /> : key}
                      </Button>
                    );
                  })}
                </div>

              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
