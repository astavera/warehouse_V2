import { Link, useLocation } from 'react-router-dom';
import {
  Package,
  ClipboardList,
  Truck,
  Users,
  BarChart3,
  Menu,
  X,
  LogOut,
  PackageSearch,
  Cloud,
  RefreshCw,
  WifiOff,
  Tag,
  SearchCheck,
  Settings,
  Landmark,
  ReceiptText,
  CreditCard,
  Upload,
  Database,
  ChevronDown,
  Warehouse,
  BookOpenCheck,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { canAccessModule, type AppModule } from '@/lib/permissions';
import { preloadRoute, preloadRoutes } from '@/lib/routePreloaders';

type AppNavItem = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  module: AppModule;
  exact?: boolean;
};

const APP_NAV_GROUPS = [
  {
    label: 'Dashboard',
    icon: BarChart3,
    items: [
      {
        to: '/',
        label: 'Dashboard',
        description: 'Main warehouse snapshot',
        icon: BarChart3,
        module: 'receiving',
        exact: true,
      },
    ],
  },
  {
    label: 'Warehouse',
    icon: Warehouse,
    items: [
      {
        to: '/receive',
        label: 'Receiving',
        description: 'Scan and receive boxes',
        icon: Package,
        module: 'receiving',
      },
      {
        to: '/expected-boxes',
        label: 'Expected Boxes',
        description: 'Inbound packages and WH status',
        icon: PackageSearch,
        module: 'expected_boxes',
      },
      {
        to: '/history',
        label: 'History',
        description: 'Received activity log',
        icon: ClipboardList,
        module: 'receiving',
      },
      {
        to: '/suppliers',
        label: 'Suppliers',
        description: 'Supplier directory',
        icon: Users,
        module: 'receiving',
      },
      {
        to: '/carriers',
        label: 'Carriers',
        description: 'Carrier contacts and delivery notes',
        icon: Truck,
        module: 'receiving',
      },
    ],
  },
  {
    label: 'Control',
    icon: SearchCheck,
    items: [
      {
        to: '/prices',
        label: 'Prices',
        description: 'Price change queue',
        icon: Tag,
        module: 'prices',
      },
      {
        to: '/inventory-audit',
        label: 'Audit',
        description: 'Cycle counts and mismatch review',
        icon: SearchCheck,
        module: 'audit',
      },
    ],
  },
  {
    label: 'Accounting',
    icon: BookOpenCheck,
    items: [
      {
        to: '/accounting',
        label: 'Overview',
        description: 'Payables and warehouse invoice coverage',
        icon: Landmark,
        module: 'accounting',
        exact: true,
      },
      {
        to: '/accounting/vendors',
        label: 'Vendors',
        description: 'Terms and mailing setup',
        icon: Users,
        module: 'accounting',
      },
      {
        to: '/accounting/invoices',
        label: 'Invoices',
        description: 'Create, split checks, and review invoices',
        icon: ReceiptText,
        module: 'accounting',
      },
      {
        to: '/accounting/paid-invoices',
        label: 'Paid invoices',
        description: 'Check payment ledger',
        icon: ClipboardList,
        module: 'accounting',
      },
      {
        to: '/accounting/credit-card-payments',
        label: 'Credit cards',
        description: 'Card payments and accounts',
        icon: CreditCard,
        module: 'accounting',
      },
      {
        to: '/accounting/personal-bills',
        label: 'Personal bills',
        description: 'Personal bill payment tracking',
        icon: ReceiptText,
        module: 'accounting',
      },
      {
        to: '/accounting/truck',
        label: 'Truck',
        description: 'Truck expenses and violations',
        icon: Truck,
        module: 'accounting',
      },
      {
        to: '/accounting/imports',
        label: 'Imports',
        description: 'Workbook import history',
        icon: Upload,
        module: 'accounting',
      },
      {
        to: '/accounting/catalogs',
        label: 'Catalogs',
        description: 'Stores, categories, accounts',
        icon: Database,
        module: 'accounting',
      },
    ],
  },
  {
    label: 'Settings',
    icon: Settings,
    items: [
      {
        to: '/settings',
        label: 'Settings',
        description: 'Users, permissions, and mappings',
        icon: Settings,
        module: 'settings',
      },
    ],
  },
] as const;

