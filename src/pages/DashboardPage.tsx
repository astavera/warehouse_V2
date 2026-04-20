import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, ClipboardList, Package, Sparkles, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useTodayBatches, useCarriers, useEmployees, useSuppliers, useReceiptDates } from '@/hooks/useSupabaseData';
import { useAuth } from '@/hooks/useAuth';
import { getCarrierBrand, getCarrierInitials } from '@/lib/carrierLogos';
import { cn } from '@/lib/utils';

function CarrierBadge({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const brand = getCarrierBrand(name);
  const cls = size === 'sm' ? 'h-7 w-7 text-[9px]' : 'h-9 w-9 text-[11px]';
  if (brand) {
    return (
      <div
        className={`${cls} flex shrink-0 items-center justify-center rounded-lg font-bold`}
        style={{ backgroundColor: brand.bg, color: brand.fg }}
      >
        {brand.abbr}
      </div>
    );
  }

  return (
    <div className={`${cls} flex shrink-0 items-center justify-center rounded-lg bg-muted font-bold text-muted-foreground`}>
      {getCarrierInitials(name)}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: any;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden border-border/70">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-bold">{value}</p>
          </div>
          <div className={cn('rounded-xl p-3', accent ? 'bg-destructive/10' : 'bg-primary/10')}>
            <Icon className={cn('h-5 w-5', accent ? 'text-destructive' : 'text-primary')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const { user } = useAuth();
  const { batches, loading } = useTodayBatches();
  const { carriers } = useCarriers();
  const { employees } = useEmployees();
  const { suppliers } = useSuppliers();
  const { dates: receiptDates } = useReceiptDates();

  const totalItems = batches.reduce((sum, batch) => sum + batch.receipt_items.length, 0);
  const totalPackages = batches.reduce(
    (sum, batch) => sum + batch.receipt_items.reduce((inner, item) => inner + item.package_count, 0),
    0
  );
  const damagedCount = batches.reduce(
    (sum, batch) => sum + batch.receipt_items.filter(item => item.damaged_box).length,
    0
  );

  const palletCount = batches.reduce(
    (sum, batch) =>
      sum +
      batch.receipt_items
        .filter(item => {
          const value = item.package_type.toLowerCase();
          return value === 'pallet' || value === 'pallets';
        })
        .reduce((inner, item) => inner + item.package_count, 0),
    0
  );

  const boxCount = batches.reduce(
    (sum, batch) =>
      sum +
      batch.receipt_items
        .filter(item => {
          const value = item.package_type.toLowerCase();
          return value === 'box' || value === 'boxes';
        })
        .reduce((inner, item) => inner + item.package_count, 0),
    0
  );

  const carrierBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    batches.forEach(batch => {
      if (batch.carrier_id) map[batch.carrier_id] = (map[batch.carrier_id] || 0) + batch.receipt_items.length;
    });

    return Object.entries(map)
      .map(([id, count]) => ({ name: carriers.find(carrier => carrier.id === id)?.name || id, count }))
      .sort((a, b) => b.count - a.count);
  }, [batches, carriers]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setHeroCollapsed(true), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-5">
      <section
        className={cn(
          'relative overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(140deg,hsl(var(--card)),hsl(var(--muted)/0.75)),radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_35%)] px-6 shadow-sm transition-all duration-700 ease-out sm:px-10',
          heroCollapsed ? 'py-6' : 'py-12'
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,hsl(var(--primary)/0.12),transparent_28%)]" />
        <div className={cn('relative mx-auto flex max-w-3xl flex-col items-center text-center transition-all duration-700 ease-out', heroCollapsed ? 'gap-3' : 'gap-0')}>
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition-all duration-700 ease-out',
              heroCollapsed ? 'mb-1 scale-95 opacity-80' : 'mb-4'
            )}
          >
            <Sparkles className="h-4 w-4" />
            Warehouse kiosk ready
          </div>
          <p
            className={cn(
              'text-sm uppercase tracking-[0.26em] text-muted-foreground transition-all duration-700 ease-out',
              heroCollapsed ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'
            )}
          >
            Today {today}
          </p>
          <h1
            className={cn(
              'font-semibold tracking-tight transition-all duration-700 ease-out',
              heroCollapsed ? 'mt-0 text-2xl sm:text-3xl' : 'mt-4 text-4xl sm:text-5xl'
            )}
          >
            Welcome
            <span className="block text-primary">{user?.name}</span>
          </h1>
          <p
            className={cn(
              'max-w-2xl text-muted-foreground transition-all duration-700 ease-out',
              heroCollapsed ? 'mt-0 text-sm opacity-0 h-0 overflow-hidden' : 'mt-4 text-base sm:text-lg opacity-100'
            )}
          >
            Everything received in this session will be registered under your name. Start a new receipt when the shipment is ready in front of you.
          </p>
          <div className={cn('flex flex-col gap-3 transition-all duration-700 ease-out sm:flex-row', heroCollapsed ? 'mt-3' : 'mt-8')}>
            <Link to="/receive">
              <Button size="lg" className="touch-target gap-2 px-8">
                <Package className="h-5 w-5" /> Start New Receipt
              </Button>
            </Link>
            <Link to="/history">
              <Button size="lg" variant="outline" className="touch-target px-8">
                View History
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={ClipboardList} label="Batches" value={batches.length} />
        <StatCard icon={Package} label="Packages" value={totalPackages} />
        <StatCard icon={Truck} label="Supplier Lines" value={totalItems} />
        <StatCard icon={AlertTriangle} label="Damaged" value={damagedCount} accent />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="h-full border-border/70">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Today&apos;s Receipts</CardTitle>
                <Link to="/history" className="text-xs font-medium text-primary hover:underline">
                  View all →
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {batches.length === 0 ? (
                <div className="py-14 text-center">
                  <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No receipts recorded today</p>
                  <Link to="/receive">
                    <Button variant="outline" size="sm" className="mt-3 gap-1.5">
                      <Package className="h-4 w-4" /> Start receiving
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {batches.slice(0, 8).map(batch => {
                    const carrier = carriers.find(item => item.id === batch.carrier_id);
                    const receivedTime = new Date(batch.received_at).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const receivedBy =
                      employees.find(item => item.id === batch.received_by_employee_id)?.name ||
                      batch.received_by_text ||
                      'Unknown';
                    const supplierNames = batch.receipt_items
                      .map(item => suppliers.find(supplier => supplier.id === item.supplier_id)?.name || 'Unknown')
                      .filter((value, index, array) => array.indexOf(value) === index);
                    const totalPkg = batch.receipt_items.reduce((sum, item) => sum + item.package_count, 0);
                    const hasDamaged = batch.receipt_items.some(item => item.damaged_box);

                    return (
                      <div key={batch.id} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40">
                        <CarrierBadge name={carrier?.name || '?'} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{carrier?.name || 'Unknown'}</span>
                            {hasDamaged && (
                              <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                DMG
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {supplierNames.map(name => (
                              <span key={name} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {name}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">Received by {receivedBy}</p>
                        </div>
                        <div className="shrink-0 space-y-0.5 text-right">
                          <p className="text-xs font-medium">{totalPkg} pkg</p>
                          <p className="text-[11px] text-muted-foreground">{receivedTime}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">By Carrier</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {carrierBreakdown.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No data yet</p>
              ) : (
                <div className="space-y-2">
                  {carrierBreakdown.map(carrier => (
                    <div key={carrier.name} className="flex items-center gap-2">
                      <CarrierBadge name={carrier.name} size="sm" />
                      <span className="flex-1 truncate text-sm font-medium">{carrier.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{carrier.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Package Types</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold">{boxCount}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Boxes</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold">{palletCount}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Pallets</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-semibold">Receipt Calendar</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-3">
              <Calendar
                mode="multiple"
                selected={receiptDates}
                className={cn('p-1 pointer-events-auto [&_.rdp-table]:w-full')}
                modifiersClassNames={{
                  selected: 'bg-primary text-primary-foreground',
                }}
                disabled={() => true}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
