import { useMemo, useState } from 'react';
import { Edit, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAccountingCatalogs, useAccountingVendorMutations } from '@/hooks/useAccountingData';
import { normalizeText, paymentTermsLabel, vendorLocationAccountRows, type AccountingVendor } from '@/lib/accounting';
import { AccountingPageHeader, EmptyState, LoadingState } from './AccountingComponents';

type VendorForm = {
  account_number_mode: 'single' | 'by_location';
  account_number: string;
  address: string;
  contact_name: string;
  default_payment_method_id: string;
  email: string;
  locationAccounts: Array<{
    account_number: string;
    id: string;
    store_id: string;
    store_name: string;
  }>;
  name: string;
  notes: string;
  payment_terms_days: string;
  phone: string;
};

const EMPTY_VENDOR_FORM: VendorForm = {
  account_number_mode: 'single',
  account_number: '',
  address: '',
  contact_name: '',
  default_payment_method_id: 'none',
  email: '',
  locationAccounts: [],
  name: '',
  notes: '',
  payment_terms_days: '',
  phone: '',
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function createLocalId(prefix: string) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formFromVendor(vendor: AccountingVendor): VendorForm {
  const locationAccounts = vendorLocationAccountRows(vendor).map(row => ({
    account_number: row.account_number || '',
    id: createLocalId('vendor-location-account'),
    store_id: row.store_id || 'none',
    store_name: row.store_name || '',
  }));
  return {
    account_number_mode: locationAccounts.length ? 'by_location' : 'single',
    account_number: vendor.account_number || '',
    address: vendor.address || '',
    contact_name: vendor.contact_name || '',
    default_payment_method_id: vendor.default_payment_method_id || 'none',
    email: vendor.email || '',
    locationAccounts,
    name: vendor.name,
    notes: vendor.notes || '',
    payment_terms_days: vendor.payment_terms_days == null ? '' : String(vendor.payment_terms_days),
    phone: vendor.phone || '',
  };
}

function parseTermsDays(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 365) return undefined;
  return Math.round(parsed);
}

