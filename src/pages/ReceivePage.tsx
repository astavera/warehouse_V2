import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Save, RotateCcw, Camera, Copy, CheckCheck } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSuppliers, useCarriers, saveBatch, uploadPhoto } from '@/hooks/useSupabaseData';
import SupplierCombobox from '@/components/SupplierCombobox';
import InlineAddCarrier from '@/components/InlineAddCarrier';
import CarrierBadge from '@/components/CarrierBadge';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

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
    ? 'border border-primary/25 bg-primary/10 hover:bg-primary/15'
    : 'border border-transparent bg-transparent hover:bg-muted/20';

  return `h-14 ${widthClass} rounded-2xl p-0 shadow-none ${stateClass}`;
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
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [savedLineCount, setSavedLineCount] = useState(0);

  const activeCarriers = carriers.filter(c => c.active);

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
        photoPreview: source.photoPreview,
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

    for (let i = 0; i < items.length; i++) {
      if (!items[i].supplierId) {
        toast.error(`Line ${i + 1}: select a supplier`);
        return false;
      }
      if (items[i].packageCount < 1) {
        toast.error(`Line ${i + 1}: package count must be at least 1`);
        return false;
      }
      if (items[i].damagedBox && !items[i].damagedNotes.trim()) {
        toast.error(`Line ${i + 1}: please describe the damage`);
        return false;
      }
    }

    return true;
  };

  const handleSave = async (andNew: boolean) => {
    if (!validate()) return;

    setSaving(true);
    try {
      const receivedAt = new Date(`${receivedDate}T${receivedTime}`).toISOString();
      const batchData = {
        carrier_id: carrierId,
        received_by_employee_id: user.id,
        received_at: receivedAt,
        notes: batchNotes.trim() || null,
      };

      const itemsData = await Promise.all(
        items.map(async it => {
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

      await saveBatch(batchData, itemsData);
      setSavedLineCount(items.length);
      setShowSaveConfirmation(true);

      if (andNew) {
        resetBatch();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        className={`pointer-events-none fixed inset-0 z-50 flex items-center justify-center transition-all duration-300 ${
          showSaveConfirmation ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div
          className={`w-[min(92vw,420px)] rounded-[28px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,247,249,0.98)_100%)] p-6 text-center shadow-[0_30px_100px_rgba(15,23,42,0.18)] backdrop-blur transition-all duration-300 ${
            showSaveConfirmation ? 'scale-100 translate-y-0' : 'translate-y-3 scale-95'
          }`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
            <CheckCheck className="h-6 w-6" />
          </div>
          <p className="mt-4 text-xl font-semibold tracking-[-0.04em] text-foreground">Receipt saved</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {savedLineCount} line{savedLineCount === 1 ? '' : 's'} recorded and ready in History.
          </p>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">Receive</h1>
        <p className="mt-1 text-sm text-muted-foreground">Set the carrier, add supplier lines, save.</p>
      </div>

      <Card className="w-full max-w-3xl rounded-[22px] border-border/70 bg-white/95">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Batch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="space-y-1.5">
              <Label>Carrier *</Label>
              <div className="flex flex-wrap gap-2">
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
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_132px]">
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/35 px-3 py-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Received By</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{user?.name || '-'}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" value={receivedTime} onChange={e => setReceivedTime(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <div className="space-y-1.5 lg:max-w-3xl">
              <Label>Notes</Label>
              <Input
                placeholder="Optional notes"
                value={batchNotes}
                onChange={e => setBatchNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Lines</h2>
          <p className="text-sm text-muted-foreground">{items.length} item(s)</p>
        </div>

        <Button onClick={addItem} variant="outline" className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> Add Line
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {items.map((item, idx) => (
          <Card key={item.id} className="rounded-[20px] border-border/60 bg-white/95">
            <CardContent className="space-y-3 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-sm font-medium text-foreground">
                    {idx + 1}
                  </div>
                  <p className="text-sm font-medium text-foreground">Supplier line</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 rounded-lg px-2.5" onClick={() => duplicateItem(idx)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg px-2.5 text-destructive hover:text-destructive"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="space-y-1.5 md:col-span-5">
                  <Label>Supplier *</Label>
                  <SupplierCombobox
                    suppliers={suppliers}
                    value={item.supplierId}
                    onChange={id => updateItem(idx, { supplierId: id })}
                    onSupplierAdded={() => {
                      refetchSuppliers();
                    }}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label>Type</Label>
                  <Select value={item.packageType} onValueChange={value => updateItem(idx, { packageType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boxes">Boxes</SelectItem>
                      <SelectItem value="pallet">Pallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    value={item.packageCount === 0 ? '' : item.packageCount}
                    onChange={e =>
                      updateItem(idx, {
                        packageCount: e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </div>

                <div className="space-y-1.5 md:col-span-3">
                  <Label>P.O</Label>
                  <Input value={item.trackingNumber} onChange={e => updateItem(idx, { trackingNumber: e.target.value })} />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label>Damaged?</Label>
                  <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3">
                    <Switch checked={item.damagedBox} onCheckedChange={value => updateItem(idx, { damagedBox: value })} />
                    <span className="text-sm text-foreground">{item.damagedBox ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div className="flex items-end md:col-span-12">
                  <Collapsible open={openDetails.has(item.id)} onOpenChange={() => toggleDetails(item.id)} className="w-full">
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" className="h-8 justify-start px-0 text-sm text-muted-foreground">
                        {openDetails.has(item.id) ? 'Hide details' : 'More details'}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-8">
                        <div className="space-y-1.5 md:col-span-2">
                          <Label>Photo</Label>
                          <label
                            htmlFor={`photo-upload-${item.id}`}
                            className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted"
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

                        <div className="space-y-1.5 md:col-span-6">
                          <Label>Comments</Label>
                          <Input
                            placeholder="Optional comments"
                            value={item.comments}
                            onChange={e => updateItem(idx, { comments: e.target.value })}
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {item.damagedBox && (
                  <div className="space-y-1.5 md:col-span-12">
                    <Label>Damage Notes *</Label>
                    <Input
                      placeholder="Describe the damage"
                      value={item.damagedNotes}
                      onChange={e => updateItem(idx, { damagedNotes: e.target.value })}
                    />
                  </div>
                )}

              </div>

              {item.photoPreview && (
                <div className="rounded-[14px] border border-border/70 bg-[#fafafa] p-2.5">
                  <img src={item.photoPreview} alt="Preview" className="max-h-28 rounded-lg object-contain" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="sticky bottom-3 z-10 flex flex-col gap-3 rounded-[20px] border border-white/80 bg-white/92 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur sm:flex-row">
        <Button onClick={() => handleSave(false)} size="lg" className="gap-2 rounded-xl sm:flex-1" disabled={saving}>
          <Save className="h-5 w-5" /> {saving ? 'Saving...' : 'Save Batch'}
        </Button>
        <Button onClick={() => handleSave(true)} size="lg" variant="secondary" className="gap-2 rounded-xl sm:flex-1" disabled={saving}>
          <RotateCcw className="h-5 w-5" /> Save & New
        </Button>
        <Button onClick={resetBatch} size="lg" variant="outline" className="gap-2 rounded-xl" disabled={saving}>
          <RotateCcw className="h-5 w-5" /> Reset
        </Button>
      </div>
    </div>
  );
}
