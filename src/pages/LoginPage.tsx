import { useEffect, useRef, useState } from 'react';
import { Delete } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;
const ADMIN_PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE;
type Mode = 'login' | 'admin' | 'register';

export default function LoginPage() {
  const { beginSignIn, beginSignUp, completeSignIn } = useAuth();
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [successName, setSuccessName] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const autoSubmitLock = useRef(false);

  const isSignup = mode === 'register';
  const isAdminMode = mode === 'admin';

  const submit = async () => {
    if (loading) return;
    if (isSignup && !name.trim()) return;
    if (passcode.length !== 4) return;

    setLoading(true);
    try {
      if (isAdminMode) {
        if (!ADMIN_PASSCODE) throw new Error('Admin passcode is not configured');
        if (passcode !== ADMIN_PASSCODE) throw new Error('Incorrect admin passcode');
        setMode('register');
        setPasscode('');
        setLoading(false);
        return;
      }

      const employee = isSignup ? await beginSignUp(name, passcode) : await beginSignIn(passcode);

      setSuccessName(employee.name);
      setShowSuccess(true);

      window.setTimeout(() => {
        completeSignIn(employee);
      }, 850);

      toast.success(`Welcome, ${employee.name}`);
    } catch (err: any) {
      toast.error(err.message || 'Sign-in failed');
      setPasscode('');
    } finally {
      setLoading(false);
    }
  };

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
  }, [isAdminMode, isSignup, loading, passcode, showSuccess]);

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

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f8f6_0%,#eef0f2_100%)] px-4 py-8">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="hidden lg:flex flex-col justify-center">
            <div className="max-w-xl">
              <div className="mb-8 flex h-28 w-64 items-center justify-start">
                <img
                  src="/modern-state-logo-transparent.png"
                  alt="Modern State"
                  className="max-h-24 w-auto object-contain mix-blend-multiply"
                />
              </div>
              <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground">Modern State Warehouse</p>
              <h1 className="mt-4 text-6xl font-semibold tracking-tight text-foreground">
                Receiving
                <span className="block text-muted-foreground">Control.</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
                Every box, pallet, and delivery that reaches the Modern State warehouse must be recorded here before processing. For operational questions or receiving issues, contact Sebastian.
              </p>
            </div>
          </div>

          <Card className="relative mx-auto w-full max-w-md overflow-hidden rounded-[32px] border border-white/85 bg-white/94 shadow-[0_30px_90px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardContent className="relative p-7 sm:p-9">
              <div
                className={cn(
                  'absolute inset-0 z-20 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#ffffff_0%,rgba(255,255,255,0.96)_45%,rgba(248,248,246,0.98)_100%)] px-8 text-center transition-all duration-500',
                  showSuccess ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                )}
              >
                <div className="mb-4 h-px w-16 bg-foreground/20" />
                <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">Welcome</p>
                <h3 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-foreground">{successName}</h3>
                <p className="mt-3 text-sm text-muted-foreground">Preparing your workspace...</p>
              </div>

              <div className="mb-8 text-center">
                <div className="mx-auto mb-6 flex h-24 w-52 items-center justify-center">
                  <img
                    src="/modern-state-logo-transparent.png"
                    alt="Modern State"
                    className="max-h-20 w-auto object-contain mix-blend-multiply"
                  />
                </div>
                <h2 className="text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-5xl">Welcome</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  {isAdminMode
                    ? 'Admin verification required'
                    : isSignup
                    ? 'Create a new Modern State employee passcode'
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
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      {isAdminMode ? 'Admin Passcode' : 'Passcode'}
                    </Label>
                    {mode === 'login' && <span className="text-xs text-muted-foreground">Returning users</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className={cn(
                          'flex h-14 items-center justify-center rounded-2xl text-2xl font-semibold transition-all duration-300',
                          passcode[index]
                            ? 'scale-[1.02] bg-white text-foreground shadow-[0_10px_28px_rgba(15,23,42,0.08)] ring-1 ring-black/8'
                            : 'bg-[#f7f7f8] text-muted-foreground ring-1 ring-black/5'
                        )}
                      >
                        <span
                          className={cn(
                            'transition-all duration-300',
                            passcode[index] ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                          )}
                        >
                          •
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {KEYS.map(key => (
                    <Button
                      key={key}
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-16 rounded-[22px] text-xl font-medium shadow-none transition-all duration-200 active:scale-[0.98]',
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
                    className="h-14 w-full rounded-2xl bg-foreground text-base font-semibold text-background shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition-transform duration-200 active:scale-[0.99] hover:bg-foreground/92"
                  >
                    {loading ? 'Please wait...' : isAdminMode ? 'Verify admin' : 'Register employee'}
                  </Button>
                ) : (
                  <div className="h-14" aria-hidden="true" />
                )}
              </form>

              <button
                className="mt-6 w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => {
                  setMode(mode === 'register' ? 'login' : 'admin');
                  setPasscode('');
                  setName('');
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
