import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, AlertTriangle, Camera, CheckCheck, CheckCircle2, Copy, History, PackageCheck, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSuppliers, useCarriers, saveBatch, uploadPhoto, sendExpectedBoxEmails } from '@/hooks/useSupabaseData';
import SupplierCombobox from '@/components/SupplierCombobox';
import InlineAddCarrier from '@/components/InlineAddCarrier';
import CarrierBadge from '@/components/CarrierBadge';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

function now() {
  const d = new Date();
  return { date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5) };
}

function createId() {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface LineItem {
  id: string;
  supplierId: string;
  packageType: string;
  packageCount: number;
  damagedBox: boolean;
  damagedNotes: string;
  trackingNumber: string;
  comments: string;
  photoFile: File | null;
  photoPreview: string;
}

function emptyItem(): LineItem {
  return {
    id: createId(),
    supplierId: '',
    packageType: 'boxes',
    packageCount: 1,
    damagedBox: false,
    damagedNotes: '',
    trackingNumber: '',
    comments: '',
    photoFile: null,
    photoPreview: '',
  };
}

function getCarrierButtonClass(name: string, selected: boolean) {
  const lower = name.toLowerCase().trim();
  const widthClass =
    lower.includes('amazon') || lower.includes('fedex') || lower.includes('federal express') || lower.includes('dhl')
      ? 'w-[96px]'
      : lower.includes('ups') || lower.includes('usps')
        ? 'w-14'
        : 'min-w-[88px] max-w-[132px] px-3';

  const stateClass = selected
    ? 'border border-primary/35 bg-primary/10 ring-2 ring-primary/10 hover:bg-primary/15'
    : 'border border-border/60 bg-white hover:bg-muted/50';

  return `h-11 ${widthClass} rounded-lg p-0 shadow-sm ${stateClass}`;
}

function getDamageButtonClass(selected: boolean) {
  const selectedClass = 'border-destructive/40 bg-destructive/10 text-destructive ring-2 ring-destructive/10 hover:bg-destructive/12 hover:text-destructive';
  const idleClass = 'border-emerald-200 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800';
  return `receive-damage-button h-10 w-full justify-center rounded-lg border px-2 text-[11px] font-semibold shadow-sm transition-colors ${selected ? selectedClass : idleClass}`;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isLineReady(item: LineItem) {
  return Boolean(
    item.supplierId &&
    item.packageCount > 0 &&
    (!item.damagedBox || (item.damagedNotes.trim() && item.photoFile))
  );
}

function isBlankDraftLine(item: LineItem) {
  return Boolean(
    !item.supplierId &&
    !item.trackingNumber.trim() &&
    !item.comments.trim() &&
    !item.damagedNotes.trim() &&
    !item.photoFile &&
    !item.photoPreview &&
    !item.damagedBox &&
    (item.packageCount === 0 || item.packageCount === 1) &&
    (item.packageType === 'boxes' || item.packageType === 'box')
  );
}

export default function ReceivePage() {
  const { user } = useAuth();
  const { suppliers, refetch: refetchSuppliers } = useSuppliers();
  const { carriers, refetch: refetchCarriers } = useCarriers();

  const { date, time } = now();
  const [carrierId, setCarrierId] = useState('');
  const [receivedDate, setReceivedDate] = useState(date);
  const [receivedTime, setReceivedTime] = useState(time);
  const [batchNotes, setBatchNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [savedLineCount, setSavedLineCount] = useState(0);
  const [lastSavedBatchId, setLastSavedBatchId] = useState<string | null>(null);
  const [lastSavedSignature, setLastSavedSignature] = useState('');
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const activeCarriers = carriers.filter(c => c.active);
  const selectedCarrier = carriers.find(c => c.id === carrierId);
  const readyItems = useMemo(() => items.filter(isLineReady), [items]);
  const completedLines = readyItems.length;
  const totalPackages = readyItems.reduce((sum, item) => sum + Math.max(0, item.packageCount || 0), 0);
  const boxTotal = readyItems
    .filter(item => {
      const value = item.packageType.toLowerCase();
      return value === 'box' || value === 'boxes';
    })
    .reduce((sum, item) => sum + Math.max(0, item.packageCount || 0), 0);
  const palletTotal = readyItems
    .filter(item => {
      const value = item.packageType.toLowerCase();
      return value === 'pallet' || value === 'pallets';
    })
    .reduce((sum, item) => sum + Math.max(0, item.packageCount || 0), 0);
  const damagedLines = items.filter(item => item.damagedBox).length;
  const firstIncompleteIndex = items.findIndex(item => !isLineReady(item));
  const selectedReceivedDate = parseLocalDate(receivedDate);
  const receivedSupplierSummary = readyItems.reduce<Array<{ id: string; name: string; lines: number; packages: number }>>((summary, item) => {
    if (!item.supplierId) return summary;
    const supplier = suppliers.find(entry => entry.id === item.supplierId);
    if (!supplier) return summary;

    const existing = summary.find(entry => entry.id === supplier.id);
    if (existing) {
      existing.lines += 1;
      existing.packages += Math.max(0, item.packageCount || 0);
      return summary;
    }

    summary.push({
      id: supplier.id,
      name: supplier.name,
      lines: 1,
      packages: Math.max(0, item.packageCount || 0),
    });

    return summary;
  }, []);
  const currentBatchSignature = useMemo(
    () =>
      JSON.stringify({
        carrierId,
        receivedDate,
        receivedTime,
        batchNotes: batchNotes.trim(),
        items: items.map(item => ({
          supplierId: item.supplierId,
          packageType: item.packageType,
          packageCount: item.packageCount,
          damagedBox: item.damagedBox,
          damagedNotes: item.damagedNotes.trim(),
          trackingNumber: item.trackingNumber.trim(),
          comments: item.comments.trim(),
          photoName: item.photoFile?.name || '',
          photoPreview: item.photoPreview || '',
        })),
      }),
    [batchNotes, carrierId, items, receivedDate, receivedTime]
  );
  const currentReceiptAlreadySaved = Boolean(lastSavedBatchId && lastSavedSignature === currentBatchSignature);

  useEffect(() => {
    if (!showSaveConfirmation) return;
    const timer = window.setTimeout(() => {
      setShowSaveConfirmation(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [showSaveConfirmation]);

  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => setItems(prev => [emptyItem(), ...prev]);

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const duplicateItem = (idx: number) => {
    setItems(prev => {
      const source = prev[idx];
      if (!source) return prev;
      const clone: LineItem = {
        ...source,
        id: createId(),
        photoFile: null,
        photoPreview: '',
      };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  };

  const resetBatch = () => {
    const { date: d, time: t } = now();
    setCarrierId('');
    setReceivedDate(d);
    setReceivedTime(t);
    setBatchNotes('');
    setItems([emptyItem()]);
    setOpenDetails(new Set());
    setLastSavedBatchId(null);
    setLastSavedSignature('');
    setShowSaveConfirmation(false);
  };

  const toggleDetails = (id: string) => {
    setOpenDetails(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePhotoSelect = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => updateItem(idx, { photoFile: file, photoPreview: reader.result as string });
    reader.readAsDataURL(file);
  };

  const validate = () => {
    if (!carrierId) {
      toast.error('Please select a carrier');
      return false;
    }
    if (!user?.id) {
      toast.error('You must be signed in');
      return false;
    }
    if (readyItems.length === 0) {
      toast.error('Add at least one complete receiving line');
      return false;
    }

    for (let i = 0; i < items.length; i++) {
      if (isLineReady(items[i]) || isBlankDraftLine(items[i])) continue;
      if (!items[i].supplierId) {
        toast.error(`Line ${i + 1}: select a supplier`);
        return false;
      }
      if (items[i].packageCount < 1) {
        toast.error(`Line ${i + 1}: package count must be at least 1`);
        return false;
      }
      if (items[i].damagedBox && !items[i].damagedNotes.trim()) {
        toast.error(`Line ${i + 1}: add damage notes`);
        setOpenDetails(prev => new Set(prev).add(items[i].id));
        return false;
      }
      if (items[i].damagedBox && !items[i].photoFile) {
        toast.error(`Line ${i + 1}: add a damage photo`);
        setOpenDetails(prev => new Set(prev).add(items[i].id));
        return false;
      }
    }

    return true;
  };

  const handleSave = async (andNew: boolean) => {
    if (!andNew && currentReceiptAlreadySaved) {
      toast.info('This receipt is already saved');
      return;
    }
    if (!validate()) return;

    setSaving(true);
    try {
      const signatureBeforeSave = currentBatchSignature;
      const receivedAt = new Date(`${receivedDate}T${receivedTime}`).toISOString();
      const batchData = {
        carrier_id: carrierId,
        received_by_employee_id: user.id,
        received_at: receivedAt,
        notes: batchNotes.trim() || null,
      };

      const itemsData = await Promise.all(
        readyItems.map(async it => {
          let photoPath: string | null = null;
          if (it.photoFile) {
            const ext = it.photoFile.name.split('.').pop() || 'jpg';
            const path = `items/${createId()}.${ext}`;
            await uploadPhoto(it.photoFile, path);
            photoPath = path;
          }

          return {
            batch_id: '',
            supplier_id: it.supplierId,
            package_type: it.packageType,
            package_count: it.packageCount,
            damaged_box: it.damagedBox,
            damaged_notes: it.damagedNotes || null,
            tracking_number: it.trackingNumber || null,
            comments: it.comments || null,
            item_photo_path: photoPath,
          };
        })
      );

      const savedBatch = await saveBatch(batchData, itemsData);
      setSavedLineCount(readyItems.length);
      setLastSavedBatchId(savedBatch.id);
      setLastSavedSignature(signatureBeforeSave);
      setShowSaveConfirmation(true);
      if ('offlineQueued' in savedBatch && savedBatch.offlineQueued) {
        toast.success('Receipt saved offline and queued for sync');
      }
      if (savedBatch.expectedBoxesMatched > 0) {
        toast.success(`${savedBatch.expectedBoxesMatched} expected box${savedBatch.expectedBoxesMatched === 1 ? '' : 'es'} marked as received`);
        sendExpectedBoxEmails(savedBatch.expectedBoxIdsMatched)
          .then(result => {
            if (result.sent > 0) {
              toast.success(`${result.sent} expected box email${result.sent === 1 ? '' : 's'} sent`);
            }
          })
          .catch(err => {
            toast.error(getErrorMessage(err, 'Expected box matched, but email failed'));
          });
      }

      if (andNew) {
        resetBatch();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save batch'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="receive-page mx-auto max-w-[1220px] space-y-3 pb-2 portrait:max-w-[760px] portrait:px-1">
      {showSaveConfirmation && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center opacity-100 transition-all duration-300">
          <div className="w-[min(92vw,420px)] translate-y-0 scale-100 rounded-2xl border border-white/80 bg-white/98 p-6 text-center shadow-[0_30px_100px_rgba(15,23,42,0.18)] backdrop-blur">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
              <CheckCheck className="h-6 w-6" />
            </div>
            <p className="mt-4 text-xl font-semibold text-foreground">Receipt saved</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {savedLineCount} line{savedLineCount === 1 ? '' : 's'} recorded and ready in History.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_292px] xl:items-start">
        <main className="min-w-0 space-y-3">
          <div className="rounded-xl border border-border/70 bg-white/96 p-3 shadow-[0_14px_42px_rgba(15,23,42,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <PackageCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold leading-tight text-foreground">Receive</h1>
                    {selectedCarrier && (
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                        {selectedCarrier.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedCarrier ? 'Capture merchandise lines and save this receipt.' : 'Start by selecting a carrier, then add supplier lines.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/70 bg-muted/15 shadow-sm sm:grid-cols-4">
                {[
                  ['Lines', `${completedLines}/${items.length}`],
                  ['Boxes', boxTotal],
                  ['Pallets', palletTotal],
                  ['Total', totalPackages],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-[68px] border-r border-border/60 bg-white/80 px-2 py-1.5 last:border-r-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-base font-semibold leading-none text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section
            className={`relative rounded-xl border p-3 shadow-sm transition-colors portrait:mr-auto portrait:w-full portrait:max-w-none portrait:bg-background portrait:shadow-none ${
              damagedLines > 0
                ? 'border-destructive/25 bg-destructive/5'
                : 'border-border/70 bg-white/96'
            }`}
          >
        {damagedLines > 0 && (
          <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-destructive/20 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-destructive shadow-sm backdrop-blur">
            <AlertTriangle className="h-3.5 w-3.5" />
            Damage: {damagedLines}
          </div>
        )}

        <div className="mb-2 max-w-[calc(100%-118px)]">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Batch setup</h2>
            <p className="text-xs text-muted-foreground">Carrier, timestamp, receiver and optional batch notes.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 portrait:gap-2.5 md:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-1">
          <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px] portrait:gap-2.5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Carrier *</Label>
              </div>
              <div className="flex w-fit max-w-full flex-wrap gap-1.5 rounded-lg border border-border/60 bg-background p-1.5 portrait:max-w-[500px]">
                {activeCarriers.map(c => (
                  <Button
                    key={c.id}
                    type="button"
                    variant="ghost"
                    className={getCarrierButtonClass(c.name, carrierId === c.id)}
                    onClick={() => setCarrierId(c.id)}
                    title={c.name}
                    aria-label={c.name}
                  >
                    <CarrierBadge name={c.name} size="sm" variant="plain" />
                  </Button>
                ))}
                <InlineAddCarrier
                  onAdded={c => {
                    refetchCarriers();
                    setCarrierId(c.id);
                    window.setTimeout(() => document.querySelector<HTMLInputElement>('input[placeholder="Search supplier..."]')?.focus(), 0);
                  }}
                />
              </div>
            </div>

            <div className="receive-batch-time mr-auto grid w-full max-w-[400px] grid-cols-[minmax(0,1fr)_128px] gap-2 rounded-lg border border-border/60 bg-background p-2 sm:grid-cols-[minmax(0,1fr)_128px] xl:max-w-none portrait:max-w-[400px]">
              <div className="receive-date-field space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Date</Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full justify-start gap-2 rounded-lg bg-white px-3 text-left font-medium shadow-none"
                    >
                      <CalendarDays className="h-4 w-4 text-primary" />
                      <span className="truncate">
                        {selectedReceivedDate ? format(selectedReceivedDate, 'MMM d, yyyy') : 'Select date'}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto rounded-xl p-2">
                    <CalendarPicker
                      mode="single"
                      selected={selectedReceivedDate}
                      onSelect={selectedDate => {
                        if (!selectedDate) return;
                        setReceivedDate(formatLocalDate(selectedDate));
                        setDatePickerOpen(false);
                      }}
                      initialFocus
                    />
                    <div className="border-t px-2 pb-2 pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center rounded-lg text-primary"
                        onClick={() => {
                          setReceivedDate(formatLocalDate(new Date()));
                          setDatePickerOpen(false);
                        }}
                      >
                        Today
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="receive-time-field space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground">Time</Label>
                <Input className="h-10 rounded-lg bg-white text-center tabular-nums" type="time" value={receivedTime} onChange={e => setReceivedTime(e.target.value)} />
              </div>
              <div className="receive-user-field rounded-lg border border-border/60 bg-background px-2.5 py-1.5 sm:col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Received by</p>
                <p className="truncate text-sm font-semibold text-foreground">{user?.name || 'Signed-in user'}</p>
              </div>
              <div className="receive-notes-field space-y-1 sm:col-span-2">
                <Label className="text-xs font-semibold text-muted-foreground">Notes</Label>
                <Input className="h-10 rounded-lg bg-white" placeholder="Optional batch notes" value={batchNotes} onChange={e => setBatchNotes(e.target.value)} />
              </div>
            </div>
          </div>

        <div className="rounded-lg border border-border/60 bg-background p-2.5 xl:hidden">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Suppliers</p>
              <p className="text-xs text-muted-foreground">In this receipt</p>
            </div>
            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              {receivedSupplierSummary.length}
            </span>
          </div>
          {receivedSupplierSummary.length > 0 ? (
            <div className="grid max-h-[180px] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {receivedSupplierSummary.map(supplier => (
                <div
                  key={supplier.id}
                  className="rounded-md border border-border/70 bg-white p-2"
                  title={`${supplier.name}: ${supplier.lines} line${supplier.lines === 1 ? '' : 's'}, ${supplier.packages} package${supplier.packages === 1 ? '' : 's'}`}
                >
                  <p className="truncate text-sm font-semibold text-foreground">{supplier.name}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-xs">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                      {supplier.lines} line{supplier.lines === 1 ? '' : 's'}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">
                      {supplier.packages} pkg
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/70 bg-white px-2.5 py-3 text-xs leading-5 text-muted-foreground">
              Select a supplier on a receiving line and it will appear here.
            </div>
          )}
        </div>
        </div>
          </section>

          <section className="rounded-xl border border-border/70 bg-white/96 shadow-[0_12px_32px_rgba(15,23,42,0.045)] portrait:bg-transparent portrait:shadow-none">
        <div className="border-b border-border/70 bg-muted/20 px-3 py-2.5 portrait:rounded-t-xl portrait:bg-white/96">
          <div className="flex flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">Receiving lines</h2>
              <p className="truncate text-xs text-muted-foreground">{items.length - completedLines} pending, {totalPackages} ready packages</p>
            </div>
            <Button onClick={addItem} size="sm" className="h-9 shrink-0 gap-2 rounded-lg px-3">
              <Plus className="h-4 w-4" /> New line
            </Button>
          </div>
        </div>

            <div className="hidden border-b border-border/70 bg-white px-3 py-2 xl:hidden">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Suppliers</p>
                  <p className="text-xs text-muted-foreground">In this receipt</p>
                </div>
                <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                  {receivedSupplierSummary.length}
                </span>
              </div>
              {receivedSupplierSummary.length > 0 ? (
                <div className="mt-2 grid max-h-[220px] grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {receivedSupplierSummary.map(supplier => (
                    <div
                      key={supplier.id}
                      className="rounded-md border border-border/70 bg-background p-2"
                      title={`${supplier.name}: ${supplier.lines} line${supplier.lines === 1 ? '' : 's'}, ${supplier.packages} package${supplier.packages === 1 ? '' : 's'}`}
                    >
                      <p className="truncate text-sm font-semibold text-foreground">{supplier.name}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-xs">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                          {supplier.lines} line{supplier.lines === 1 ? '' : 's'}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">
                          {supplier.packages} pkg
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded-md border border-dashed border-border/70 bg-background px-2.5 py-2 text-xs text-muted-foreground">
                  Select a supplier on a line and it will appear here.
                </div>
              )}
            </div>

            <div className="hidden border-b border-border/70 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid lg:grid-cols-[78px_minmax(300px,1fr)_116px_82px_minmax(140px,0.72fr)_126px] lg:gap-2.5">
              <span>Line</span>
              <span>Supplier</span>
              <span>Type</span>
              <span>Qty</span>
              <span>P.O</span>
              <span>Damage</span>
            </div>

            <div className="divide-y divide-border/60 portrait:space-y-2.5 portrait:divide-y-0 portrait:bg-transparent portrait:p-2">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className={`border-l-4 px-3 py-2.5 transition-colors hover:bg-muted/10 portrait:rounded-xl portrait:border portrait:border-border/70 portrait:p-2.5 portrait:shadow-sm ${
                    firstIncompleteIndex === idx
                      ? 'border-l-primary bg-primary/5'
                      : isLineReady(item)
                        ? 'border-l-emerald-500/70 bg-white'
                        : 'border-l-transparent bg-white'
                  }`}
                >
              <div className="receive-line-grid grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[78px_minmax(300px,1fr)_116px_82px_minmax(140px,0.72fr)_126px] lg:items-end">
                <div className="receive-line-number flex items-center justify-between gap-2 lg:block">
                  <div className="flex items-center gap-2 lg:block">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold shadow-sm ${item.supplierId ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {idx + 1}
                    </div>
                    <div className="lg:hidden">
                      <p className="text-sm font-semibold text-foreground">Line {idx + 1}</p>
                      <p className="text-xs text-muted-foreground">{isLineReady(item) ? 'Ready to save' : 'Complete required fields'}</p>
                    </div>
                  </div>
                  <div className="mt-1 hidden lg:block">
                    {firstIncompleteIndex === idx && <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Next</span>}
                    {firstIncompleteIndex !== idx && isLineReady(item) && <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Ready</span>}
                  </div>
                  <div className="mt-2 hidden w-fit items-center gap-1 rounded-lg border border-border/60 bg-background p-0.5 lg:flex">
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 rounded-md p-0 text-muted-foreground hover:text-foreground" onClick={() => duplicateItem(idx)} title="Duplicate line" aria-label="Duplicate line">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {items.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 rounded-md p-0 text-destructive hover:text-destructive" onClick={() => removeItem(idx)} title="Remove line" aria-label="Remove line">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 lg:hidden">
                    {firstIncompleteIndex === idx && (
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">Next</span>
                    )}
                    {firstIncompleteIndex !== idx && isLineReady(item) && (
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Ready</span>
                    )}
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground" onClick={() => duplicateItem(idx)} title="Duplicate line" aria-label="Duplicate line">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {items.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 rounded-lg p-0 text-destructive hover:text-destructive" onClick={() => removeItem(idx)} title="Remove line" aria-label="Remove line">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="receive-line-supplier space-y-1 sm:col-span-2 lg:col-span-1 lg:space-y-0">
                  <Label className="text-xs font-semibold text-muted-foreground lg:hidden">Supplier *</Label>
                  <SupplierCombobox
                    suppliers={suppliers}
                    value={item.supplierId}
                    invalid={!item.supplierId}
                    onChange={id => {
                      updateItem(idx, { supplierId: id });
                      window.setTimeout(() => qtyRefs.current[item.id]?.focus(), 0);
                    }}
                    onSupplierAdded={() => {
                      refetchSuppliers();
                    }}
                  />
                </div>

                <div className="receive-line-type space-y-1 lg:space-y-0">
                  <Label className="text-xs font-semibold text-muted-foreground lg:hidden">Type</Label>
                  <Select value={item.packageType} onValueChange={value => updateItem(idx, { packageType: value })}>
                    <SelectTrigger className="h-10 rounded-lg bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boxes">Boxes</SelectItem>
                      <SelectItem value="pallet">Pallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="receive-line-qty space-y-1 lg:space-y-0">
                  <Label className="text-xs font-semibold text-muted-foreground lg:hidden">Qty</Label>
                  <Input
                    ref={node => {
                      qtyRefs.current[item.id] = node;
                    }}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className={`h-10 rounded-lg bg-white text-center font-semibold ${
                      item.packageCount < 1 ? 'border-destructive/40 focus-visible:ring-destructive/40' : ''
                    }`}
                    value={item.packageCount === 0 ? '' : item.packageCount}
                    onFocus={() => {
                      if (item.packageCount === 1) {
                        updateItem(idx, { packageCount: 0 });
                      }
                    }}
                    onBlur={() => {
                      if (item.packageCount < 1) {
                        updateItem(idx, { packageCount: 1 });
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && item.packageCount > 0) {
                        e.preventDefault();
                        addItem();
                      }
                    }}
                    onChange={e =>
                      updateItem(idx, {
                        packageCount: e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </div>

                <div className="receive-line-po space-y-1 lg:space-y-0">
                  <Label className="text-xs font-semibold text-muted-foreground lg:hidden">P.O</Label>
                  <Input className="h-10 rounded-lg bg-white" placeholder="P.O" value={item.trackingNumber} onChange={e => updateItem(idx, { trackingNumber: e.target.value })} />
                </div>

                <div className="receive-line-damage space-y-1 lg:space-y-0">
                  <Label className="receive-line-damage-label text-xs font-semibold text-muted-foreground lg:hidden">Damage</Label>
                  <div className="receive-damage-toggle-wrap flex h-10 w-full items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      className={getDamageButtonClass(item.damagedBox)}
                      onClick={() => {
                        const nextDamaged = !item.damagedBox;
                        updateItem(idx, { damagedBox: nextDamaged });
                        if (nextDamaged) {
                          setOpenDetails(prev => new Set(prev).add(item.id));
                          return;
                        }
                        setOpenDetails(prev => {
                          const next = new Set(prev);
                          next.delete(item.id);
                          return next;
                        });
                      }}
                    >
                      {item.damagedBox ? (
                        <AlertTriangle className="receive-damage-icon mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="receive-damage-icon mr-1.5 h-3.5 w-3.5" />
                      )}
                      <span>{item.damagedBox ? 'Damaged' : 'No damage'}</span>
                    </Button>
                  </div>
                </div>

              </div>

              <div className="mt-2 sm:col-span-2">
                <Collapsible open={openDetails.has(item.id)} onOpenChange={() => toggleDetails(item.id)}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                        {openDetails.has(item.id) ? 'Hide details' : 'Details'}
                      </Button>
                    </CollapsibleTrigger>
                    {item.photoFile && <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">Photo attached</span>}
                    {item.damagedBox && !item.damagedNotes.trim() && (
                      <span className="rounded-md bg-destructive/8 px-2 py-1 text-xs font-semibold text-destructive">Add damage notes</span>
                    )}
                    {item.damagedBox && !item.photoFile && (
                      <span className="rounded-md bg-destructive/8 px-2 py-1 text-xs font-semibold text-destructive">Add damage photo</span>
                    )}
                  </div>
                  <CollapsibleContent className="pt-2">
                    <div className="grid grid-cols-1 gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-2.5 sm:grid-cols-[140px_minmax(0,1fr)]">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold text-muted-foreground">{item.damagedBox ? 'Damage photo *' : 'Photo'}</Label>
                        <label
                          htmlFor={`photo-upload-${item.id}`}
                          className={`flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium transition-colors hover:bg-muted ${
                            item.damagedBox && !item.photoFile ? 'border-destructive/35 text-destructive' : 'border-border text-muted-foreground'
                          }`}
                        >
                          <Camera className="h-4 w-4" />
                          {item.photoPreview ? 'Replace' : 'Upload'}
                        </label>
                        <input
                          id={`photo-upload-${item.id}`}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={e => e.target.files?.[0] && handlePhotoSelect(idx, e.target.files[0])}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-muted-foreground">Comments</Label>
                          <Input className="h-10 rounded-lg bg-white" placeholder="Optional comments" value={item.comments} onChange={e => updateItem(idx, { comments: e.target.value })} />
                        </div>
                        {item.damagedBox && (
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold text-muted-foreground">Damage notes *</Label>
                            <Input
                              className={`h-10 rounded-lg bg-white ${!item.damagedNotes.trim() ? 'border-destructive/35 focus-visible:ring-destructive/40' : ''}`}
                              placeholder="Describe damage"
                              value={item.damagedNotes}
                              onChange={e => updateItem(idx, { damagedNotes: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="hidden rounded-xl border border-border/70 bg-muted/20 p-2.5 shadow-sm xl:sticky xl:top-3 xl:block">
          <div className="rounded-lg border border-border/60 bg-white p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Suppliers</p>
                <p className="text-xs text-muted-foreground">In this receipt</p>
              </div>
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                {receivedSupplierSummary.length}
              </span>
            </div>
            {receivedSupplierSummary.length > 0 ? (
              <div className="max-h-[calc(100vh-190px)] space-y-1.5 overflow-y-auto pr-1">
                {receivedSupplierSummary.map(supplier => (
                  <div
                    key={supplier.id}
                    className="rounded-md border border-border/70 bg-background p-2"
                    title={`${supplier.name}: ${supplier.lines} line${supplier.lines === 1 ? '' : 's'}, ${supplier.packages} package${supplier.packages === 1 ? '' : 's'}`}
                  >
                    <p className="truncate text-sm font-semibold text-foreground">{supplier.name}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-xs">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
                        {supplier.lines} line{supplier.lines === 1 ? '' : 's'}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">
                        {supplier.packages} pkg
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border/70 bg-background px-2.5 py-3 text-xs leading-5 text-muted-foreground">
                Select a supplier on a receiving line and it will appear here.
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="receive-save-bar sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-white/80 bg-white/95 p-3 shadow-[0_20px_70px_rgba(15,23,42,0.14)] backdrop-blur portrait:bottom-2 portrait:mx-2 sm:flex-row sm:items-center">
        <div className="min-w-[240px] rounded-xl border border-border/60 bg-muted/30 px-3 py-2 portrait:min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Receipt summary</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{totalPackages}</span> packages,
            {' '}<span className="font-semibold text-foreground">{completedLines}</span> ready lines
          </p>
        </div>
        {currentReceiptAlreadySaved ? (
          <>
            <Button asChild size="lg" className="h-12 gap-2 rounded-xl sm:flex-1">
              <Link to={`/history?open=${encodeURIComponent(lastSavedBatchId || '')}`}>
                <History className="h-5 w-5" /> View in History
              </Link>
            </Button>
            <Button onClick={resetBatch} size="lg" variant="secondary" className="h-12 gap-2 rounded-xl sm:flex-1">
              <RotateCcw className="h-5 w-5" /> Start New
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => handleSave(false)} size="lg" className="h-12 gap-2 rounded-xl sm:flex-1" disabled={saving}>
              <Save className="h-5 w-5" /> {saving ? 'Saving...' : 'Save Batch'}
            </Button>
            <Button onClick={() => handleSave(true)} size="lg" variant="secondary" className="h-12 gap-2 rounded-xl sm:flex-1" disabled={saving}>
              <RotateCcw className="h-5 w-5" /> Save & New
            </Button>
            <Button onClick={resetBatch} size="lg" variant="outline" className="h-12 gap-2 rounded-xl bg-white" disabled={saving}>
              <RotateCcw className="h-5 w-5" /> Reset
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
