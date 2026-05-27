import { Link, useLocation } from 'react-router-dom';
import { Package, ClipboardList, Truck, Users, BarChart3, Menu, X, LogOut, Warehouse, PackageSearch, Cloud, RefreshCw, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useExpectedBoxAccess } from '@/hooks/useExpectedBoxes';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';

const NAV = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/receive', label: 'Receive', icon: Package },
  { to: '/expected-boxes', label: 'Expected Boxes', icon: PackageSearch, restrictedTo: ['sharon', 'sebastian'] },
  { to: '/history', label: 'History', icon: ClipboardList },
  { to: '/suppliers', label: 'Suppliers', icon: Users },
  { to: '/carriers', label: 'Carriers', icon: Truck },
];

function canSeeNavItem(name: string | undefined, item: (typeof NAV)[number]) {
  if (!item.restrictedTo) return true;
  const normalizedName = name?.trim().toLowerCase() || '';
  return item.restrictedTo.includes(normalizedName);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { access } = useExpectedBoxAccess();
  const { isLocalDemo, isOffline, pendingCount, syncing, syncNow } = useOfflineStatus();
  const hasExpectedBoxesAccess = Boolean(user && access.some(entry => entry.employee_id === user.id && entry.can_view));
  const canConfigureExpectedBoxes = Boolean(user?.name?.trim().toLowerCase() === 'sebastian' || user?.name?.trim().toLowerCase().includes('admin'));
  const visibleNav = NAV.filter(item => {
    if (item.to !== '/expected-boxes') return canSeeNavItem(user?.name, item);
    return hasExpectedBoxesAccess || canConfigureExpectedBoxes;
  });
  const statusLabel = isLocalDemo ? 'Local' : isOffline ? 'Offline' : pendingCount > 0 ? `Pending ${pendingCount}` : '';
  const StatusIcon = isOffline ? WifiOff : pendingCount > 0 ? RefreshCw : Cloud;
  const showDataStatus = Boolean(statusLabel);
  const showOfflineBanner = !isLocalDemo && (isOffline || pendingCount > 0 || syncing);
  const offlineBannerText = isOffline
    ? `Offline mode active${pendingCount > 0 ? ` - ${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync` : ''}. Receipts save on this device.`
    : pendingCount > 0
      ? `${pendingCount} offline change${pendingCount === 1 ? '' : 's'} ready to sync.`
      : 'Syncing offline changes...';

  return (
    <div className="app-surface min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-white/88 px-4 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="lg:hidden touch-target flex items-center justify-center rounded-lg hover:bg-muted"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/" className="flex min-w-0 items-center gap-3 font-semibold">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Warehouse className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Modern State</span>
              <span className="block truncate text-base font-semibold text-foreground">Warehouse Receiving</span>
            </span>
          </Link>
        </div>
        <nav className="hidden items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1 lg:flex">
          {visibleNav.map(n => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === n.to
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <n.icon className="w-4 h-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 lg:flex">
          {showDataStatus && (
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={isLocalDemo || isOffline || pendingCount === 0 || syncing}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium',
                isOffline
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-border/70 bg-white text-muted-foreground',
                pendingCount > 0 && !isOffline && !isLocalDemo && 'text-primary'
              )}
              aria-label={pendingCount > 0 ? `Sync ${pendingCount} pending offline changes` : statusLabel}
            >
              <StatusIcon className={cn('h-4 w-4', syncing && 'animate-spin')} />
              {statusLabel}
            </button>
          )}
          <div className="rounded-xl border border-border/70 bg-white px-3 py-2 text-sm">
            <span className="text-muted-foreground">Welcome, </span>
            <span className="font-medium text-foreground">{user?.name}</span>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="h-10 gap-1.5 rounded-xl bg-white">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
        </div>
      </header>

      {showOfflineBanner && (
        <div
          className={cn(
            'border-b px-4 py-2 text-sm font-medium',
            isOffline
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-primary/20 bg-primary/8 text-primary'
          )}
        >
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon className={cn('h-4 w-4 shrink-0', syncing && 'animate-spin')} />
              <span>{offlineBannerText}</span>
            </div>
            {!isOffline && pendingCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-fit rounded-lg bg-white"
                disabled={syncing}
                onClick={() => void syncNow()}
              >
                {syncing ? 'Syncing...' : 'Sync now'}
              </Button>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 top-16 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <nav className="flex flex-col gap-1 border-b bg-white p-4 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2 text-sm text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{user?.name}</span>
            </div>
            {showDataStatus && (
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={isLocalDemo || isOffline || pendingCount === 0 || syncing}
                className="mx-4 mb-2 inline-flex items-center gap-2 rounded-lg border border-border/70 bg-white px-3 py-2 text-sm font-medium text-muted-foreground"
                aria-label={pendingCount > 0 ? `Sync ${pendingCount} pending offline changes` : statusLabel}
              >
                <StatusIcon className={cn('h-4 w-4', syncing && 'animate-spin')} />
                {statusLabel}
              </button>
            )}
            {visibleNav.map(n => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors touch-target',
                  pathname === n.to
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <n.icon className="w-5 h-5" />
                {n.label}
              </Link>
            ))}
            <Button variant="outline" size="sm" onClick={signOut} className="mt-2 gap-1.5">
              <LogOut className="w-4 h-4" /> Sign out
            </Button>
          </nav>
        </div>
      )}

      <main className={cn('mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6 xl:px-8', pathname === '/receive' && 'receive-main')}>
        {children}
      </main>
    </div>
  );
}
