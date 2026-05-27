import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle2, Clock3, Loader2, PackageSearch, Pencil, Plus, RefreshCw, Search, Settings, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useEmployees, useSuppliers } from '@/hooks/useSupabaseData';
import {
  useExpectedBoxAccess,
  useExpectedBoxRecipients,
  useExpectedBoxes,
  syncExpectedBoxTracking,
  type ExpectedBox,
  type ExpectedBoxStatus,
  type MatchCondition,
} from '@/hooks/useExpectedBoxes';
import { toast } from 'sonner';

const STATUS_META: Record<ExpectedBoxStatus, { label: string; className: string; icon: typeof Clock3 }> = {
  in_transit: {
    label: 'In transit',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: Truck,
  },
  delivered: {
    label: 'Delivered by carrier',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: Bell,
  },
  received: {
    label: 'Received in WH',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  needs_review: {
    label: 'Needs review',
    className: 'border-destructive/20 bg-destructive/8 text-destructive',
    icon: PackageSearch,
  },
};

function getStatusCount(boxes: ExpectedBox[], status: ExpectedBoxStatus) {
  return boxes.filter(box => box.status === status).length;
}

function getMatchLabel(condition: MatchCondition) {
  return condition === 'supplier_po' ? 'Supplier + P.O' : 'Supplier only';
}

function getDetailAccentClass(status: ExpectedBoxStatus) {
  if (status === 'received') return 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-100';
  if (status === 'delivered') return 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-100';
  return 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-100';
}

function formatEventTime(value: string | null) {
  if (!value) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatEventStatus(status: string | null) {
  if (!status) return 'Carrier update';
  return status.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatReceivedBoxes(count: number | null | undefined) {
  const value = Math.max(0, count || 0);
  return `${value} box${value === 1 ? '' : 'es'}`;
}

function formatWarehouseReceived(box: ExpectedBox) {
  if (!box.warehouse_received_at) return 'Pending WH';
  const receivedAt = formatDateTime(box.warehouse_received_at);
  if ((box.warehouse_received_box_count || 0) > 0) {
    return `${formatReceivedBoxes(box.warehouse_received_box_count)} received${receivedAt ? ` - ${receivedAt}` : ''}`;
  }
  return receivedAt ? `Received - ${receivedAt}` : 'Received - count pending';
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

export default function ExpectedBoxesPage() {
  const { user } = useAuth();
  const { suppliers } = useSuppliers();
  const { employees } = useEmployees();
  const { boxes, loading: boxesLoading, refetch: refetchExpectedBoxes, addExpectedBox, updateExpectedBox, deleteExpectedBox } = useExpectedBoxes();
  const { access, grantAccess, revokeAccess } = useExpectedBoxAccess();
  const { recipients, addRecipient, updateRecipient } = useExpectedBoxRecipients();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ExpectedBoxStatus>('all');
  const [selectedId, setSelectedId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [recipientOpen, setRecipientOpen] = useState(false);
  const [matchCondition, setMatchCondition] = useState<MatchCondition>('supplier_only');
  const [accessEmployeeId, setAccessEmployeeId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [carrier, setCarrier] = useState<'FedEx' | 'UPS' | 'USPS' | 'Amazon'>('FedEx');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [editCarrier, setEditCarrier] = useState<'FedEx' | 'UPS' | 'USPS' | 'Amazon'>('FedEx');
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editMatchCondition, setEditMatchCondition] = useState<MatchCondition>('supplier_only');
  const [editPoNumber, setEditPoNumber] = useState('');
  const [editStatus, setEditStatus] = useState<ExpectedBoxStatus>('in_transit');
  const [editNotes, setEditNotes] = useState('');
  const [syncingId, setSyncingId] = useState('');
  const [syncingList, setSyncingList] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const selectedItemRef = useRef<HTMLDivElement | null>(null);

  const filteredBoxes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boxes.filter(box => {
      const matchesStatus = statusFilter === 'all' || box.status === statusFilter;
      const supplierName = box.suppliers?.name || '';
      const matchesSearch =
        !q ||
        box.tracking_number.toLowerCase().includes(q) ||
        supplierName.toLowerCase().includes(q) ||
        box.carrier.toLowerCase().includes(q) ||
        (box.po_number || '').toLowerCase().includes(q) ||
        (box.notes || '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [boxes, search, statusFilter]);

  const selectedBox = selectedId ? boxes.find(box => box.id === selectedId) || null : null;
  const activeRecipients = recipients.filter(recipient => recipient.active);
  const normalizedUserName = user?.name?.trim().toLowerCase() || '';
  const canConfigureExpectedBoxesAccess = normalizedUserName === 'sebastian' || normalizedUserName.includes('admin');
  const canUseExpectedBoxes = Boolean(user && access.some(entry => entry.employee_id === user.id && entry.can_view));
  const canAccessExpectedBoxes = canUseExpectedBoxes || canConfigureExpectedBoxesAccess;
  const canManageNotifications = canUseExpectedBoxes || canConfigureExpectedBoxesAccess;
  const accessEmployees = employees;
  const allowedExpectedBoxUsers = accessEmployees.filter(employee => access.some(entry => entry.employee_id === employee.id && entry.can_view));
  const selectableAccessUsers = accessEmployees.filter(employee => !allowedExpectedBoxUsers.some(allowed => allowed.id === employee.id));

  useEffect(() => {
    if (!selectedId || addOpen || editOpen || recipientOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || selectedItemRef.current?.contains(target)) return;
      setSelectedId('');
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [selectedId, addOpen, editOpen, recipientOpen]);

  const handleGrantAccess = async () => {
    if (!accessEmployeeId) return;
    try {
      await grantAccess(accessEmployeeId, user?.id);
      setAccessEmployeeId('');
      toast.success('Expected Boxes access granted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to grant access'));
    }
  };

  const handleRevokeAccess = async (employeeId: string) => {
    try {
      await revokeAccess(employeeId);
      toast.success('Expected Boxes access removed');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to remove access'));
    }
  };

  const handleAddRecipient = async () => {
    if (!recipientName.trim() || !recipientEmail.trim()) return;
    try {
      await addRecipient({ name: recipientName.trim(), email: recipientEmail.trim() });
      setRecipientName('');
      setRecipientEmail('');
      toast.success('Recipient added');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add recipient'));
    }
  };

  const handleAddExpectedBox = async () => {
    if (!trackingNumber.trim() || !supplierId) return;
    if (matchCondition === 'supplier_po' && !poNumber.trim()) {
      toast.error('P.O is required for Supplier + P.O matching');
      return;
    }
    try {
      const newBox = await addExpectedBox({
        carrier,
        tracking_number: trackingNumber.trim(),
        supplier_id: supplierId,
        match_condition: matchCondition,
        po_number: matchCondition === 'supplier_po' ? poNumber.trim() : null,
        status: 'in_transit',
        last_carrier_event: 'Tracking saved, waiting for carrier update',
        notes: notes.trim() || null,
        created_by_employee_id: user?.id || null,
      });
      setTrackingNumber('');
      setSupplierId('');
      setPoNumber('');
      setNotes('');
      setMatchCondition('supplier_only');
      setCarrier('FedEx');
      setAddOpen(false);
      toast.success('Expected box added');
      setSelectedId(newBox.id);
      void handleSyncTracking(newBox);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add expected box'));
    }
  };

  const openEditExpectedBox = (box: ExpectedBox) => {
    setSelectedId(box.id);
    setEditCarrier(box.carrier);
    setEditTrackingNumber(box.tracking_number);
    setEditSupplierId(box.supplier_id);
    setEditMatchCondition(box.match_condition);
    setEditPoNumber(box.po_number || '');
    setEditStatus(box.status);
    setEditNotes(box.notes || '');
    setEditOpen(true);
  };

  const handleUpdateExpectedBox = async () => {
    if (!selectedBox || !editTrackingNumber.trim() || !editSupplierId) return;
    if (editMatchCondition === 'supplier_po' && !editPoNumber.trim()) {
      toast.error('P.O is required for Supplier + P.O matching');
      return;
    }
    try {
      await updateExpectedBox(selectedBox.id, {
        carrier: editCarrier,
        tracking_number: editTrackingNumber.trim(),
        supplier_id: editSupplierId,
        match_condition: editMatchCondition,
        po_number: editMatchCondition === 'supplier_po' ? editPoNumber.trim() : null,
        status: editStatus,
        notes: editNotes.trim() || null,
        warehouse_received_at: editStatus === 'received' ? selectedBox.warehouse_received_at : null,
        received_batch_id: editStatus === 'received' ? selectedBox.received_batch_id : null,
        received_item_id: editStatus === 'received' ? selectedBox.received_item_id : null,
      });
      setEditOpen(false);
      toast.success('Expected box updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update expected box'));
    }
  };

  const handleDeleteExpectedBox = async (box: ExpectedBox) => {
    const confirmedTrackingNumber = window.prompt(`Type ${box.tracking_number} to permanently delete this expected box.`);
    if (confirmedTrackingNumber?.trim() !== box.tracking_number) {
      toast.info('Expected box was not deleted');
      return;
    }
    try {
      await deleteExpectedBox(box.id);
      if (selectedId === box.id) setSelectedId('');
      setEditOpen(false);
      toast.success('Expected box deleted');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete expected box'));
    }
  };

  const handleSyncTracking = async (box: ExpectedBox) => {
    try {
      setSyncingId(box.id);
      const result = await syncExpectedBoxTracking(box.id);
      const refreshedBoxes = await refetchExpectedBoxes();
      setSelectedId(result.box?.id || refreshedBoxes.find(refreshedBox => refreshedBox.tracking_number === box.tracking_number)?.id || box.id);
      toast.success('Carrier tracking updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update carrier tracking'));
    } finally {
      setSyncingId('');
    }
  };

  const handleSyncVisibleTracking = async () => {
    const boxesToSync = filteredBoxes.filter(box => box.status !== 'received');
    if (boxesToSync.length === 0) {
      toast.info('No active tracking rows to refresh');
      return;
    }

    setSyncingList(true);
    setSyncProgress({ done: 0, total: boxesToSync.length });
    let failed = 0;

    try {
      for (const box of boxesToSync) {
        setSyncingId(box.id);
        try {
          await syncExpectedBoxTracking(box.id);
        } catch {
          failed += 1;
        } finally {
          setSyncProgress(progress => ({ ...progress, done: progress.done + 1 }));
        }
      }

      await refetchExpectedBoxes();
      if (failed > 0) {
        toast.warning(`Tracking refreshed with ${failed} failed update${failed === 1 ? '' : 's'}`);
      } else {
        toast.success(`Tracking refreshed for ${boxesToSync.length} expected box${boxesToSync.length === 1 ? '' : 'es'}`);
      }
    } finally {
      setSyncingId('');
      setSyncingList(false);
    }
  };

  if (!canAccessExpectedBoxes) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-xl border border-border/70 bg-white/96 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <PackageSearch className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">Expected Boxes is restricted</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This module is only available for Sharon. Sign in as Sharon to manage expected boxes and notifications.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-white/96 p-3 shadow-[0_14px_42px_rgba(15,23,42,0.05)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <PackageSearch className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight text-foreground">Expected Boxes</h1>
            <p className="text-sm text-muted-foreground">Track expected carrier deliveries and warehouse receiving matches.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-xs font-semibold text-muted-foreground">
            {activeRecipients.length} notification recipients
          </div>
          {canManageNotifications && (
            <Dialog open={recipientOpen} onOpenChange={setRecipientOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="h-10 gap-2 rounded-lg bg-white">
                  <Settings className="h-4 w-4" /> Expected Boxes settings
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Expected Boxes settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
                    <p className="text-sm font-semibold text-foreground">Module access</p>
                    <p className="text-xs text-muted-foreground">Choose which registered users can view and use Expected Boxes.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-white p-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-muted-foreground">Add user access</Label>
                      <Select value={accessEmployeeId} onValueChange={setAccessEmployeeId}>
                        <SelectTrigger className="h-10 rounded-lg bg-background">
                          <SelectValue placeholder="Select registered user" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectableAccessUsers.map(employee => (
                            <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="h-10 self-end gap-2 rounded-lg" onClick={handleGrantAccess} disabled={!accessEmployeeId}>
                      <Plus className="h-4 w-4" /> Grant access
                    </Button>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-white p-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">Users with access</p>
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                        {allowedExpectedBoxUsers.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {allowedExpectedBoxUsers.map(employee => (
                        <span key={employee.id} className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground">
                          {employee.name}
                          <button className="text-muted-foreground hover:text-destructive" type="button" aria-label={`Remove ${employee.name}`} onClick={() => handleRevokeAccess(employee.id)}>
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
                    <p className="text-sm font-semibold text-foreground">Notification recipients</p>
                    <p className="text-xs text-muted-foreground">Recipients here apply to all expected boxes unless disabled.</p>
                  </div>
                  <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(200px,1.3fr)_130px_130px_80px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Carrier delivered</span>
                    <span>WH received</span>
                    <span>Active</span>
                  </div>
                  <div className="space-y-2">
                    {recipients.map(recipient => (
                      <div key={recipient.id} className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-white p-2.5 lg:grid-cols-[minmax(150px,1fr)_minmax(200px,1.3fr)_130px_130px_80px] lg:items-center">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{recipient.name}</p>
                          <p className="text-xs text-muted-foreground lg:hidden">{recipient.email}</p>
                        </div>
                        <p className="hidden truncate text-sm text-muted-foreground lg:block">{recipient.email}</p>
                        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 lg:border-0 lg:bg-transparent lg:p-0">
                          <span className="text-xs font-medium text-muted-foreground lg:hidden">Carrier delivered</span>
                          <Switch checked={recipient.notify_carrier_delivered} onCheckedChange={value => updateRecipient(recipient.id, { notify_carrier_delivered: value })} />
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 lg:border-0 lg:bg-transparent lg:p-0">
                          <span className="text-xs font-medium text-muted-foreground lg:hidden">WH received</span>
                          <Switch checked={recipient.notify_warehouse_received} onCheckedChange={value => updateRecipient(recipient.id, { notify_warehouse_received: value })} />
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2 lg:border-0 lg:bg-transparent lg:p-0">
                          <span className="text-xs font-medium text-muted-foreground lg:hidden">Active</span>
                          <Switch checked={recipient.active} onCheckedChange={value => updateRecipient(recipient.id, { active: value })} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-white p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Input className="h-10 rounded-lg bg-background" placeholder="Name" value={recipientName} onChange={event => setRecipientName(event.target.value)} />
                    <Input className="h-10 rounded-lg bg-background" placeholder="email@company.com" value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} />
                    <Button className="h-10 gap-2 rounded-lg" onClick={handleAddRecipient} disabled={!recipientName.trim() || !recipientEmail.trim()}>
                      <Plus className="h-4 w-4" /> Add recipient
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="h-10 gap-2 rounded-lg">
                <Plus className="h-4 w-4" /> Add expected box
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add expected box</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Carrier</Label>
                <Select value={carrier} onValueChange={value => setCarrier(value as typeof carrier)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FedEx">FedEx</SelectItem>
                      <SelectItem value="UPS">UPS</SelectItem>
                      <SelectItem value="USPS">USPS</SelectItem>
                      <SelectItem value="Amazon">Amazon Shipping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tracking number</Label>
                <Input placeholder="Paste carrier tracking number" value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(supplier => (
                        <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                      ))}
                      {suppliers.length === 0 && <SelectItem value="sample">Sample Supplier</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Match condition</Label>
                  <Select value={matchCondition} onValueChange={value => setMatchCondition(value as MatchCondition)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supplier_only">Supplier only</SelectItem>
                      <SelectItem value="supplier_po">Supplier + P.O</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {matchCondition === 'supplier_po' && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>P.O *</Label>
                  <Input placeholder="Required for Supplier + P.O matching" value={poNumber} onChange={event => setPoNumber(event.target.value)} />
                </div>
              )}
              <div className="space-y-1 sm:col-span-2">
                <Label>Notes</Label>
                <Input placeholder="Optional internal notes" value={notes} onChange={event => setNotes(event.target.value)} />
              </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 sm:col-span-2">
                  <p className="text-xs font-semibold text-foreground">Notification recipients</p>
                  <p className="mt-1 text-xs text-muted-foreground">This expected box will use {activeRecipients.length} active recipients configured for this module.</p>
                </div>
              <Button className="h-10 rounded-lg sm:col-span-2" onClick={handleAddExpectedBox} disabled={!trackingNumber.trim() || !supplierId}>
                Save expected box
              </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit expected box</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Carrier</Label>
                  <Select value={editCarrier} onValueChange={value => setEditCarrier(value as typeof editCarrier)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FedEx">FedEx</SelectItem>
                      <SelectItem value="UPS">UPS</SelectItem>
                      <SelectItem value="USPS">USPS</SelectItem>
                      <SelectItem value="Amazon">Amazon Shipping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={value => setEditStatus(value as ExpectedBoxStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_transit">In transit</SelectItem>
                      <SelectItem value="delivered">Delivered by carrier</SelectItem>
                      <SelectItem value="received">Received in WH</SelectItem>
                      <SelectItem value="needs_review">Needs review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Tracking number</Label>
                  <Input placeholder="Paste carrier tracking number" value={editTrackingNumber} onChange={event => setEditTrackingNumber(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Supplier</Label>
                  <Select value={editSupplierId} onValueChange={setEditSupplierId}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(supplier => (
                        <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Match condition</Label>
                  <Select value={editMatchCondition} onValueChange={value => setEditMatchCondition(value as MatchCondition)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supplier_only">Supplier only</SelectItem>
                      <SelectItem value="supplier_po">Supplier + P.O</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editMatchCondition === 'supplier_po' && (
                  <div className="space-y-1 sm:col-span-2">
                    <Label>P.O *</Label>
                    <Input placeholder="Required for Supplier + P.O matching" value={editPoNumber} onChange={event => setEditPoNumber(event.target.value)} />
                  </div>
                )}
                <div className="space-y-1 sm:col-span-2">
                  <Label>Notes</Label>
                  <Input placeholder="Optional internal notes" value={editNotes} onChange={event => setEditNotes(event.target.value)} />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-between">
                  {selectedBox && (
                    <Button type="button" variant="destructive" className="h-10 gap-2 rounded-lg" onClick={() => handleDeleteExpectedBox(selectedBox)}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  )}
                  <div className="flex gap-2 sm:ml-auto">
                    <Button type="button" variant="outline" className="h-10 rounded-lg bg-white" onClick={() => setEditOpen(false)}>
                      Cancel
                    </Button>
                    <Button className="h-10 gap-2 rounded-lg" onClick={handleUpdateExpectedBox} disabled={!editTrackingNumber.trim() || !editSupplierId}>
                      <Pencil className="h-4 w-4" /> Save changes
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['In transit', getStatusCount(boxes, 'in_transit'), 'text-blue-700'],
          ['Delivered', getStatusCount(boxes, 'delivered'), 'text-amber-700'],
          ['Received', getStatusCount(boxes, 'received'), 'text-emerald-700'],
          ['Needs review', getStatusCount(boxes, 'needs_review'), 'text-destructive'],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-lg border border-border/70 bg-white px-3 py-2 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className={`mt-1 text-xl font-semibold leading-none ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {!canUseExpectedBoxes && (
        <div className="rounded-xl border border-border/70 bg-white/96 p-5 text-center shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Operational view is restricted</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sebastian can manage who has access. Turn on access for a user to let them use the Expected Boxes workflow.
          </p>
        </div>
      )}

      {canUseExpectedBoxes && <div className="grid grid-cols-1 gap-3">
        <section className="min-w-0 rounded-xl border border-border/70 bg-white/96 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border/70 bg-muted/20 px-3 py-2.5 md:flex-row md:items-center md:justify-between">
            <div className="relative md:w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 rounded-lg bg-white pl-9" placeholder="Search tracking, supplier, P.O..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 rounded-lg bg-white"
                onClick={handleSyncVisibleTracking}
                disabled={syncingList || boxesLoading || filteredBoxes.length === 0}
              >
                {syncingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {syncingList ? `Refreshing ${syncProgress.done}/${syncProgress.total}` : 'Refresh list'}
              </Button>
              <Select value={statusFilter} onValueChange={value => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="h-10 rounded-lg bg-white md:w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="in_transit">In transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="received">Received in WH</SelectItem>
                  <SelectItem value="needs_review">Needs review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="hidden border-b border-border/70 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:grid lg:grid-cols-[150px_minmax(220px,1fr)_160px_130px_150px_140px] lg:gap-3">
            <span>Status</span>
            <span>Tracking</span>
            <span>Supplier</span>
            <span>Match</span>
            <span>Carrier delivery</span>
            <span>WH received</span>
          </div>

          <div className="divide-y divide-border/60">
            {boxesLoading && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading expected boxes...</div>
            )}
            {!boxesLoading && filteredBoxes.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No expected boxes yet.</div>
            )}
            {filteredBoxes.map(box => {
              const meta = STATUS_META[box.status];
              const StatusIcon = meta.icon;
              const supplierName = box.suppliers?.name || 'Unknown supplier';
              const isSelected = selectedBox?.id === box.id;
              return (
                <div ref={isSelected ? selectedItemRef : null} key={box.id} className={isSelected ? 'bg-primary/5' : 'bg-white'}>
                  <button
                    type="button"
                    className="grid w-full grid-cols-1 gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/20 lg:grid-cols-[150px_minmax(220px,1fr)_160px_130px_150px_140px] lg:items-center lg:gap-3"
                    onClick={() => setSelectedId(isSelected ? '' : box.id)}
                  >
                    <span className={`inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${meta.className}`}>
                      <StatusIcon className="h-3.5 w-3.5" /> {meta.label}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{box.tracking_number}</span>
                      <span className="block truncate text-xs text-muted-foreground">{box.carrier} - {box.last_carrier_event || 'Tracking saved'}</span>
                      {box.notes && <span className="block truncate text-xs font-medium text-primary">Note: {box.notes}</span>}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{supplierName}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{getMatchLabel(box.match_condition)}</span>
                    <span className="text-sm text-muted-foreground">{formatDateTime(box.carrier_delivered_at || box.carrier_eta) || 'Pending'}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatWarehouseReceived(box)}
                    </span>
                  </button>

                  {isSelected && (
                    <div className="border-t border-border/70 bg-muted/15 px-3 py-2">
                      <div className="flex flex-col gap-2 xl:flex-row xl:items-start">
                        <div className="grid flex-1 grid-cols-2 gap-1 md:grid-cols-5">
                          {[
                            ['Supplier', box.suppliers?.name || 'Unknown supplier'],
                            ['Match rule', getMatchLabel(box.match_condition)],
                            ['P.O', box.po_number || 'Not required'],
                            ['Carrier delivered', formatDateTime(box.carrier_delivered_at || box.carrier_eta) || 'Pending'],
                            ['Warehouse received', formatWarehouseReceived(box)],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className={`min-h-[38px] rounded border bg-white px-1.5 py-0.5 ${
                                label === 'Supplier' ? getDetailAccentClass(box.status) : 'border-border/70'
                              } ${
                                label === 'Supplier' ? 'flex flex-col' : ''
                              }`}
                            >
                              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
                              <p className={`truncate font-semibold leading-tight text-foreground ${label === 'Supplier' ? 'flex flex-1 items-center justify-center text-center text-base font-bold' : 'text-[11px]'}`}>{value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-3 gap-2 xl:w-[360px]">
                          <Button type="button" className="h-10 gap-2 rounded-lg px-3 text-sm" onClick={() => handleSyncTracking(box)} disabled={syncingList || syncingId === box.id}>
                            {syncingId === box.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Refresh
                          </Button>
                          <Button type="button" variant="outline" className="h-10 gap-2 rounded-lg bg-white px-3 text-sm" onClick={() => openEditExpectedBox(box)}>
                            <Pencil className="h-4 w-4" /> Edit
                          </Button>
                          <Button type="button" variant="destructive" className="h-10 gap-2 rounded-lg px-3 text-sm" onClick={() => handleDeleteExpectedBox(box)}>
                            <Trash2 className="h-4 w-4" /> Delete
                          </Button>
                        </div>
                      </div>

                      {box.notes && (
                        <div className="mt-2 rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Notes</p>
                          <p className="mt-1 text-sm font-medium leading-5 text-foreground">{box.notes}</p>
                        </div>
                      )}

                      <div className="mt-2 rounded-lg border border-border/70 bg-white p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Carrier events</p>
                          {(box.carrier_tracking_events || []).length > 0 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              Latest {(box.carrier_tracking_events || []).slice(0, 6).length}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 max-h-64 space-y-1.5 overflow-auto">
                          {(box.carrier_tracking_events || []).length === 0 && (
                            <p className="text-sm text-muted-foreground">No carrier scans saved yet.</p>
                          )}
                          {(box.carrier_tracking_events || []).slice(0, 6).map((event, index) => (
                            <div key={`${event.datetime || 'event'}-${index}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 rounded-md border border-border/60 bg-background px-2.5 py-2">
                              <div className="flex flex-col items-center pt-0.5">
                                <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-primary' : 'bg-muted-foreground/35'}`} />
                                {index < Math.min((box.carrier_tracking_events || []).length, 6) - 1 && (
                                  <span className="mt-1 h-full min-h-8 w-px bg-border" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                    {index === 0 ? 'Latest' : formatEventStatus(event.status)}
                                  </span>
                                  <span className="text-[11px] font-medium text-muted-foreground">{formatEventTime(event.datetime)}</span>
                                </div>
                                <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{event.message || 'Carrier update'}</p>
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.location || 'Location unavailable'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>}
    </div>
  );
}
