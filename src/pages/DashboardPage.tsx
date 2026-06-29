import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Clock,
  ClipboardList,
  Package,
  Truck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTodayBatches, useCarriers, useEmployees, useSuppliers, useReceiptCalendarDetails } from '@/hooks/useSupabaseData';
import { useExpectedBoxes, type ExpectedBoxStatus } from '@/hooks/useExpectedBoxes';
import { useAuth } from '@/hooks/useAuth';
import CarrierBadge from '@/components/CarrierBadge';
import { cn } from '@/lib/utils';
import { displayEmployeeName } from '@/lib/employeeDisplay';

const EXPECTED_STATUS_META: Record<ExpectedBoxStatus, { label: string; className: string; priority: number }> = {
  delivered: {
    label: 'Delivered by carrier',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    priority: 0,
  },
  needs_review: {
    label: 'Needs review',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    priority: 1,
  },
  in_transit: {
    label: 'In transit',
    className: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    priority: 2,
  },
  received: {
    label: 'Received',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    priority: 3,
  },
};

function formatExpectedDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { batches, loading } = useTodayBatches();
  const { carriers, loading: carriersLoading } = useCarriers();
  const { employees, loading: employeesLoading } = useEmployees();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { boxes: expectedBoxes, loading: expectedBoxesLoading } = useExpectedBoxes();
  const { dates: receiptDates, detailsByDate, loading: calendarLoading } = useReceiptCalendarDetails();
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(() => new Date());
  const [calendarCarrierModal, setCalendarCarrierModal] = useState<{ id: string; name: string } | null>(null);

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

  const activeExpectedBoxes = useMemo(
    () => expectedBoxes.filter(box => box.status !== 'received'),
    [expectedBoxes]
  );

  const expectedSupplierRows = useMemo(() => {
    const groups: Record<
      string,
      {
        supplierId: string;
        supplierName: string;
        trackingCount: number;
        shippedCount: number;
        carriers: Set<string>;
        statusCounts: Record<ExpectedBoxStatus, number>;
        priority: number;
        primaryStatus: ExpectedBoxStatus;
        nextDate: string | null;
        latestEvent: string | null;
      }
    > = {};

    activeExpectedBoxes.forEach(box => {
      const supplierId = box.supplier_id || box.suppliers?.name || box.id;
      const supplierName =
        box.suppliers?.name ||
        suppliers.find(supplier => supplier.id === box.supplier_id)?.name ||
        'Unknown supplier';

      if (!groups[supplierId]) {
        groups[supplierId] = {
          supplierId,
          supplierName,
          trackingCount: 0,
          shippedCount: 0,
          carriers: new Set<string>(),
          statusCounts: {
            delivered: 0,
            in_transit: 0,
            needs_review: 0,
            received: 0,
          },
          priority: EXPECTED_STATUS_META[box.status].priority,
          primaryStatus: box.status,
          nextDate: null,
          latestEvent: null,
        };
      }

      const group = groups[supplierId];
      group.trackingCount += 1;
      group.shippedCount += Math.max(1, box.carrier_shipped_count || 0);
      group.carriers.add(box.carrier);
      group.statusCounts[box.status] += 1;

      const statusPriority = EXPECTED_STATUS_META[box.status].priority;
      if (statusPriority < group.priority) {
        group.priority = statusPriority;
        group.primaryStatus = box.status;
      }

      const nextDate = formatExpectedDate(box.carrier_eta || box.carrier_delivered_at || box.updated_at);
      if (nextDate && !group.nextDate) group.nextDate = nextDate;
      if (box.last_carrier_event && !group.latestEvent) group.latestEvent = box.last_carrier_event;
    });

    return Object.values(groups).sort(
      (a, b) =>
        a.priority - b.priority ||
        b.trackingCount - a.trackingCount ||
        a.supplierName.localeCompare(b.supplierName)
    );
  }, [activeExpectedBoxes, suppliers]);

  const expectedDeliveredPending = activeExpectedBoxes.filter(box => box.status === 'delivered').length;
  const expectedNeedsReview = activeExpectedBoxes.filter(box => box.status === 'needs_review').length;

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
  const calendarActivity = useMemo(
    () =>
      Object.entries(detailsByDate)
        .map(([dateKey, details]) => ({
          dateKey,
          date: new Date(`${dateKey}T12:00:00`),
          ...details,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [detailsByDate]
  );
  const busiestCalendarDay = calendarActivity.reduce<(typeof calendarActivity)[number] | null>(
    (best, item) => (!best || item.packageCount > best.packageCount ? item : best),
    null
  );
  const latestCalendarDay = calendarActivity[calendarActivity.length - 1];
  const selectedDateLabel =
    selectedCalendarDate?.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) || 'No date selected';
  const formatCalendarDayLabel = (date?: Date) =>
    date
      ? date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : 'None';

  if (loading || carriersLoading || employeesLoading || suppliersLoading || expectedBoxesLoading || calendarLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-border/70 bg-white/95 shadow-[0_18px_55px_rgba(15,23,42,0.07)]">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.46fr)]">
          <div className="min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700">
                <ClipboardList className="h-3.5 w-3.5 text-primary" />
                Dashboard
              </span>
              <span className="rounded-full border border-border/70 bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
                {today}
              </span>
            </div>
            <div className="mt-5 max-w-3xl">
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Receiving overview</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                Welcome, <span className="font-semibold text-foreground">{displayEmployeeName(user?.name)}</span>. Review today&apos;s receipts and start the next intake when the floor is ready.
              </p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {[
                ['Receipts', batches.length],
                ['Packages', totalPackages],
                ['Damage flags', damagedCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/70 bg-muted/25 px-3.5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-extrabold leading-none tracking-tight text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t border-slate-800/20 bg-slate-950 p-5 text-white lg:border-l lg:border-t-0 sm:p-6">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/80">Current time</p>
                  <p className="mt-2 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
                    <Clock className="h-5 w-5 text-cyan-300" />
                    {currentTime}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                  Live
                </span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
                Use this command area to start a receipt fast or review the latest receiving history.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Link to="/receive" className="min-w-0">
                <Button variant="ghost" className="h-12 w-full justify-between gap-2 rounded-lg border border-white/10 bg-white px-4 text-sm font-extrabold text-slate-950 shadow-[0_14px_30px_rgba(0,0,0,0.22)] hover:bg-slate-100 hover:text-slate-950">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Package className="h-4 w-4 shrink-0" />
                    <span className="truncate">Start Receipt</span>
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/history" className="min-w-0">
                <Button variant="ghost" className="h-12 w-full justify-between gap-2 rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-bold text-white hover:bg-white/10 hover:text-white">
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

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.05fr)_minmax(560px,0.85fr)]">
        <div className="grid content-start gap-5 self-start">
          <Card className="overflow-hidden rounded-xl border-border/70 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <div className="h-1 bg-[linear-gradient(90deg,#0ea5e9_0%,#22c55e_52%,#f59e0b_100%)]" />
            <div className="border-b border-border/70 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Inbound focus</p>
                  <CardTitle className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">
                    Suppliers we are expecting
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vendors with expected boxes that are not warehouse received yet.
                  </p>
                </div>
                <span className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-border/70 bg-white px-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]" />
                  Live inbound list
                </span>
              </div>

              <div className="mt-4 grid overflow-hidden rounded-xl border border-border/70 bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-border/70">
                <div className="px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Suppliers</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">{expectedSupplierRows.length}</p>
                </div>
                <div className="border-t border-border/70 px-4 py-3 sm:border-t-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Expected</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">{activeExpectedBoxes.length}</p>
                </div>
                <div className="border-t border-border/70 px-4 py-3 sm:border-t-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Attention</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
                    {expectedDeliveredPending + expectedNeedsReview}
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="p-4 sm:p-5">
              {expectedSupplierRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/35 px-6 py-10 text-center">
                  <Package className="mx-auto mb-3 h-9 w-9 text-muted-foreground/30" />
                  <p className="text-sm font-semibold text-foreground">No suppliers expected right now</p>
                  <p className="mt-1 text-sm text-muted-foreground">Expected boxes will appear here before they are received.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {expectedSupplierRows.slice(0, 6).map(row => {
                    const meta = EXPECTED_STATUS_META[row.primaryStatus];
                    const carrierList = Array.from(row.carriers).join(', ');

                    return (
                      <div
                        key={row.supplierId}
                        className="group relative overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
                      >
                        <div className="absolute inset-y-0 left-0 w-1 bg-primary/45 transition-colors group-hover:bg-primary" />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 pl-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-base font-extrabold tracking-tight text-foreground">{row.supplierName}</p>
                              <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold', meta.className)}>
                                {meta.label}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {row.trackingCount} tracking{row.trackingCount === 1 ? '' : 's'}
                              {carrierList ? ` with ${carrierList}` : ''}
                              {row.nextDate ? ` - next ${row.nextDate}` : ''}
                            </p>
                            {row.latestEvent && (
                              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{row.latestEvent}</p>
                            )}
                          </div>
                          <div className="grid min-w-[9rem] grid-cols-2 overflow-hidden rounded-xl border border-border/70 bg-muted/30 text-right shadow-sm">
                            <div className="px-3 py-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Boxes</p>
                              <p className="mt-1 text-lg font-extrabold leading-none text-foreground">{row.shippedCount}</p>
                            </div>
                            <div className="border-l border-border/70 px-3 py-2">
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Ready</p>
                              <p className="mt-1 text-lg font-extrabold leading-none text-foreground">
                                {row.statusCounts.delivered + row.statusCounts.needs_review}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {expectedSupplierRows.length > 6 && (
                    <div className="flex items-center justify-center rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm font-semibold text-muted-foreground">
                      Showing 6 of {expectedSupplierRows.length} expected supplier{expectedSupplierRows.length === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="self-start overflow-hidden rounded-xl border-border/70 bg-white/95 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fafcff_100%)] pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Warehouse activity</p>
                    <CardTitle className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">Today&apos;s Receipts</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Live summary of everything received during today&apos;s shift.</p>
                  </div>
                </div>
                <Link
                  to="/history"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border/70 bg-white px-3 text-sm font-bold text-primary shadow-sm transition-colors hover:bg-primary/5"
                >
                  View full history
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
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
              <div className="relative space-y-3 before:absolute before:bottom-3 before:left-5 before:top-3 before:w-px before:bg-border/80">
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
                      className="group relative flex flex-col gap-3 rounded-xl border border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-4 pl-14 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md sm:flex-row sm:items-start"
                    >
                      <div className="absolute left-3 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-white shadow-sm">
                        <CarrierBadge name={carrier?.name || '?'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-base font-extrabold tracking-tight text-foreground">{carrier?.name || 'Unknown carrier'}</span>
                          <span className="rounded-full border border-border/70 bg-muted/35 px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                            {receivedTime}
                          </span>
                          {hasDamaged && (
                            <span className="rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-destructive">
                              Damage
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {supplierSummaries.map(supplier => (
                            <span
                              key={`${batch.id}-${supplier.name}`}
                              className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm"
                            >
                              {supplier.name}
                              {supplier.boxes > 0 ? ` - ${supplier.boxes} box${supplier.boxes === 1 ? '' : 'es'}` : ''}
                              {supplier.pallets > 0 ? ` - ${supplier.pallets} pallet${supplier.pallets === 1 ? '' : 's'}` : ''}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-xs font-medium text-muted-foreground">Received by {receivedBy}</p>
                      </div>
                      <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-[10rem]">
                        <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Boxes</p>
                          <p className="mt-1 text-lg font-extrabold leading-none text-foreground">{batchBoxes}</p>
                        </div>
                        <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Pallets</p>
                          <p className="mt-1 text-lg font-extrabold leading-none text-foreground">{batchPallets}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-5 self-start">
          <Card className="self-start overflow-hidden rounded-xl border-border/70 bg-white/95 shadow-[0_16px_38px_rgba(15,23,42,0.07)]">
            <CardContent className="p-0">
              <div className="border-b border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                      <Package className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Operational Split</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">Boxes and pallets received today</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-xs font-bold text-muted-foreground shadow-sm">
                    {totalPackages} total
                  </span>
                </div>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-sky-50/70 px-4 py-3">
                  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-sky-500" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">Boxes</p>
                  <p className="mt-3 text-3xl font-extrabold leading-none tracking-tight text-slate-950">{boxCount}</p>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3">
                  <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-emerald-500" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Pallets</p>
                  <p className="mt-3 text-3xl font-extrabold leading-none tracking-tight text-slate-950">{palletCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="self-start overflow-hidden rounded-xl border-border/70 bg-white/95 shadow-[0_16px_38px_rgba(15,23,42,0.07)]">
            <CardHeader className="border-b border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fafcff_100%)] pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                    <Truck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Carrier Mix</p>
                    <CardTitle className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">By Carrier</CardTitle>
                  </div>
                </div>
                <span className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-xs font-bold text-muted-foreground shadow-sm">
                  {carrierBreakdown.length}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {carrierBreakdown.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/35 px-4 py-8 text-center">
                  <Truck className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm font-semibold text-foreground">No carrier activity yet today.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {carrierBreakdown.map(carrier => (
                    <div
                      key={carrier.name}
                      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] px-3 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
                    >
                      <div className="absolute inset-y-0 left-0 w-1 bg-primary/40 transition-colors group-hover:bg-primary" />
                      <CarrierBadge name={carrier.name} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight text-foreground">{carrier.name}</span>
                      <span className="rounded-full border border-border/70 bg-muted/35 px-2.5 py-1 text-xs font-bold text-muted-foreground">
                        {carrier.count} lines
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="self-start overflow-hidden rounded-xl border-border/70 bg-white/95 shadow-[0_16px_38px_rgba(15,23,42,0.07)]">
            <CardHeader className="border-b border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fafcff_100%)] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                  <Clock className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Shift Notes</p>
                  <CardTitle className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">Quick Summary</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="relative overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-4 pl-5 shadow-sm">
                <div className="absolute inset-y-0 left-0 w-1 bg-sky-400" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Today</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {batches.length === 0
                    ? 'No receipts have been started yet.'
                    : `${batches.length} receipts are active today across ${carrierBreakdown.length || 0} carriers.`}
                </p>
              </div>
              <div className="relative overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-4 pl-5 shadow-sm">
                <div className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Focus</p>
                <p className="mt-2 text-sm leading-6 text-foreground">
                  {damagedCount > 0
                    ? `There are ${damagedCount} damaged items flagged for review.`
                    : 'No damaged items have been flagged today.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="order-first self-start overflow-hidden rounded-xl border-border/70 bg-white/95 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-800/40 bg-slate-950 px-4 py-4 text-white sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/80">Receipt activity</p>
                      <CardTitle className="text-lg font-extrabold tracking-tight text-white">Calendar</CardTitle>
                    </div>
                  </div>
                  <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
                    Delivery days, package volume, and carrier activity in one view.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                  {calendarActivity.length} active days
                </span>
              </div>

              <div className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
                <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Busiest</p>
                  <p className="mt-1 truncate text-sm font-extrabold text-white">
                    {busiestCalendarDay ? formatCalendarDayLabel(busiestCalendarDay.date) : 'None'}
                  </p>
                  <p className="text-xs text-slate-400">{busiestCalendarDay ? `${busiestCalendarDay.packageCount} packages` : 'No receipts'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Latest</p>
                  <p className="mt-1 truncate text-sm font-extrabold text-white">
                    {latestCalendarDay ? formatCalendarDayLabel(latestCalendarDay.date) : 'None'}
                  </p>
                  <p className="text-xs text-slate-400">{latestCalendarDay ? `${latestCalendarDay.count} receipts` : 'No activity'}</p>
                </div>
              </div>
            </div>

            <CardContent className="p-4 sm:p-5">
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
                <div className="rounded-[20px] border border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#f6fbff_100%)] p-3 shadow-sm">
                  <Calendar
                    mode="single"
                    selected={selectedCalendarDate}
                    onSelect={setSelectedCalendarDate}
                    className="pointer-events-auto w-full p-0 [&_.rdp-month]:w-full [&_.rdp-table]:w-full"
                    classNames={{
                      months: 'w-full',
                      month: 'w-full space-y-3',
                      caption: 'flex items-center justify-between rounded-2xl border border-border/70 bg-white px-3 py-2 shadow-sm',
                      caption_label: 'text-sm font-extrabold text-slate-950',
                      nav: 'flex items-center gap-1',
                      nav_button:
                        'h-8 w-8 rounded-xl border border-border/70 bg-slate-50 p-0 text-slate-600 opacity-100 shadow-sm hover:bg-slate-100 hover:text-slate-950',
                      nav_button_previous: 'static',
                      nav_button_next: 'static',
                      table: 'w-full border-separate border-spacing-y-1',
                      head_row: 'grid grid-cols-7',
                      head_cell: 'h-7 w-auto text-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground',
                      row: 'grid grid-cols-7 gap-1',
                      cell: 'relative min-w-0 p-0 text-center',
                      day:
                        'relative h-11 w-full rounded-xl p-0 text-sm font-semibold transition-all hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary/30',
                      day_today: 'border border-primary/40 bg-primary/5 text-primary',
                      day_selected:
                        'bg-slate-950 text-white shadow-lg shadow-slate-950/20 hover:bg-slate-950 hover:text-white focus:bg-slate-950 focus:text-white',
                      day_outside: 'text-muted-foreground/35 opacity-60',
                      day_disabled: 'text-muted-foreground opacity-50',
                    }}
                    modifiers={{
                      hasReceipt: receiptDates,
                    }}
                    modifiersClassNames={{
                      hasReceipt:
                        'font-extrabold ring-1 ring-cyan-200/90 after:absolute after:bottom-1.5 after:left-1/2 after:h-1 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-cyan-400',
                    }}
                  />

                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-white/80 px-3 py-2.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-5 rounded-full bg-cyan-400" />
                      Receipt day
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-primary/50 bg-primary/10" />
                      Today
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-slate-950" />
                      Selected
                    </span>
                  </div>
                </div>

                <div className="rounded-[20px] border border-border/70 bg-[#fbfcfe] p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Selected day</p>
                      <h3 className="mt-1 text-lg font-extrabold tracking-tight text-slate-950">{selectedDateLabel}</h3>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold',
                        selectedCalendarDetails
                          ? 'border-cyan-200 bg-cyan-50 text-cyan-800'
                          : 'border-border bg-white text-muted-foreground'
                      )}
                    >
                      {selectedCalendarDetails ? `${selectedCalendarDetails.count} receipts` : 'Clear'}
                    </span>
                  </div>

                  {!selectedCalendarDate ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-border/80 bg-white px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-foreground">No date selected</p>
                    </div>
                  ) : !selectedCalendarDetails ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-border/80 bg-white px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-foreground">No receipts recorded</p>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedDateKey}</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,6.5rem),1fr))]">
                        <div className="rounded-2xl border border-border/70 bg-white px-3 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Packages</p>
                          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
                            {selectedCalendarDetails.packageCount}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-white px-3 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Boxes</p>
                          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
                            {selectedCalendarDetails.boxCount}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-white px-3 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Pallets</p>
                          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
                            {selectedCalendarDetails.palletCount}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/70 bg-white p-3.5">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                          <span>Arrival mix</span>
                          <span>{selectedVisualTotal} total</span>
                        </div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
                          <div className="flex h-full w-full">
                            <div className="bg-[#2f8cff]" style={{ width: `${selectedBoxPercent}%` }} />
                            <div className="bg-[#32c587]" style={{ width: `${selectedPalletPercent}%` }} />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-foreground">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#2f8cff]" />
                            <span>Boxes {selectedBoxPercent}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#32c587]" />
                            <span>Pallets {selectedPalletPercent}%</span>
                          </div>
                        </div>
                      </div>

                      {selectedCalendarCarrierData.length === 0 ? (
                        <p className="text-sm text-foreground">No carrier linked to these receipts.</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Carriers on site</p>
                          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                            {selectedCalendarCarrierData.map(carrier => (
                              <button
                                key={carrier.id}
                                type="button"
                                onClick={() => setCalendarCarrierModal({ id: carrier.id, name: carrier.name })}
                                className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-white px-3 py-2.5 text-left transition-all hover:border-primary/30 hover:bg-cyan-50/50"
                              >
                                <CarrierBadge name={carrier.name} size="sm" />
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{carrier.name}</span>
                                <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-xs font-bold transition-colors group-hover:bg-white">
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
