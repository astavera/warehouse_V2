import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Clock,
  ClipboardList,
  type LucideIcon,
  Package,
  Truck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTodayBatches, useCarriers, useEmployees, useSuppliers, useReceiptCalendarDetails } from '@/hooks/useSupabaseData';
import { useAuth } from '@/hooks/useAuth';
import CarrierBadge from '@/components/CarrierBadge';
import { cn } from '@/lib/utils';

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <Card className="overflow-hidden rounded-lg border-border/70 bg-white/95 shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex min-h-[7.5rem] flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <div
              className={cn(
                'rounded-md p-2.5',
                tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-semibold text-foreground">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { batches, loading } = useTodayBatches();
  const { carriers, loading: carriersLoading } = useCarriers();
  const { employees, loading: employeesLoading } = useEmployees();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { dates: receiptDates, detailsByDate, loading: calendarLoading } = useReceiptCalendarDetails();
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>();
  const [calendarCarrierModal, setCalendarCarrierModal] = useState<{ id: string; name: string } | null>(null);

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
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const selectedDateKey = selectedCalendarDate
    ? `${selectedCalendarDate.getFullYear()}-${String(selectedCalendarDate.getMonth() + 1).padStart(2, '0')}-${String(
        selectedCalendarDate.getDate()
      ).padStart(2, '0')}`
    : undefined;

  const selectedCalendarDetails = selectedDateKey ? detailsByDate[selectedDateKey] : undefined;
  const selectedCalendarCarrierData =
    selectedCalendarDetails?.carrierIds
      .map(id => ({
        id,
        name: carriers.find(carrier => carrier.id === id)?.name || 'Unknown carrier',
        count: selectedCalendarDetails.carrierCounts[id] || 0,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) || [];
  const selectedCarrierSupplierDetails =
    calendarCarrierModal && selectedCalendarDetails
      ? Object.entries(selectedCalendarDetails.supplierDetailsByCarrier[calendarCarrierModal.id] || {})
          .map(([supplierId, detail]) => ({
            supplierId,
            name: suppliers.find(supplier => supplier.id === supplierId)?.name || 'Unknown supplier',
            boxes: detail.boxes,
            pallets: detail.pallets,
            batchIds: detail.batchIds,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  const selectedVisualTotal = (selectedCalendarDetails?.boxCount || 0) + (selectedCalendarDetails?.palletCount || 0);
  const selectedBoxPercent = selectedVisualTotal ? Math.round(((selectedCalendarDetails?.boxCount || 0) / selectedVisualTotal) * 100) : 0;
  const selectedPalletPercent = selectedVisualTotal ? 100 - selectedBoxPercent : 0;

  if (loading || carriersLoading || employeesLoading || suppliersLoading || calendarLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border/70 bg-white/95 p-5 shadow-sm sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border border-primary/15 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                <ClipboardList className="h-3.5 w-3.5" />
                Dashboard
              </span>
              <span className="rounded-md border border-border/70 bg-muted/35 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {today}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-foreground sm:text-4xl">Receiving overview</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Welcome, <span className="font-medium text-foreground">{user?.name}</span>. Review today&apos;s receipts and start a new intake when needed.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(9rem,0.75fr)_minmax(18rem,1fr)] xl:min-w-[34rem]">
            <div className="rounded-lg border border-border/70 bg-muted/35 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current time</p>
              <p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-foreground">
                <Clock className="h-5 w-5 text-primary" />
                {currentTime}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link to="/receive" className="min-w-0">
                <Button className="h-12 w-full justify-between gap-2 rounded-lg px-4 text-sm font-semibold">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Package className="h-4 w-4 shrink-0" />
                    <span className="truncate">Start Receipt</span>
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/history" className="min-w-0">
                <Button variant="outline" className="h-12 w-full justify-between gap-2 rounded-lg bg-white px-4 text-sm font-semibold">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    <span className="truncate">View History</span>
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 2xl:grid-cols-4">
        <MetricCard icon={ClipboardList} label="Batches" value={batches.length} hint="Receipts opened today" />
        <MetricCard icon={Package} label="Packages" value={totalPackages} hint="Total boxes and pallets" />
        <MetricCard icon={Truck} label="Lines" value={totalItems} hint="Suppliers captured" />
        <MetricCard icon={AlertTriangle} label="Damaged" value={damagedCount} hint="Items flagged with damage" tone="danger" />
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.55fr)_minmax(320px,0.55fr)]">
        <Card className="self-start rounded-xl border-border/70 bg-white/95 panel-shadow 2xl:row-span-2">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold tracking-[-0.03em]">Today&apos;s Receipts</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Live summary of everything received during today&apos;s shift.</p>
              </div>
              <Link to="/history" className="text-sm font-medium text-primary hover:underline">
                View full history
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/45 px-6 py-14 text-center">
                <Package className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
                <p className="text-base font-medium text-foreground">No receipts recorded today</p>
                <p className="mt-1 text-sm text-muted-foreground">Start a new receipt when the next shipment arrives.</p>
                <Link to="/receive">
                  <Button variant="outline" size="sm" className="mt-4 rounded-xl">
                    Start receiving
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
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
                  const supplierSummaries = Object.values(
                    batch.receipt_items.reduce<
                      Record<
                        string,
                        {
                          name: string;
                          boxes: number;
                          pallets: number;
                        }
                      >
                    >((acc, item) => {
                      const supplierId = item.supplier_id || `unknown-${item.id}`;
                      const supplierName = suppliers.find(supplier => supplier.id === item.supplier_id)?.name || 'Unknown';
                      const packageType = item.package_type.toLowerCase();

                      if (!acc[supplierId]) {
                        acc[supplierId] = {
                          name: supplierName,
                          boxes: 0,
                          pallets: 0,
                        };
                      }

                      if (packageType === 'box' || packageType === 'boxes') {
                        acc[supplierId].boxes += item.package_count;
                      }

                      if (packageType === 'pallet' || packageType === 'pallets') {
                        acc[supplierId].pallets += item.package_count;
                      }

                      return acc;
                    }, {})
                  ).sort((a, b) => a.name.localeCompare(b.name));
                  const batchBoxes = batch.receipt_items.reduce((sum, item) => {
                    const packageType = item.package_type.toLowerCase();
                    return packageType === 'box' || packageType === 'boxes' ? sum + item.package_count : sum;
                  }, 0);
                  const batchPallets = batch.receipt_items.reduce((sum, item) => {
                    const packageType = item.package_type.toLowerCase();
                    return packageType === 'pallet' || packageType === 'pallets' ? sum + item.package_count : sum;
                  }, 0);
                  const hasDamaged = batch.receipt_items.some(item => item.damaged_box);

                  return (
                    <div
                      key={batch.id}
                      className="flex items-start gap-3 rounded-xl border border-border/70 bg-white p-4 transition-colors hover:bg-muted/35"
                    >
                      <CarrierBadge name={carrier?.name || '?'} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{carrier?.name || 'Unknown carrier'}</span>
                          {hasDamaged && (
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-destructive">
                              Damage
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {supplierSummaries.map(supplier => (
                            <span
                              key={`${batch.id}-${supplier.name}`}
                            className="rounded-md border border-border/70 bg-muted/45 px-2 py-1 text-[11px] text-muted-foreground"
                            >
                              {supplier.name}
                              {supplier.boxes > 0 ? ` • ${supplier.boxes} box${supplier.boxes === 1 ? '' : 'es'}` : ''}
                              {supplier.pallets > 0 ? ` • ${supplier.pallets} pallet${supplier.pallets === 1 ? '' : 's'}` : ''}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Received by {receivedBy}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {batchBoxes} box{batchBoxes === 1 ? '' : 'es'}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {batchPallets} pallet{batchPallets === 1 ? '' : 's'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{receivedTime}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-5 self-start">
          <div className="self-start rounded-xl border border-border/70 bg-white/90 px-4 py-3 shadow-sm">
            <div className="mb-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Operational Split</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center justify-between rounded-lg bg-muted/45 px-3.5 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Boxes</p>
                <p className="text-[1.6rem] font-semibold leading-none tracking-[-0.04em] text-foreground">{boxCount}</p>
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-between rounded-lg bg-muted/45 px-3.5 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Pallets</p>
                <p className="text-[1.6rem] font-semibold leading-none tracking-[-0.04em] text-foreground">{palletCount}</p>
              </div>
            </div>
          </div>

          <Card className="self-start rounded-xl border-border/70 bg-white/95 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">By Carrier</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {carrierBreakdown.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No carrier activity yet today.</p>
              ) : (
                <div className="space-y-2">
                  {carrierBreakdown.map(carrier => (
                    <div key={carrier.name} className="flex items-center gap-3 rounded-lg bg-muted/45 px-3 py-2.5">
                      <CarrierBadge name={carrier.name} size="sm" />
                      <span className="flex-1 truncate text-sm font-medium text-foreground">{carrier.name}</span>
                      <span className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-xs font-medium">
                        {carrier.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="self-start rounded-xl border-border/70 bg-white/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Quick Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="rounded-lg bg-muted/45 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Today</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {batches.length === 0
                    ? 'No receipts have been started yet.'
                    : `${batches.length} receipts are active today across ${carrierBreakdown.length || 0} carriers.`}
                </p>
              </div>
              <div className="rounded-lg bg-muted/45 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Focus</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {damagedCount > 0
                    ? `There are ${damagedCount} damaged items flagged for review.`
                    : 'No damaged items have been flagged today.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-5 self-start">
          <Card
            className={cn(
              'self-start rounded-xl border-border/70 bg-white/95 shadow-sm transition-all duration-300',
              selectedCalendarDate && 'bg-white panel-shadow'
            )}
          >
            <CardHeader className="pb-1">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Receipt Calendar</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pb-3">
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedCalendarDate}
                  onSelect={setSelectedCalendarDate}
                  className={cn(
                    'pointer-events-auto p-0 transition-all duration-300 [&_.rdp-table]:w-full',
                    selectedCalendarDate ? 'scale-100' : 'scale-[0.96]'
                  )}
                  modifiers={{
                    hasReceipt: receiptDates,
                  }}
                  modifiersClassNames={{
                    hasReceipt: 'bg-primary/10 text-foreground font-medium',
                    selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                  }}
                />
              </div>

              <div className="rounded-[16px] bg-[#fafafa] p-3">
                {!selectedCalendarDate ? (
                  <p className="text-sm text-muted-foreground">Select a date to expand the calendar view and see what arrived that day.</p>
                ) : !selectedCalendarDetails ? (
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{selectedDateKey}</p>
                    <p className="text-sm text-foreground">No receipts recorded for this date.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{selectedDateKey}</p>
                      <span className="rounded-full border border-border/70 bg-white px-2 py-0.5 text-xs font-medium">
                        {selectedCalendarDetails.count} receipts
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-[14px] bg-white px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Packages</p>
                        <p className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
                          {selectedCalendarDetails.packageCount}
                        </p>
                      </div>
                      <div className="rounded-[14px] bg-white px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Boxes</p>
                        <p className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
                          {selectedCalendarDetails.boxCount}
                        </p>
                      </div>
                      <div className="rounded-[14px] bg-white px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Pallets</p>
                        <p className="mt-1 text-lg font-semibold tracking-[-0.04em] text-foreground">
                          {selectedCalendarDetails.palletCount}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[16px] bg-white p-3">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        <span>Arrival mix</span>
                        <span>{selectedVisualTotal} total</span>
                      </div>
                      <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
                        <div className="flex h-full w-full">
                          <div className="bg-[#5ea8ff]" style={{ width: `${selectedBoxPercent}%` }} />
                          <div className="bg-[#9ccf5a]" style={{ width: `${selectedPalletPercent}%` }} />
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#5ea8ff]" />
                          <span>Boxes {selectedBoxPercent}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#9ccf5a]" />
                          <span>Pallets {selectedPalletPercent}%</span>
                        </div>
                      </div>
                    </div>

                    {selectedCalendarCarrierData.length === 0 ? (
                      <p className="text-sm text-foreground">No carrier linked to these receipts.</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Carriers on site</p>
                        <div className="space-y-2">
                          {selectedCalendarCarrierData.map(carrier => (
                            <button
                              key={carrier.id}
                              type="button"
                              onClick={() => setCalendarCarrierModal({ id: carrier.id, name: carrier.name })}
                              className="flex w-full items-center gap-3 rounded-[14px] bg-white px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                            >
                              <CarrierBadge name={carrier.name} size="sm" />
                              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{carrier.name}</span>
                              <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs font-medium">
                                {carrier.count}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      <Dialog open={!!calendarCarrierModal} onOpenChange={open => !open && setCalendarCarrierModal(null)}>
        <DialogContent className="max-w-md rounded-[24px] border-border/70 p-0">
          <div className="rounded-[24px] bg-[linear-gradient(180deg,#ffffff_0%,#f8f9fb_100%)] p-6">
            <DialogHeader>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{selectedDateKey || 'Selected date'}</p>
              <DialogTitle className="mt-2 text-2xl tracking-[-0.04em]">{calendarCarrierModal?.name}</DialogTitle>
            </DialogHeader>

            <div className="mt-5 space-y-3">
              <div className="rounded-[16px] bg-white p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Suppliers delivered</p>
                {selectedCarrierSupplierDetails.length === 0 ? (
                  <p className="mt-2 text-sm text-foreground">No suppliers linked to this carrier on that date.</p>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    {selectedCarrierSupplierDetails.map(supplier => (
                      <div key={supplier.supplierId} className="rounded-[14px] border border-border/70 bg-[#fafafa] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{supplier.name}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full bg-white px-2.5 py-1">Boxes {supplier.boxes}</span>
                              <span className="rounded-full bg-white px-2.5 py-1">Pallets {supplier.pallets}</span>
                            </div>
                          </div>
                          <Link
                            to={`/history?carrier=${encodeURIComponent(calendarCarrierModal?.id || '')}&date=${encodeURIComponent(selectedDateKey || '')}&supplier=${encodeURIComponent(supplier.supplierId)}&open=${encodeURIComponent(supplier.batchIds.join(','))}`}
                            className="shrink-0 rounded-full border border-border/70 bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            onClick={() => setCalendarCarrierModal(null)}
                          >
                            View in History
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[16px] bg-white p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Next step</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  Use the History link on any supplier row to jump straight into the matching receipt cards.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