const APP_NAV_ITEMS = APP_NAV_GROUPS.flatMap(group => group.items);
const MOBILE_COLLAPSIBLE_GROUPS = new Set(['Warehouse', 'Control', 'Accounting']);

function isNavItemActive(pathname: string, item: AppNavItem) {
  if (item.exact || item.to === '/') return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function AppDropdownItem({
  active,
  item,
  onNavigate,
}: {
  active: boolean;
  item: AppNavItem;
  onNavigate: (path: string) => void;
}) {
  return (
    <Link
      to={item.to}
      onClick={() => onNavigate(item.to)}
      onFocus={() => preloadRoute(item.to)}
      onMouseEnter={() => preloadRoute(item.to)}
      onPointerDown={() => preloadRoute(item.to)}
      className={cn(
        'flex h-9 items-center rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground focus:outline-none',
        active && 'bg-foreground text-background hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background'
      )}
    >
      {item.label}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [desktopOpenGroup, setDesktopOpenGroup] = useState<string | null>(null);
  const [mobileOpenGroups, setMobileOpenGroups] = useState<Set<string>>(() => new Set(['Warehouse']));
  const { user, signOut } = useAuth();
  const { isLocalDemo, isOffline, pendingCount, syncing, syncNow } = useOfflineStatus();
  const visibleGroups = APP_NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item => canAccessModule(user, item.module)),
    }))
    .filter(group => group.items.length > 0);
  const visibleNav = APP_NAV_ITEMS.filter(item => canAccessModule(user, item.module));
  const preloadableRouteKey = visibleNav.map(item => item.to).join('|');
  const dashboardNav = visibleNav.find(item => item.to === '/');
  const desktopGroups = visibleGroups.filter(group => group.label !== 'Settings' && group.label !== 'Dashboard');
  const canOpenSettings = canAccessModule(user, 'settings');
  const activePathname = pendingPath ?? pathname;
  const activeMobileGroupLabel = visibleGroups.find(group =>
    group.items.some(item => isNavItemActive(activePathname, item))
  )?.label;
  const statusLabel = isLocalDemo ? 'Local' : isOffline ? 'Offline' : pendingCount > 0 ? `Pending ${pendingCount}` : '';
  const StatusIcon = isOffline ? WifiOff : pendingCount > 0 ? RefreshCw : Cloud;
  const showDataStatus = Boolean(statusLabel);
  const showOfflineBanner = !isLocalDemo && (isOffline || pendingCount > 0 || syncing);
  const offlineBannerText = isOffline
    ? `Offline mode active${pendingCount > 0 ? ` - ${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync` : ''}. Receipts save on this device.`
    : pendingCount > 0
      ? `${pendingCount} offline change${pendingCount === 1 ? '' : 's'} ready to sync.`
      : 'Syncing offline changes...';

  useEffect(() => {
    setPendingPath(null);
    setDesktopOpenGroup(null);
  }, [pathname]);

  useEffect(() => {
    if (!activeMobileGroupLabel || !MOBILE_COLLAPSIBLE_GROUPS.has(activeMobileGroupLabel)) return;
    setMobileOpenGroups(prev => {
      if (prev.has(activeMobileGroupLabel)) return prev;
      const next = new Set(prev);
      next.add(activeMobileGroupLabel);
      return next;
    });
  }, [activeMobileGroupLabel]);

  useEffect(() => {
    const paths = preloadableRouteKey ? preloadableRouteKey.split('|') : [];
    if (canOpenSettings) paths.push('/settings');
    let cancelPreloads: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      cancelPreloads = preloadRoutes(paths, 90);
    }, 350);
    return () => {
      window.clearTimeout(timer);
      cancelPreloads?.();
    };
  }, [canOpenSettings, preloadableRouteKey]);

  const handleNavIntent = (path: string) => {
    preloadRoute(path);
  };

  const handleNavClick = (path: string) => {
    setPendingPath(path);
    setDesktopOpenGroup(null);
    preloadRoute(path);
  };

  const handleDesktopGroupBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDesktopOpenGroup(null);
  };

  const toggleMobileGroup = (label: string) => {
    setMobileOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <div className="app-surface min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-white/90 px-4 backdrop-blur-xl">
        <div className="mx-auto grid min-h-16 w-full max-w-[1600px] grid-cols-[1fr_auto] items-center gap-3 py-2 lg:grid-cols-[minmax(230px,1fr)_auto_minmax(270px,1fr)]">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="lg:hidden touch-target flex items-center justify-center rounded-lg hover:bg-muted"
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link
              to="/"
              onClick={() => handleNavClick('/')}
              onFocus={() => handleNavIntent('/')}
              onMouseEnter={() => handleNavIntent('/')}
              onPointerDown={() => handleNavIntent('/')}
              className="flex min-w-0 items-center gap-2.5 font-semibold transition-opacity hover:opacity-85"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden">
                <img src="/all-zentro-logo-square.png" alt="" className="h-9 w-9 object-contain" />
              </span>
              <span className="block min-w-0 truncate text-base font-extrabold leading-tight tracking-tight text-slate-950">
                All Zentro Solutions
              </span>
            </Link>
          </div>

          <div className="hidden min-w-0 justify-center lg:flex">
            <nav className="flex h-auto max-w-full flex-wrap justify-center gap-1 rounded-full border border-border/80 bg-white/95 p-1 shadow-[0_10px_30px_rgba(15,23,42,0.06)]" aria-label="Main navigation">
              {dashboardNav && (
                <Link
                  to={dashboardNav.to}
                  onClick={() => handleNavClick(dashboardNav.to)}
                  onFocus={() => handleNavIntent(dashboardNav.to)}
                  onMouseEnter={() => handleNavIntent(dashboardNav.to)}
                  onPointerDown={() => handleNavIntent(dashboardNav.to)}
                  className={cn(
                    'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    isNavItemActive(activePathname, dashboardNav) && 'bg-foreground text-background hover:bg-foreground hover:text-background'
                  )}
                >
                  Dashboard
                </Link>
              )}
              {desktopGroups.map(group => {
                const groupActive = group.items.some(item => isNavItemActive(activePathname, item));
                const groupLanding = group.items[0];

                return (
                  <div
                    key={group.label}
                    className="relative"
                    onBlur={handleDesktopGroupBlur}
                    onFocus={() => setDesktopOpenGroup(group.label)}
                    onMouseEnter={() => setDesktopOpenGroup(group.label)}
                    onMouseLeave={() => setDesktopOpenGroup(null)}
                  >
                    <Link
                      to={groupLanding.to}
                      onClick={() => handleNavClick(groupLanding.to)}
                      onFocus={() => handleNavIntent(groupLanding.to)}
                      onMouseEnter={() => handleNavIntent(groupLanding.to)}
                      onPointerDown={() => handleNavIntent(groupLanding.to)}
                      className={cn(
                        'inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground focus:outline-none',
                        groupActive && 'bg-foreground text-background hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background'
                      )}
                    >
                      {group.label}
                    </Link>
                    {group.items.length > 1 && (
                      <div
                        className={cn(
                          'absolute left-1/2 top-full z-50 min-w-[180px] -translate-x-1/2 pt-2 transition',
                          desktopOpenGroup === group.label
                            ? 'visible opacity-100'
                            : 'invisible pointer-events-none opacity-0'
                        )}
                      >
                        <div className="rounded-lg border border-border/70 bg-white p-1.5 shadow-xl">
                          {group.items.map(item => (
                            <AppDropdownItem
                              key={`${group.label}-${item.to}`}
                              item={item}
                              active={isNavItemActive(activePathname, item)}
                              onNavigate={handleNavClick}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          <div className="flex min-w-0 justify-end">
            <div className="hidden items-center gap-2 lg:flex">
              {showDataStatus && (
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={isLocalDemo || isOffline || pendingCount === 0 || syncing}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
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
              <div className="max-w-[150px] truncate text-sm">
                <span className="font-medium text-foreground">{user?.name}</span>
              </div>
              {canOpenSettings && (
                <Link
                  to="/settings"
                  onClick={() => handleNavClick('/settings')}
                  onFocus={() => handleNavIntent('/settings')}
                  onMouseEnter={() => handleNavIntent('/settings')}
                  onPointerDown={() => handleNavIntent('/settings')}
                  className={cn(
                    'inline-flex h-10 items-center gap-1.5 rounded-lg border border-border/70 bg-white px-3 text-sm font-medium shadow-sm transition-colors',
                    activePathname === '/settings'
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={signOut} className="h-10 gap-1.5 rounded-lg bg-white">
                <LogOut className="w-4 h-4" /> Sign out
              </Button>
            </div>
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
          <nav className="max-h-[calc(100vh-4rem)] overflow-y-auto border-b bg-white py-4 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="px-8 py-2 text-sm text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{user?.name}</span>
            </div>
            {showDataStatus && (
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={isLocalDemo || isOffline || pendingCount === 0 || syncing}
                className="mx-5 mb-2 inline-flex items-center gap-2 rounded-lg border border-border/70 bg-white px-3 py-2 text-sm font-medium text-muted-foreground"
                aria-label={pendingCount > 0 ? `Sync ${pendingCount} pending offline changes` : statusLabel}
              >
                <StatusIcon className={cn('h-4 w-4', syncing && 'animate-spin')} />
                {statusLabel}
              </button>
            )}
            <div className="mt-1 space-y-4 px-5 pb-2">
              {visibleGroups.map(group => {
                const GroupIcon = group.icon;
                const groupActive = group.items.some(item => isNavItemActive(activePathname, item));
                const isCollapsible = MOBILE_COLLAPSIBLE_GROUPS.has(group.label);
                const groupExpanded = !isCollapsible || mobileOpenGroups.has(group.label);
                const showGroupHeader = isCollapsible || group.items.length > 1;

                return (
                  <div key={group.label} className="space-y-1.5">
                    {showGroupHeader && isCollapsible && (
                      <button
                        type="button"
                        onClick={() => toggleMobileGroup(group.label)}
                        aria-expanded={groupExpanded}
                        className={cn(
                          'flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors touch-target',
                          groupActive
                            ? 'bg-red-50/80 text-slate-950'
                            : 'text-slate-600 hover:bg-red-50/70 hover:text-slate-950'
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <GroupIcon className={cn('h-4 w-4', groupActive ? 'text-red-600' : 'text-slate-400')} />
                          {group.label}
                        </span>
                        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', groupExpanded && 'rotate-180')} />
                      </button>
                    )}
                    {showGroupHeader && !isCollapsible && (
                      <div
                        className={cn(
                          'flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
                          groupActive ? 'text-slate-950' : 'text-muted-foreground'
                        )}
                      >
                        <GroupIcon className={cn('h-3.5 w-3.5', groupActive && 'text-red-600')} />
                        {group.label}
                      </div>
                    )}
                    {groupExpanded && <div className={cn('space-y-1', showGroupHeader && 'pl-2')}>
                      {group.items.map(item => {
                        const ItemIcon = item.icon;
                        const active = isNavItemActive(activePathname, item);

                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => {
                              handleNavClick(item.to);
                              setOpen(false);
                            }}
                            onFocus={() => handleNavIntent(item.to)}
                            onMouseEnter={() => handleNavIntent(item.to)}
                            onPointerDown={() => handleNavIntent(item.to)}
                            className={cn(
                              'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors touch-target',
                              active
                                ? 'border border-red-600/20 bg-slate-950 text-white shadow-sm'
                                : 'text-slate-600 hover:bg-red-50/70 hover:text-slate-950'
                            )}
                          >
                            <ItemIcon className={cn('h-4 w-4 shrink-0', active ? 'text-red-400' : 'text-slate-400')} />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>}
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" onClick={signOut} className="mx-auto mt-2 gap-1.5">
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
