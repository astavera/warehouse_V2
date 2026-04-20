import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Save, RotateCcw, Camera } from 'lucide-react';
import { useSuppliers, useCarriers, saveBatch, uploadPhoto } from '@/hooks/useSupabaseData';
import SupplierCombobox from '@/components/SupplierCombobox';
import InlineAddCarrier from '@/components/InlineAddCarrier';
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

  const activeCarriers = carriers.filter(c => c.active);

  const updateItem = (idx: number, patch: Partial<LineItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => setItems(prev => [emptyItem(), ...prev]);

  const handlePhotoSelect = (idx: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => updateItem(idx, { photoFile: file, photoPreview: reader.result as string });
    reader.readAsDataURL(file);
  };

  const validate = () => {
    if (!carrierId) { toast.error('Please select a carrier'); return false; }
    if (!user?.id) { toast.error('You must be signed in'); return false; }
    for (let i = 0; i < items.length; i++) {
      if (!items[i].supplierId) { toast.error(`Line ${i + 1}: select a supplier`); return false; }
      if (items[i].packageCount < 1) { toast.error(`Line ${i + 1}: package count must be at least 1`); return false; }
      if (items[i].damagedBox && !items[i].damagedNotes.trim()) { toast.error(`Line ${i + 1}: please describe the damage`); return false; }
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
        notes: batchNotes || null,
      };

      const itemsData = await Promise.all(items.map(async (it) => {
        let photoPath: string | null = null;
        if (it.photoFile) {
          const ext = it.photoFile.name.split('.').pop() || 'jpg';
          const path = `items/${createId()}.${ext}`;
          await uploadPhoto(it.photoFile, path);
          photoPath = path;
        }
        return {
          batch_id: '', // will be set by saveBatch
          supplier_id: it.supplierId,
          package_type: it.packageType,
          package_count: it.packageCount,
          damaged_box: it.damagedBox,
          damaged_notes: it.damagedNotes || null,
          tracking_number: it.trackingNumber || null,
          comments: it.comments || null,
          item_photo_path: photoPath,
        };
      }));

      await saveBatch(batchData, itemsData);
      toast.success(`Batch saved — ${items.length} line(s)`);

      if (andNew) {
        const { date: d, time: t } = now();
        setCarrierId('');
        setReceivedDate(d);
        setReceivedTime(t);
        setBatchNotes('');
        setItems([emptyItem()]);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Receive Shipment</h1>
      </div>

      {/* Batch header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Batch Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Carrier */}
            <div className="space-y-1.5">
              <Label>Carrier *</Label>
              <div className="flex items-center gap-1">
                <Select value={carrierId} onValueChange={setCarrierId}>
                  <SelectTrigger className="touch-target flex-1"><SelectValue placeholder="Select carrier" /></SelectTrigger>
                  <SelectContent>
                    {activeCarriers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InlineAddCarrier onAdded={(c) => { refetchCarriers(); setCarrierId(c.id); }} />
              </div>
            </div>

            {/* Received by */}
            <div className="space-y-1.5">
              <Label>Received By</Label>
              <Input value={user?.name || ''} disabled className="touch-target bg-muted" />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className="touch-target" />
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={receivedTime} onChange={e => setReceivedTime(e.target.value)} className="touch-target" />
            </div>
          </div>

          <div className="mt-3">
            <Label>Batch Notes</Label>
            <Textarea placeholder="Optional notes for entire batch..." value={batchNotes} onChange={e => setBatchNotes(e.target.value)} className="mt-1.5 min-h-[60px]" />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Supplier Lines ({items.length})</h2>
          <Button onClick={addItem} variant="outline" className="gap-1.5 touch-target">
            <Plus className="w-4 h-4" /> Add Supplier Line
          </Button>
        </div>

        {items.map((item, idx) => (
          <Card key={item.id} className="relative border-border/60">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-start gap-3">
                {/* Line number */}
                <span className="text-xs font-medium text-muted-foreground mt-2 min-w-[18px]">#{idx + 1}</span>

                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-2">
                  {/* Supplier */}
                  <div className="space-y-1 col-span-2 sm:col-span-2 lg:col-span-2">
                    <Label className="text-xs">Supplier *</Label>
                    <SupplierCombobox
                      suppliers={suppliers}
                      value={item.supplierId}
                      onChange={id => updateItem(idx, { supplierId: id })}
                      onSupplierAdded={() => { refetchSuppliers(); }}
                    />
                  </div>

                  {/* Package type */}
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={item.packageType} onValueChange={(v) => updateItem(idx, { packageType: v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="boxes">Boxes</SelectItem>
                        <SelectItem value="pallet">Pallet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Count */}
                  <div className="space-y-1">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number" min={1} value={item.packageCount === 0 ? '' : item.packageCount}
                      onChange={e => updateItem(idx, { packageCount: e.target.value === '' ? 0 : parseInt(e.target.value) || 0 })}
                      className="h-9"
                    />
                  </div>

                  {/* P.O */}
                  <div className="space-y-1">
                    <Label className="text-xs">P.O</Label>
                    <Input placeholder="—" value={item.trackingNumber} onChange={e => updateItem(idx, { trackingNumber: e.target.value })} className="h-9" />
                  </div>

                  {/* Photo */}
                  <div className="space-y-1">
                    <Label className="text-xs">Photo</Label>
                    <label className="flex items-center gap-1.5 cursor-pointer border rounded-md px-2 h-9 text-xs text-muted-foreground hover:bg-muted transition-colors">
                      <Camera className="w-3.5 h-3.5" />
                      {item.photoPreview ? '✓' : 'Upload'}
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handlePhotoSelect(idx, e.target.files[0])} />
                    </label>
                  </div>

                  {/* Damaged toggle + notes inline */}
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label className="text-xs">Damaged?</Label>
                    <div className="flex items-center gap-1.5 h-9">
                      <Switch checked={item.damagedBox} onCheckedChange={v => updateItem(idx, { damagedBox: v })} className="scale-90" />
                      <span className="text-xs">{item.damagedBox ? 'Yes' : 'No'}</span>
                    </div>
                  </div>

                  {item.damagedBox && (
                    <div className="space-y-1 col-span-2 sm:col-span-2 lg:col-span-5">
                      <Label className="text-xs">Damage Notes *</Label>
                      <Input placeholder="Describe the damage..." value={item.damagedNotes} onChange={e => updateItem(idx, { damagedNotes: e.target.value })} className="h-9" />
                    </div>
                  )}

                  {/* Comments */}
                  <div className="space-y-1 col-span-2 sm:col-span-3 lg:col-span-6">
                    <Label className="text-xs">Comments</Label>
                    <Input placeholder="Optional comments" value={item.comments} onChange={e => updateItem(idx, { comments: e.target.value })} className="h-9" />
                  </div>
                </div>

                {/* Delete button */}
                {items.length > 1 && (
                  <button
                    onClick={() => removeItem(idx)}
                    className="mt-1.5 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pb-8">
        <Button onClick={() => handleSave(false)} size="lg" className="touch-target gap-2 flex-1 sm:flex-none" disabled={saving}>
          <Save className="w-5 h-5" /> {saving ? 'Saving...' : 'Save Batch'}
        </Button>
        <Button onClick={() => handleSave(true)} size="lg" variant="secondary" className="touch-target gap-2 flex-1 sm:flex-none" disabled={saving}>
          <RotateCcw className="w-5 h-5" /> Save & New Batch
        </Button>
      </div>
    </div>
  );
}
