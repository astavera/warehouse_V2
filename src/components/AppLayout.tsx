import { Link, useLocation } from 'react-router-dom';
import { Package, ClipboardList, Truck, Users, BarChart3, Menu, X, LogOut } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const NAV = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/receive', label: 'Receive', icon: Package },
  { to: '/history', label: 'History', icon: ClipboardList },
  { to: '/suppliers', label: 'Suppliers', icon: Users },
  { to: '/carriers', label: 'Carriers', icon: Truck },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-card border-b px-4 h-14 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button className="lg:hidden touch-target flex items-center justify-center" onClick={() => setOpen(!open)}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
            <Package className="w-6 h-6 text-primary" />
            <span className="hidden sm:inline">Warehouse Receiving</span>
            <span className="sm:hidden">WR</span>
          </Link>
        </div>
        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map(n => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                pathname === n.to
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <n.icon className="w-4 h-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Welcome, <span className="font-medium text-foreground">{user?.name}</span></span>
          <Button variant="outline" size="sm" onClick={signOut} className="gap-1.5">
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
      </header>

      {open && (
        <div className="lg:hidden fixed inset-0 top-14 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <nav className="bg-card border-b p-4 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2 text-sm text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{user?.name}</span>
            </div>
            {NAV.map(n => (
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

      <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6 xl:px-8">
        {children}
      </main>
    </div>
  );
}