function VendorDialog({
  form,
  mode,
  onChange,
  onClose,
  onSave,
  open,
  saving,
}: {
  form: VendorForm;
  mode: 'create' | 'edit';
  onChange: (patch: Partial<VendorForm>) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  saving: boolean;
}) {
  const { data: catalogs } = useAccountingCatalogs();
  const stores = catalogs?.stores || [];
  const addLocationAccount = () => {
    const used = new Set(form.locationAccounts.map(row => row.store_id));
    const nextStore = stores.find(store => !used.has(store.id));
    onChange({
      locationAccounts: [
        ...form.locationAccounts,
        {
          account_number: '',
          id: createLocalId('vendor-location-account'),
          store_id: nextStore?.id || 'none',
          store_name: nextStore?.name || '',
        },
      ],
    });
  };
  const updateLocationAccount = (id: string, patch: Partial<VendorForm['locationAccounts'][number]>) => {
    onChange({
      locationAccounts: form.locationAccounts.map(row => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.store_id) {
          const store = stores.find(item => item.id === patch.store_id);
          next.store_name = patch.store_id === 'none' ? '' : store?.name || row.store_name;
        }
        return next;
      }),
    });
  };
  const removeLocationAccount = (id: string) => {
    onChange({ locationAccounts: form.locationAccounts.filter(row => row.id !== id) });
  };
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create vendor' : 'Edit vendor'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Vendor Name</Label>
            <Input value={form.name} onChange={event => onChange({ name: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Account number setup</Label>
            <Select
              value={form.account_number_mode}
              onValueChange={value => onChange({ account_number_mode: value as VendorForm['account_number_mode'] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">One account number</SelectItem>
                <SelectItem value="by_location">Different by store/location</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.account_number_mode === 'single' && (
            <div className="space-y-1.5 lg:col-span-2">
              <Label>Account Number</Label>
              <Input value={form.account_number} onChange={event => onChange({ account_number: event.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Contact Name</Label>
            <Input value={form.contact_name} onChange={event => onChange({ contact_name: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone Number</Label>
            <Input value={form.phone} onChange={event => onChange({ phone: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={event => onChange({ email: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Default Payment Method</Label>
            <Select
              value={form.default_payment_method_id}
              onValueChange={value => onChange({ default_payment_method_id: value })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                {catalogs?.paymentMethods.map(method => (
                  <SelectItem key={method.id} value={method.id}>{method.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment terms</Label>
            <Input
              inputMode="numeric"
              value={form.payment_terms_days}
              onChange={event => onChange({ payment_terms_days: event.target.value })}
              placeholder="30, 60, 90"
            />
            <div className="text-xs text-muted-foreground">
              {form.payment_terms_days.trim() ? paymentTermsLabel(form.payment_terms_days) : 'Used to calculate invoice due dates.'}
            </div>
          </div>
        </div>
        {form.account_number_mode === 'by_location' && (
          <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label>Account numbers by store/location</Label>
                <p className="text-xs text-muted-foreground">
                  Use this when the same vendor has a different account number per store or warehouse.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addLocationAccount} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add location
              </Button>
            </div>
            {form.locationAccounts.length ? (
              <div className="space-y-2">
                <div className="hidden grid-cols-[minmax(160px,0.8fr)_minmax(180px,1fr)_40px] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
                  <span>Store/location</span>
                  <span>Account number</span>
                  <span />
                </div>
                {form.locationAccounts.map(row => (
                  <div key={row.id} className="grid gap-2 md:grid-cols-[minmax(160px,0.8fr)_minmax(180px,1fr)_40px] md:items-center">
                    <Select value={row.store_id} onValueChange={value => updateLocationAccount(row.id, { store_id: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No location</SelectItem>
                        {stores.map(store => (
                          <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={row.account_number}
                      onChange={event => updateLocationAccount(row.id, { account_number: event.target.value })}
                      placeholder="Account number for this location"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLocationAccount(row.id)} aria-label="Remove location account">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-white px-3 py-4 text-center text-sm text-muted-foreground">
                No location account numbers yet.
              </div>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Address</Label>
          <Textarea value={form.address} onChange={event => onChange({ address: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={event => onChange({ notes: event.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !form.name.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save vendor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountingVendorsPage() {
  const { data, isLoading } = useAccountingCatalogs();
  const { createVendor, updateVendor } = useAccountingVendorMutations();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccountingVendor | null>(null);
  const [form, setForm] = useState<VendorForm>(EMPTY_VENDOR_FORM);

  const paymentMethods = data?.paymentMethods || [];

  const filtered = useMemo(() => {
    const vendors = data?.vendors || [];
    const query = normalizeText(search);
    if (!query) return vendors;
    return vendors.filter(vendor =>
      normalizeText([
        vendor.name,
        vendor.account_number,
        ...vendorLocationAccountRows(vendor).map(row => `${row.store_name || ''} ${row.account_number || ''}`),
        vendor.address,
        vendor.contact_name,
        vendor.phone,
        vendor.email,
        paymentTermsLabel(vendor.payment_terms_days),
        vendor.notes,
      ].filter(Boolean).join(' ')).includes(query)
    );
  }, [data?.vendors, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_VENDOR_FORM);
    setOpen(true);
  };

  const openEdit = (vendor: AccountingVendor) => {
    setEditing(vendor);
    setForm(formFromVendor(vendor));
    setOpen(true);
  };

  const save = async () => {
    const termsDays = parseTermsDays(form.payment_terms_days);
    if (termsDays === undefined) {
      toast.error('Payment terms must be a number between 0 and 365 days');
      return;
    }
    const locationAccountRows = form.account_number_mode === 'by_location'
      ? form.locationAccounts
          .map(row => ({
            account_number: row.account_number.trim(),
            store_id: row.store_id === 'none' ? null : row.store_id,
            store_name: row.store_name || null,
          }))
          .filter(row => row.account_number || row.store_id || row.store_name)
      : [];
    const payload = {
      account_number: form.account_number_mode === 'single' ? form.account_number || null : null,
      address: form.address || null,
      contact_name: form.contact_name || null,
      default_payment_method_id: form.default_payment_method_id === 'none' ? null : form.default_payment_method_id,
      email: form.email || null,
      name: form.name,
      notes: form.notes || null,
      payment_terms_days: termsDays,
      phone: form.phone || null,
      raw_payload: {
        ...(editing?.raw_payload || {}),
        vendor_account_number_mode: form.account_number_mode,
        vendor_location_account_rows: locationAccountRows,
      },
    };
    try {
      if (editing) {
        await updateVendor.mutateAsync({ id: editing.id, patch: payload });
        toast.success('Vendor updated');
      } else {
        await createVendor.mutateAsync(payload);
        toast.success('Vendor created');
      }
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Vendor save failed'));
    }
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Vendors"
        description="Create, edit, and search vendor profiles used by payment entry."
        actions={
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create vendor
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search vendors" className="max-w-xl" />
          {filtered.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Account #</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Default method</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(vendor => {
                  const method = paymentMethods.find(item => item.id === vendor.default_payment_method_id);
                  const locationRows = vendorLocationAccountRows(vendor);
                  return (
                    <TableRow key={vendor.id}>
                      <TableCell className="font-medium">{vendor.name}</TableCell>
                      <TableCell>
                        {locationRows.length ? (
                          <div className="space-y-1">
                            <Badge variant="secondary">{locationRows.length} locations</Badge>
                            <div className="max-w-[260px] text-xs text-muted-foreground">
                              {locationRows.slice(0, 2).map(row => `${row.store_name || 'Location'}: ${row.account_number || '-'}`).join(' | ')}
                              {locationRows.length > 2 ? ' ...' : ''}
                            </div>
                          </div>
                        ) : (
                          vendor.account_number || '-'
                        )}
                      </TableCell>
                      <TableCell>{vendor.contact_name || '-'}</TableCell>
                      <TableCell>{vendor.phone || '-'}</TableCell>
                      <TableCell>{vendor.email || '-'}</TableCell>
                      <TableCell>
                        {method ? <Badge variant="outline">{method.name}</Badge> : '-'}
                      </TableCell>
                      <TableCell>
                        {vendor.payment_terms_days == null ? '-' : <Badge variant="secondary">{paymentTermsLabel(vendor.payment_terms_days)}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(vendor)} aria-label="Edit vendor">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No vendors match the current search." />
          )}
        </CardContent>
      </Card>

      <VendorDialog
        form={form}
        mode={editing ? 'edit' : 'create'}
        onChange={patch => setForm(current => ({ ...current, ...patch }))}
        onClose={() => setOpen(false)}
        onSave={() => void save()}
        open={open}
        saving={createVendor.isPending || updateVendor.isPending}
      />
    </div>
  );
}
