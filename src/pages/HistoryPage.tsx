import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Download, ChevronDown, ChevronRight, Trash2, Pencil } from 'lucide-react';
import { createReceiptPhotoUrl, useCarriers, useSuppliers, useEmployees, type BatchWithItems } from '@/hooks/useSupabaseData';
import { supabase } from '@/integrations/supabase/client';
import CarrierBadge from '@/components/CarrierBadge';
import { toast } from 'sonner';
import {
  deleteLocalBatch,
  deleteLocalItem,
  isMockLocal,
  listLocalHistoryBatches,
  updateLocalBatch,
  updateLocalItem,
} from '@/lib/localWarehouseData';

function escapeCsv(val: string) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function PhotoPreview({ path }: { path: string }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let active = true;
    setUrl('');
    createReceiptPhotoUrl(path)
      .then(nextUrl => {
        if (active) setUrl(nextUrl);
      })
      .catch(() => {
        if (active) setUrl('');
      });
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt="Receipt photo"
        className="rounded-lg border max-h-48 object-contain bg-muted"
        loading="lazy"
      />
    </a>
  );
}

interface EditItemState {
  id: string;
  supplier_id: string;
  package_type: string;
  package_count: number;
  damaged_box: boolean;
  damaged_notes: string;
  tracking_number: string;
  comments: string;
}

