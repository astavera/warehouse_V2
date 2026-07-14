import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Delete } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { GridBackground } from '@/components/ui/grid-background';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { canAccessModule, getDefaultLandingPath } from '@/lib/permissions';
import { displayEmployeeName } from '@/lib/employeeDisplay';
import { preloadRoute } from '@/lib/routePreloaders';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'spacer', '0', 'back'] as const;
type Mode = 'login' | 'password' | 'admin' | 'register';

export default function LoginPage() {
  const { beginSignIn, beginAdminSignIn, sendPasswordReset, beginSignUp, completeSignIn } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [verifiedAdminPasscode, setVerifiedAdminPasscode] = useState('');
  const autoSubmitLock = useRef(false);
  const lastPointerInputRef = useRef(0);

  const isSignup = mode === 'register';
  const isAdminMode = mode === 'admin';
  const isPasswordMode = mode === 'password';

  const submit = useCallback(async () => {
    if (loading) return;
    if (isPasswordMode && (!email.trim() || !password)) return;
    if (isSignup && !name.trim()) return;
    if (!isPasswordMode && passcode.length !== 4) return;

    setLoading(true);
    setStatusMessage(
      isPasswordMode
        ? 'Checking accounting account...'
        : isAdminMode
        ? 'Verifying admin...'
        : isSignup
        ? 'Creating employee...'
        : 'Checking passcode...'
    );
    try {
      if (isAdminMode) {
        setVerifiedAdminPasscode(passcode);
        setMode('register');
        setPasscode('');
        setStatusMessage('');
        setLoading(false);
        return;
      }

      const employee = isPasswordMode
        ? await beginAdminSignIn(email, password)
        : isSignup
        ? await beginSignUp(name, passcode, verifiedAdminPasscode)
        : await beginSignIn(passcode);

      const employeeName = displayEmployeeName(employee.name);
      const landingPath = isPasswordMode && canAccessModule(employee, 'accounting')
        ? '/accounting'
        : getDefaultLandingPath(employee);

      setSuccessName(employeeName);
      setStatusMessage('Opening workspace...');
      setShowSuccess(true);
      preloadRoute(landingPath);

      window.setTimeout(() => {
        flushSync(() => completeSignIn(employee));
        navigate(landingPath, { replace: true });
      }, 120);

      toast.success(`Welcome, ${employeeName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign-in failed');
      setPasscode('');
      setPassword('');
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  }, [
    beginAdminSignIn,
    beginSignIn,
    beginSignUp,
    completeSignIn,
    email,
    isAdminMode,
    isPasswordMode,
    isSignup,
    loading,
    name,
    navigate,
    passcode,
    password,
    verifiedAdminPasscode,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submit();
  };

  const handlePasswordReset = async () => {
    if (loading) return;
    if (!email.trim()) {
      setStatusMessage('Enter the accounting email first.');
      toast.error('Enter the accounting email first');
      return;
    }

    setLoading(true);
    setStatusMessage('Sending reset link...');
    try {
      await sendPasswordReset(email);
      toast.success('Password reset email sent');
      setStatusMessage('Check your email for the newest reset link.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Password reset failed';
      toast.error(message);
      setStatusMessage(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSignup || isAdminMode || isPasswordMode || loading || showSuccess) return;
    if (passcode.length !== 4) {
      autoSubmitLock.current = false;
      return;
    }
    if (autoSubmitLock.current) return;

    autoSubmitLock.current = true;
    void submit();
  }, [isAdminMode, isPasswordMode, isSignup, loading, passcode, showSuccess, submit]);

  const handleKeypad = useCallback((key: (typeof KEYS)[number]) => {
    if (loading) return;
    if (key === 'spacer') return;
    if (key === 'back') {
      setPasscode(prev => prev.slice(0, -1));
      return;
    }
    setPasscode(prev => (prev.length < 4 ? `${prev}${key}` : prev));
  }, [loading]);

  const handleKeypadPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, key: (typeof KEYS)[number]) => {
      event.preventDefault();
      lastPointerInputRef.current = globalThis.performance?.now?.() ?? Date.now();
      handleKeypad(key);
    },
    [handleKeypad]
  );

  const handleKeypadClick = useCallback(
    (key: (typeof KEYS)[number]) => {
      const now = globalThis.performance?.now?.() ?? Date.now();
      if (now - lastPointerInputRef.current < 450) return;
      handleKeypad(key);
    },
    [handleKeypad]
  );

  useEffect(() => {
    const handlePhysicalKeyboard = (event: KeyboardEvent) => {
      if (showSuccess || isPasswordMode || event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      const isTypingField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if (isTypingField) return;

      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        handleKeypad(event.key as (typeof KEYS)[number]);
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        handleKeypad('back');
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    };

    window.addEventListener('keydown', handlePhysicalKeyboard);
    return () => window.removeEventListener('keydown', handlePhysicalKeyboard);
  }, [handleKeypad, isPasswordMode, showSuccess, submit]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white px-5 py-6 sm:px-6 sm:py-6">
      <GridBackground />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
          <div className="hidden lg:flex flex-col justify-center">
            <div className="max-w-xl">
              <div className="mb-8 flex h-52 items-center px-1 drop-shadow-[0_18px_48px_rgba(15,23,42,0.10)]">
                <img
                  src="/all-zentro-logo.png"
                  alt="All Zentro Solutions"
                  className="h-[13rem] w-full max-w-[34rem] object-contain"
                />
              </div>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground xl:text-lg xl:leading-8">
                Use this app to receive incoming boxes and pallets before processing. Questions about the app? Contact Sebastian.
              </p>
            </div>
          </div>

          <Card className="relative mx-auto w-full max-w-[24rem] overflow-hidden border-0 bg-white/94 shadow-[0_18px_48px_rgba(15,23,42,0.10)] backdrop-blur-sm sm:max-w-[30rem] sm:rounded-xl sm:border sm:border-white/80">
            <CardContent className="relative px-0 py-0 sm:p-7">
              <div
                className={cn(
                  'absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/96 px-8 text-center transition-opacity duration-200 backdrop-blur-sm',
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
                  {isPasswordMode
                    ? 'Accounting access requires email and password'
                    : isAdminMode
                    ? 'Admin verification required'
                    : isSignup
                    ? 'Create a new employee passcode'
                    : 'Enter your 4-digit passcode'}
                </p>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-muted/40 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    'h-11 rounded-xl text-sm font-semibold shadow-none',
                    mode === 'login' && 'bg-white text-foreground shadow-sm hover:bg-white'
                  )}
                  onClick={() => {
                    setMode('login');
                    setPasscode('');
                    setPassword('');
                    setStatusMessage('');
                  }}
                >
                  Passcode
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    'h-11 rounded-xl text-sm font-semibold shadow-none',
                    isPasswordMode && 'bg-white text-foreground shadow-sm hover:bg-white'
                  )}
                  onClick={() => {
                    setMode('password');
                    setPasscode('');
                    setStatusMessage('');
                  }}
                >
                  Login
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {isPasswordMode ? (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Email</Label>
                      <Input
                        required
                        type="email"
                        value={email}
                        onChange={event => setEmail(event.target.value)}
                        className="h-12 rounded-2xl border-border/70 bg-white px-4 text-base"
                        autoFocus
                        autoComplete="email"
                        placeholder="admin@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Password</Label>
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto px-0 text-xs font-semibold text-muted-foreground hover:text-foreground"
                          onClick={handlePasswordReset}
                          disabled={loading}
                        >
                          Forgot password?
                        </Button>
                      </div>
                      <Input
                        required
                        type="password"
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                        className="h-12 rounded-2xl border-border/70 bg-white px-4 text-base"
                        autoComplete="current-password"
                        placeholder="Password"
                      />
                    </div>
                    <p className="min-h-5 text-center text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      {!showSuccess ? statusMessage : ''}
                    </p>
                    <Button
                      type="submit"
                      className="h-12 w-full rounded-2xl text-sm font-bold"
                      disabled={loading || !email.trim() || !password}
                    >
                      {loading ? 'Entering...' : 'Enter'}
                    </Button>
                  </>
                ) : (
                  <>
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
                        {mode === 'login' && <span className="hidden text-xs text-muted-foreground sm:inline">Warehouse access</span>}
                      </div>
                      <div className="flex items-center justify-center gap-3 py-1">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={index}
                            className={cn(
                              'h-2.5 w-2.5 rounded-full transition-colors duration-100',
                              passcode[index] ? 'bg-foreground' : 'bg-black/10'
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
                              'login-keypad-button h-[4.65rem] w-[4.65rem] touch-manipulation select-none rounded-full p-0 text-[1.7rem] font-medium shadow-none transition-colors duration-75 active:translate-y-px sm:h-20 sm:w-20 sm:text-3xl',
                              key === 'back'
                                ? 'border border-slate-400 bg-white text-slate-800 hover:bg-slate-50'
                                : 'bg-slate-700 text-white hover:bg-slate-800'
                            )}
                            onPointerDown={event => handleKeypadPointerDown(event, key)}
                            onClick={() => handleKeypadClick(key)}
                            aria-label={key === 'back' ? 'Backspace' : `Number ${key}`}
                          >
                            {key === 'back' ? <Delete className="h-5 w-5 sm:h-6 sm:w-6" /> : key}
                          </Button>
                        );
                      })}
                    </div>
                  </>
                )}

              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