type ReceiptItem = BatchWithItems['receipt_items'][number];
type HistoryReceiptItem = ReceiptItem & {
  suppliers?:
    | {
        name: string;
        code: string | null;
      }
    | {
        name: string;
        code: string | null;
      }[]
    | null;
};
type HistoryBatch = Omit<BatchWithItems, 'receipt_items'> & {
  receipt_items: HistoryReceiptItem[];
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getNestedSupplierName(item: HistoryReceiptItem) {
  if (Array.isArray(item.suppliers)) {
    return item.suppliers[0]?.name || '';
  }
  return item.suppliers?.name || '';
}

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { carriers, loading: carriersLoading } = useCarriers();
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const { employees, loading: employeesLoading } = useEmployees();
  const [allBatches, setAllBatches] = useState<HistoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [openBatches, setOpenBatches] = useState<Set<string>>(new Set());

  // Edit state
  const [editingBatch, setEditingBatch] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editCarrierId, setEditCarrierId] = useState('');
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editItem, setEditItem] = useState<EditItemState | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchBatches = useCallback(() => {
    setLoading(true);
    if (isMockLocal) {
      setAllBatches(listLocalHistoryBatches());
      setLoading(false);
      return;
    }

    supabase
      .from('receipt_batches')
      .select('*, receipt_items(*, suppliers(name, code))')
      .order('received_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) throw error;
        setAllBatches((data as HistoryBatch[]) || []);
      })
      .catch(err => {
        console.error('Failed to load receipt history', err);
        setAllBatches([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filterCarrier, setFilterCarrier] = useState(searchParams.get('carrier') || 'all');
  const [filterSupplier, setFilterSupplier] = useState(searchParams.get('supplier') || 'all');
  const [filterDate, setFilterDate] = useState(searchParams.get('date') || '');
  const [damagedOnly, setDamagedOnly] = useState(searchParams.get('damaged') === 'true');
  const [filterPackageType, setFilterPackageType] = useState(searchParams.get('packageType') || 'all');
  const openParam = searchParams.get('open') || '';

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('search', search);
    if (filterCarrier !== 'all') next.set('carrier', filterCarrier);
    if (filterSupplier !== 'all') next.set('supplier', filterSupplier);
    if (filterDate) next.set('date', filterDate);
    if (damagedOnly) next.set('damaged', 'true');
    if (filterPackageType !== 'all') next.set('packageType', filterPackageType);
    if (openParam) next.set('open', openParam);
    setSearchParams(next, { replace: true });
  }, [search, filterCarrier, filterSupplier, filterDate, damagedOnly, filterPackageType, openParam, setSearchParams]);

  useEffect(() => {
    if (!openParam) return;
    const ids = openParam
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    setOpenBatches(new Set(ids));
  }, [openParam]);

  const toggleBatch = (id: string) => {
    setOpenBatches(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return allBatches.filter(b => {
      if (filterCarrier !== 'all' && b.carrier_id !== filterCarrier) return false;
      if (filterSupplier !== 'all' && !b.receipt_items.some(i => i.supplier_id === filterSupplier)) return false;
      if (filterDate && !b.received_at.startsWith(filterDate)) return false;
      if (damagedOnly && !b.receipt_items.some(i => i.damaged_box)) return false;
      if (filterPackageType !== 'all' && !b.receipt_items.some(i => i.package_type.toLowerCase() === filterPackageType)) return false;
      if (search) {
        const q = search.toLowerCase();
        const carrier = carriers.find(c => c.id === b.carrier_id);
        const supplierNames = b.receipt_items
          .map(i => getNestedSupplierName(i) || suppliers.find(s => s.id === i.supplier_id)?.name || '')
          .join(' ');
        const haystack = [carrier?.name, b.received_by_text, b.notes, supplierNames, ...b.receipt_items.map(i => i.tracking_number)].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allBatches, filterCarrier, filterSupplier, filterDate, damagedOnly, filterPackageType, search, carriers, suppliers]);

  // Delete batch
  const deleteBatch = async (batchId: string) => {
    try {
      if (isMockLocal) {
        deleteLocalBatch(batchId);
      } else {
        await supabase.from('receipt_items').delete().eq('batch_id', batchId);
        await supabase.from('receipt_photos').delete().eq('batch_id', batchId);
        await supabase.from('receipt_batches').delete().eq('id', batchId);
      }
      setAllBatches(prev => prev.filter(b => b.id !== batchId));
      toast.success('Batch deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete'));
    }
  };

  // Delete single item
  const deleteItem = async (itemId: string, batchId: string) => {
    try {
      if (isMockLocal) {
        deleteLocalItem(itemId);
      } else {
        await supabase.from('receipt_items').delete().eq('id', itemId);
      }
      setAllBatches(prev => prev.map(b =>
        b.id === batchId ? { ...b, receipt_items: b.receipt_items.filter(i => i.id !== itemId) } : b
      ));
      toast.success('Item deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete item'));
    }
  };

  // Edit batch
  const openEditBatch = (b: HistoryBatch) => {
    setEditingBatch(b.id);
    setEditNotes(b.notes || '');
    setEditCarrierId(b.carrier_id || '');
    setEditEmployeeId(b.received_by_employee_id || '');
  };

  const saveEditBatch = async () => {
    if (!editingBatch) return;
    setSaving(true);
    try {
      const patch = {
        notes: editNotes || null,
        carrier_id: editCarrierId || null,
        received_by_employee_id: editEmployeeId || null,
      };
      if (isMockLocal) {
        updateLocalBatch(editingBatch, patch);
      } else {
        await supabase.from('receipt_batches').update(patch).eq('id', editingBatch);
      }
      setAllBatches(prev => prev.map(b =>
        b.id === editingBatch ? { ...b, notes: editNotes || null, carrier_id: editCarrierId || null, received_by_employee_id: editEmployeeId || null } : b
      ));
      setEditingBatch(null);
      toast.success('Batch updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update'));
    } finally {
      setSaving(false);
    }
  };

  // Edit item
  const openEditItem = (item: ReceiptItem) => {
    setEditItem({
      id: item.id,
      supplier_id: item.supplier_id,
      package_type: item.package_type,
      package_count: item.package_count,
      damaged_box: item.damaged_box,
      damaged_notes: item.damaged_notes || '',
      tracking_number: item.tracking_number || '',
      comments: item.comments || '',
    });
  };

  const saveEditItem = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      const patch = {
        supplier_id: editItem.supplier_id,
        package_type: editItem.package_type,
        package_count: editItem.package_count,
        damaged_box: editItem.damaged_box,
        damaged_notes: editItem.damaged_notes || null,
        tracking_number: editItem.tracking_number || null,
        comments: editItem.comments || null,
      };
      if (isMockLocal) {
        updateLocalItem(editItem.id, patch);
      } else {
        await supabase.from('receipt_items').update(patch).eq('id', editItem.id);
      }
      setAllBatches(prev => prev.map(b => ({
        ...b,
        receipt_items: b.receipt_items.map(i =>
          i.id === editItem.id ? { ...i, ...editItem, damaged_notes: editItem.damaged_notes || null, tracking_number: editItem.tracking_number || null, comments: editItem.comments || null } : i
        )
      })));
      setEditItem(null);
      toast.success('Item updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update item'));
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = useCallback(() => {
    const headers = ['Date', 'Time', 'Carrier', 'Received By', 'Batch Notes', 'Supplier', 'Package Type', 'Count', 'Damaged', 'Damage Notes', 'Tracking #', 'Comments'];
    const rows = filtered.flatMap(b => {
      const carrier = carriers.find(c => c.id === b.carrier_id);
      const receivedDate = b.received_at.split('T')[0];
      const receivedTime = new Date(b.received_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const emp = employees.find(e => e.id === b.received_by_employee_id);
      return b.receipt_items.map(item => {
        const supplier = suppliers.find(s => s.id === item.supplier_id);
        const supplierName = getNestedSupplierName(item) || supplier?.name || '';
        return [receivedDate, receivedTime, carrier?.name || '', emp?.name || b.received_by_text || '', b.notes || '', supplierName, item.package_type, String(item.package_count), item.damaged_box ? 'Yes' : 'No', item.damaged_notes || '', item.tracking_number || '', item.comments || ''].map(v => escapeCsv(v));
      });
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, carriers, suppliers, employees]);

  if (loading || carriersLoading || suppliersLoading || employeesLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Receipt History</h1>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="touch-target lg:col-span-2" />
            <Select value={filterCarrier} onValueChange={setFilterCarrier}>
              <SelectTrigger className="touch-target"><SelectValue placeholder="All carriers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Carriers</SelectItem>
                {carriers.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <CarrierBadge name={c.name} size="sm" />
                      <span>{c.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
              <SelectTrigger className="touch-target"><SelectValue placeholder="All suppliers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPackageType} onValueChange={setFilterPackageType}>
              <SelectTrigger className="touch-target"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="boxes">Boxes</SelectItem>
                <SelectItem value="pallet">Pallet</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="touch-target" />
            <div className="flex items-center gap-2 lg:justify-start">
              <Switch checked={damagedOnly} onCheckedChange={setDamagedOnly} />
              <Label className="text-sm">Damaged only</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">{filtered.length} batch(es) found</div>
      <div className="space-y-3">
        {filtered.map(b => {
          const carrier = carriers.find(c => c.id === b.carrier_id);
          const receivedDate = b.received_at.split('T')[0];
          const receivedTime = new Date(b.received_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const emp = employees.find(e => e.id === b.received_by_employee_id);
          const isOpen = openBatches.has(b.id);
          const totalPkgs = b.receipt_items.reduce((sum, i) => sum + i.package_count, 0);
          const hasDamaged = b.receipt_items.some(i => i.damaged_box);

          return (
            <Collapsible key={b.id} open={isOpen} onOpenChange={() => toggleBatch(b.id)}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 flex-1 min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <CarrierBadge name={carrier?.name || '?'} size="sm" />
                          <CardTitle className="truncate text-base">{carrier?.name || 'Unknown'} — {receivedDate}</CardTitle>
                          {hasDamaged && <span className="text-destructive text-xs font-medium">⚠ Damaged</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {receivedTime} • {b.receipt_items.length} line(s) • {totalPkgs} pkg(s) • by {emp?.name || b.received_by_text || 'Staff'}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    {/* Batch actions */}
                    <div className="flex items-center gap-2 mb-3">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={(e) => { e.stopPropagation(); openEditBatch(b); }}>
                        <Pencil className="w-3.5 h-3.5" /> Edit Batch
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={e => e.stopPropagation()}>
                            <Trash2 className="w-3.5 h-3.5" /> Delete Batch
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this batch?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete the batch and all its items. This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteBatch(b.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    {b.notes && <p className="text-sm text-muted-foreground mb-3 italic">Batch notes: {b.notes}</p>}
                    
                    {b.shared_photo_path && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Batch Photo</p>
                        <PhotoPreview path={b.shared_photo_path} />
                      </div>
                    )}

                    <div className="divide-y">
                      {b.receipt_items.map(item => {
                        const supplier = suppliers.find(s => s.id === item.supplier_id);
                        const supplierName = getNestedSupplierName(item) || supplier?.name || 'Unknown';
                        return (
                          <div key={item.id} className="py-3 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{supplierName}</span>
                                <span className="text-muted-foreground">{item.package_type === 'pallet' || item.package_type === 'Pallet' ? '🏗️' : '📦'} × {item.package_count}</span>
                                {item.damaged_box && <span className="text-destructive text-xs font-medium">⚠ Damaged</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                {item.tracking_number && <span className="text-xs text-muted-foreground">#{item.tracking_number}</span>}
                                <button onClick={() => openEditItem(item)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Edit item" aria-label={`Edit ${supplierName}`}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Delete item" aria-label={`Delete ${supplierName}`}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                                      <AlertDialogDescription>This will permanently delete this line item.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteItem(item.id, b.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>

                            {item.damaged_box && item.damaged_notes && (
                              <p className="text-sm text-destructive/80 bg-destructive/5 rounded px-2 py-1">
                                Damage: {item.damaged_notes}
                              </p>
                            )}

                            {item.comments && (
                              <p className="text-sm text-muted-foreground">💬 {item.comments}</p>
                            )}

                            {item.item_photo_path && (
                              <div>
                                <PhotoPreview path={item.item_photo_path} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No receipts found matching your filters.</p>
        )}
      </div>

      {/* Edit Batch Dialog */}
      <Dialog open={!!editingBatch} onOpenChange={(open) => !open && setEditingBatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Carrier</Label>
              <Select value={editCarrierId} onValueChange={setEditCarrierId}>
                <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
                <SelectContent>
                  {carriers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <CarrierBadge name={c.name} size="sm" />
                        <span>{c.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Received By</Label>
              <Select value={editEmployeeId} onValueChange={setEditEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Batch notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBatch(null)}>Cancel</Button>
            <Button onClick={saveEditBatch} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={editItem.supplier_id} onValueChange={v => setEditItem({ ...editItem, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Package Type</Label>
                  <Select value={editItem.package_type} onValueChange={v => setEditItem({ ...editItem, package_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="boxes">Boxes</SelectItem>
                      <SelectItem value="pallet">Pallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Count</Label>
                  <Input type="number" min={1} value={editItem.package_count} onChange={e => setEditItem({ ...editItem, package_count: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>P.O</Label>
                <Input value={editItem.tracking_number} onChange={e => setEditItem({ ...editItem, tracking_number: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editItem.damaged_box} onCheckedChange={v => setEditItem({ ...editItem, damaged_box: v })} />
                <Label>Damaged</Label>
              </div>
              {editItem.damaged_box && (
                <div className="space-y-1.5">
                  <Label>Damage Notes</Label>
                  <Input value={editItem.damaged_notes} onChange={e => setEditItem({ ...editItem, damaged_notes: e.target.value })} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Comments</Label>
                <Textarea value={editItem.comments} onChange={e => setEditItem({ ...editItem, comments: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={saveEditItem} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
