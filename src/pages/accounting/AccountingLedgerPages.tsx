import { useMemo, useState } from 'react';
import { AlertTriangle, CreditCard, Edit, Image as ImageIcon, Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useAccountingAccountMutations,
  useAccountingCatalogs,
  useAccountingCreditCardPayments,
  useAccountingInvoicePayments,
  useAccountingPaymentMutations,
  useAccountingVendorMutations,
  useAccountingPersonalBills,
  useAccountingTruckViolations,
  createAccountingCheckPhotoUrl,
} from '@/hooks/useAccountingData';
import { normalizeText, type AccountingAccount, type AccountingInvoicePayment } from '@/lib/accounting';
import { AccountingPageHeader, EmptyState, LoadingState, MoneyText } from './AccountingComponents';

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Input
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder="Search records"
      className="max-w-xl"
    />
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function compactMultiLine(value: string | null | undefined) {
  return (value || '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .join(', ');
}

type SavedCheckSplitLine = {
  amount: string;
  check_number: string;
  confirmed_address: string;
  detected_address: string;
  ocr_status: string;
  photo_data_url: string;
  photo_name: string;
  photo_path: string;
  sent_to_address: string;
};

function checkSplitLinesFromPayment(payment: Pick<AccountingInvoicePayment, 'raw_payload'>): SavedCheckSplitLine[] {
  const rawPayload = payment.raw_payload && typeof payment.raw_payload === 'object' ? payment.raw_payload : {};
  const lines = (rawPayload as Record<string, unknown>).check_split_lines;
  if (!Array.isArray(lines)) return [];
  return lines
    .map(item => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        amount: String(row.amount || ''),
        check_number: String(row.check_number || ''),
        confirmed_address: String(row.confirmed_address || row.sent_to_address || ''),
        detected_address: String(row.detected_address || ''),
        ocr_status: String(row.ocr_status || ''),
        photo_data_url: String(row.photo_data_url || ''),
        photo_name: String(row.photo_name || ''),
        photo_path: String(row.photo_path || ''),
        sent_to_address: String(row.sent_to_address || ''),
      };
    })
    .filter(line => line.amount || line.check_number || line.confirmed_address || line.photo_data_url || line.photo_path);
}

function isCreditCardAccount(account: Pick<AccountingAccount, 'account_type' | 'name'>) {
  const normalizedType = normalizeText(account.account_type);
  const normalizedName = normalizeText(account.name);
  return normalizedType.includes('credit') || normalizedName.includes('credit card');
}

function accountLabel(account: Pick<AccountingAccount, 'brand' | 'last_four' | 'name'>) {
  const suffix = account.last_four ? ` ending ${account.last_four}` : '';
  return `${account.name}${suffix}${account.brand ? ` - ${account.brand}` : ''}`;
}

function useSearch<T>(rows: T[], query: string, fields: (row: T) => Array<string | null | undefined>) {
  return useMemo(() => {
    const needle = normalizeText(query);
    if (!needle) return rows;
    return rows.filter(row => normalizeText(fields(row).filter(Boolean).join(' ')).includes(needle));
  }, [fields, query, rows]);
}

type PaymentFormState = {
  account_id: string;
  account_number: string;
  amount_paid: string;
  category_id: string;
  check_number: string;
  invoiceInput: string;
  invoiceNumbers: string[];
  notes: string;
  payment_date: string;
  payment_method_kind: 'credit_card' | 'check';
  payment_method_id: string;
  reference_number: string;
  save_account_number: boolean;
  status: string;
  store_id: string;
  vendor_id: string;
};

const EMPTY_PAYMENT_FORM: PaymentFormState = {
  account_id: 'none',
  account_number: '',
  amount_paid: '',
  category_id: 'none',
  check_number: '',
  invoiceInput: '',
  invoiceNumbers: [],
  notes: '',
  payment_date: new Date().toISOString().slice(0, 10),
  payment_method_kind: 'check',
  payment_method_id: 'none',
  reference_number: '',
  save_account_number: true,
  status: 'Paid',
  store_id: 'none',
  vendor_id: 'none',
};

function paymentKindFromMethodName(name: string | null | undefined): PaymentFormState['payment_method_kind'] {
  const normalized = normalizeText(name);
  return normalized.includes('credit') || normalized.includes('card') ? 'credit_card' : 'check';
}

function methodIdForKind(
  kind: PaymentFormState['payment_method_kind'],
  methods: Array<{ id: string; name: string }>
) {
  const preferred = kind === 'credit_card' ? ['credit card', 'card'] : ['bank check', 'check'];
  return methods.find(method => preferred.some(label => normalizeText(method.name).includes(label)))?.id || 'none';
}

function paymentMethodLabel(kind: PaymentFormState['payment_method_kind']) {
  return kind === 'credit_card' ? 'Credit Card' : 'Check';
}

function CombinedPaymentDialog({
  form,
  onChange,
  onClose,
  onSave,
  open,
  saving,
}: {
  form: PaymentFormState;
  onChange: (patch: Partial<PaymentFormState>) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  saving: boolean;
}) {
  const { data: catalogs } = useAccountingCatalogs();
  const selectedVendor = catalogs?.vendors.find(vendor => vendor.id === form.vendor_id) || null;
  const activeAccounts = (catalogs?.accounts || []).filter(account => account.active !== false);
  const creditCards = activeAccounts.filter(isCreditCardAccount);
  const nonCardAccounts = activeAccounts.filter(account => !isCreditCardAccount(account));
  const accountOptions = form.payment_method_kind === 'credit_card'
    ? creditCards
    : nonCardAccounts.length
      ? nonCardAccounts
      : activeAccounts;
  const addInvoiceNumber = () => {
    const value = form.invoiceInput.trim();
    if (!value) return;
    if (form.invoiceNumbers.some(item => item.toLowerCase() === value.toLowerCase())) {
      onChange({ invoiceInput: '' });
      return;
    }
    onChange({ invoiceInput: '', invoiceNumbers: [...form.invoiceNumbers, value] });
  };
  const selectVendor = (vendorId: string) => {
    const vendor = catalogs?.vendors.find(item => item.id === vendorId);
    const defaultMethod = catalogs?.paymentMethods.find(item => item.id === vendor?.default_payment_method_id);
    const kind = paymentKindFromMethodName(defaultMethod?.name);
    const nextAccountOptions = kind === 'credit_card' ? creditCards : nonCardAccounts;
    const keepAccountId = nextAccountOptions.some(account => account.id === form.account_id);
    onChange({
      account_number: vendor?.account_number || '',
      account_id: keepAccountId ? form.account_id : 'none',
      payment_method_id: methodIdForKind(kind, catalogs?.paymentMethods || []),
      payment_method_kind: kind,
      vendor_id: vendorId,
    });
  };
  const selectPaymentKind = (kind: PaymentFormState['payment_method_kind']) => {
    const nextAccountOptions = kind === 'credit_card' ? creditCards : nonCardAccounts;
    const keepAccountId = nextAccountOptions.some(account => account.id === form.account_id);
    onChange({
      account_id: keepAccountId ? form.account_id : 'none',
      payment_method_id: methodIdForKind(kind, catalogs?.paymentMethods || []),
      payment_method_kind: kind,
    });
  };
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create combined payment row</DialogTitle>
          <DialogDescription>
            Record one paid row for one vendor with one or more invoice numbers.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px_220px]">
          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Select value={form.vendor_id} onValueChange={selectVendor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No vendor</SelectItem>
                {catalogs?.vendors.map(vendor => (
                  <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Store</Label>
            <Select value={form.store_id} onValueChange={value => onChange({ store_id: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No store</SelectItem>
                {catalogs?.stores.map(store => (
                  <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payment date</Label>
            <Input type="date" value={form.payment_date} onChange={event => onChange({ payment_date: event.target.value })} />
          </div>
        </div>

        {selectedVendor && (
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="grid gap-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">Account #</div>
                <div className="font-medium">{selectedVendor.account_number || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Contact</div>
                <div className="font-medium">{selectedVendor.contact_name || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Phone</div>
                <div className="font-medium">{selectedVendor.phone || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Email</div>
                <div className="font-medium">{selectedVendor.email || '-'}</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-2">
            <Label>Invoice Number</Label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
              <Input
                value={form.invoiceInput}
                onChange={event => onChange({ invoiceInput: event.target.value })}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addInvoiceNumber();
                  }
                }}
                placeholder="Type invoice number"
              />
              <Button type="button" variant="outline" onClick={addInvoiceNumber}>
                Add
              </Button>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Invoice Numbers Added</div>
              {form.invoiceNumbers.length ? (
                <div className="flex flex-wrap gap-2">
                  {form.invoiceNumbers.map(invoiceNumber => (
                    <Badge key={invoiceNumber} variant="secondary" className="gap-2 py-1.5">
                      {invoiceNumber}
                      <button
                        type="button"
                        className="rounded-sm px-1 text-xs hover:bg-background"
                        onClick={() => onChange({ invoiceNumbers: form.invoiceNumbers.filter(item => item !== invoiceNumber) })}
                      >
                        Remove
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-muted-foreground">No invoice numbers added yet.</div>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Total amount paid</Label>
              <Input inputMode="decimal" value={form.amount_paid} onChange={event => onChange({ amount_paid: event.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm font-semibold">Paid</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input value={form.account_number} onChange={event => onChange({ account_number: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={form.payment_method_kind === 'credit_card' ? 'default' : 'outline'}
                onClick={() => selectPaymentKind('credit_card')}
              >
                Credit Card
              </Button>
              <Button
                type="button"
                variant={form.payment_method_kind === 'check' ? 'default' : 'outline'}
                onClick={() => selectPaymentKind('check')}
              >
                Check
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{form.payment_method_kind === 'credit_card' ? 'Credit card used' : 'Bank/check account used'}</Label>
            <Select value={form.account_id} onValueChange={value => onChange({ account_id: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {form.payment_method_kind === 'credit_card' ? 'No credit card selected' : 'No account selected'}
                </SelectItem>
                {accountOptions.map(account => (
                  <SelectItem key={account.id} value={account.id}>{accountLabel(account)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {form.payment_method_kind === 'credit_card' && (
          <div className="rounded-lg border bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Credit cards on file</div>
                <div className="text-xs text-muted-foreground">Pick the card used for this paid invoice row.</div>
              </div>
              <Badge variant="outline">{creditCards.length}</Badge>
            </div>
            {creditCards.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {creditCards.map(account => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => onChange({ account_id: account.id })}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      form.account_id === account.id
                        ? 'border-primary bg-primary/8 text-primary'
                        : 'bg-background hover:border-primary/40'
                    }`}
                  >
                    <span className="block font-semibold">{account.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {account.brand || 'Card'}{account.last_four ? ` ending ${account.last_four}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
                No credit cards saved yet. Add them from Credit Card Payments.
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_220px]">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.category_id} onValueChange={value => onChange({ category_id: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {catalogs?.categories.map(category => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Check number(s)</Label>
            <Textarea value={form.check_number} onChange={event => onChange({ check_number: event.target.value })} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
            <Switch
              checked={form.save_account_number}
              onCheckedChange={checked => onChange({ save_account_number: checked })}
            />
            <Label>Save account # to vendor</Label>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reference / confirmation</Label>
            <Textarea
              value={form.reference_number}
              onChange={event => onChange({ reference_number: event.target.value })}
              placeholder="Optional confirmation or bank reference numbers"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={event => onChange({ notes: event.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !form.amount_paid.trim() || form.invoiceNumbers.length === 0} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save payment row
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccountingPaidInvoicesPage() {
  const { data = [], isLoading } = useAccountingInvoicePayments();
  const { data: catalogs } = useAccountingCatalogs();
  const { createInvoicePayment } = useAccountingPaymentMutations();
  const { updateVendor } = useAccountingVendorMutations();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<PaymentFormState>(EMPTY_PAYMENT_FORM);
  const [open, setOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{
    details: string;
    title: string;
    url: string;
  } | null>(null);
  const rows = useSearch(data, search, row => [
    row.accounting_vendors?.name,
    row.accounting_stores?.name,
    row.invoice_number,
    row.accounting_payment_methods?.name,
    row.accounting_accounts?.name,
    row.account_number,
    row.check_number,
    row.reference_number,
    row.notes,
  ]);

  if (isLoading) return <LoadingState />;

  const openCheckPhoto = async (line: SavedCheckSplitLine, payment: AccountingInvoicePayment) => {
    try {
      const url = line.photo_data_url || await createAccountingCheckPhotoUrl(line.photo_path);
      if (!url) {
        toast.error('No check photo saved for this check');
        return;
      }
      setPhotoPreview({
        details: [
          line.check_number ? `Check # ${line.check_number}` : null,
          line.amount ? `$${line.amount}` : null,
          line.confirmed_address ? `Sent to: ${line.confirmed_address.replace(/\s+/g, ' ')}` : null,
        ].filter(Boolean).join(' · '),
        title: `${payment.accounting_vendors?.name || 'Vendor'} check photo`,
        url,
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open check photo'));
    }
  };

  const createCombinedPayment = async () => {
    try {
      const vendorId = form.vendor_id === 'none' ? null : form.vendor_id;
      await createInvoicePayment.mutateAsync({
        account_id: form.account_id === 'none' ? null : form.account_id,
        account_number: form.account_number || null,
        amount_paid: form.amount_paid,
        category_id: form.category_id === 'none' ? null : form.category_id,
        check_number: form.check_number || null,
        invoice_number: form.invoiceNumbers.join('\n'),
        notes: form.notes || null,
        payment_date: form.payment_date || null,
        payment_method_id: form.payment_method_id === 'none' ? null : form.payment_method_id,
        reference_number: form.reference_number || null,
        status: 'Paid',
        store_id: form.store_id === 'none' ? null : form.store_id,
        vendor_id: vendorId,
      });
      const selectedVendor = catalogs?.vendors.find(vendor => vendor.id === vendorId);
      if (
        vendorId &&
        form.save_account_number &&
        form.account_number.trim() &&
        form.account_number.trim() !== (selectedVendor?.account_number || '')
      ) {
        await updateVendor.mutateAsync({
          id: vendorId,
          patch: {
            account_number: form.account_number.trim(),
            default_payment_method_id: form.payment_method_id === 'none' ? null : form.payment_method_id,
          },
        });
      }
      toast.success('Combined payment row created');
      setForm(EMPTY_PAYMENT_FORM);
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create payment row'));
    }
  };

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Paid invoices"
        description="Historical invoice payments imported from the Modern State workbook."
        actions={
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create payment
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4 p-4">
          <SearchBox value={search} onChange={setSearch} />
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Payment date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Account #</TableHead>
                  <TableHead>Account/card</TableHead>
                  <TableHead>Check/reference</TableHead>
                  <TableHead className="text-right">Amount paid</TableHead>
                  <TableHead>Related invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const checkLines = checkSplitLinesFromPayment(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.accounting_vendors?.name || '-'}</TableCell>
                      <TableCell>{row.accounting_stores?.name || '-'}</TableCell>
                      <TableCell className="max-w-[220px] whitespace-normal">{compactMultiLine(row.invoice_number) || '-'}</TableCell>
                      <TableCell>{row.payment_date || '-'}</TableCell>
                      <TableCell>{row.accounting_payment_methods?.name || row.status || '-'}</TableCell>
                      <TableCell>{row.account_number || '-'}</TableCell>
                      <TableCell>{row.accounting_accounts?.name || '-'}</TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal">
                        {checkLines.length ? (
                          <div className="space-y-1.5">
                            {checkLines.map((line, index) => (
                              <div key={`${row.id}-${index}`} className="rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium">{line.check_number || `Check ${index + 1}`}</span>
                                  {line.amount && <span><MoneyText value={line.amount} /></span>}
                                  {(line.photo_path || line.photo_data_url) && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => void openCheckPhoto(line, row)}
                                      className="h-7 gap-1 px-2"
                                    >
                                      <ImageIcon className="h-3.5 w-3.5" />
                                      Photo
                                    </Button>
                                  )}
                                </div>
                                {line.confirmed_address && (
                                  <div className="mt-1 text-muted-foreground">{line.confirmed_address}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          compactMultiLine(row.check_number || row.reference_number) || '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium"><MoneyText value={row.amount_paid} /></TableCell>
                      <TableCell>
                        {row.invoice_id ? <Badge variant="outline">Matched</Badge> : <Badge variant="secondary">Historical</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No paid invoice rows match the current search." />
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(photoPreview)} onOpenChange={value => !value && setPhotoPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{photoPreview?.title || 'Check photo'}</DialogTitle>
            {photoPreview?.details && (
              <DialogDescription>{photoPreview.details}</DialogDescription>
            )}
          </DialogHeader>
          {photoPreview?.url && (
            <img
              src={photoPreview.url}
              alt={photoPreview.title}
              className="max-h-[70vh] w-full rounded-lg border object-contain"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhotoPreview(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CombinedPaymentDialog
        form={form}
        onChange={patch => setForm(current => ({ ...current, ...patch }))}
        onClose={() => setOpen(false)}
        onSave={() => void createCombinedPayment()}
        open={open}
        saving={createInvoicePayment.isPending}
      />
    </div>
  );
}

type CreditCardFormState = {
  active: boolean;
  brand: string;
  id: string | null;
  last_four: string;
  name: string;
};

const EMPTY_CREDIT_CARD_FORM: CreditCardFormState = {
  active: true,
  brand: '',
  id: null,
  last_four: '',
  name: '',
};

function creditCardFormFromAccount(account: AccountingAccount): CreditCardFormState {
  return {
    active: account.active,
    brand: account.brand || '',
    id: account.id,
    last_four: account.last_four || '',
    name: account.name,
  };
}

function CreditCardDialog({
  form,
  onChange,
  onClose,
  onSave,
  open,
  saving,
}: {
  form: CreditCardFormState;
  onChange: (patch: Partial<CreditCardFormState>) => void;
  onClose: () => void;
  onSave: () => void;
  open: boolean;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit credit card' : 'Add credit card'}</DialogTitle>
          <DialogDescription>
            Save the card details used when entering paid invoice payments.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Card name</Label>
            <Input
              value={form.name}
              onChange={event => onChange({ name: event.target.value })}
              placeholder="TD Business 7627"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1.5">
              <Label>Brand / bank</Label>
              <Input
                value={form.brand}
                onChange={event => onChange({ brand: event.target.value })}
                placeholder="TD, Amex, Chase..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Last 4</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                value={form.last_four}
                onChange={event => onChange({ last_four: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="7627"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
            <Switch checked={form.active} onCheckedChange={checked => onChange({ active: checked })} />
            <Label>Active card</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !form.name.trim()} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccountingCreditCardPaymentsPage() {
  const { data = [], isLoading } = useAccountingCreditCardPayments();
  const { data: catalogs } = useAccountingCatalogs();
  const { createAccount, updateAccount } = useAccountingAccountMutations();
  const [search, setSearch] = useState('');
  const [cardOpen, setCardOpen] = useState(false);
  const [cardForm, setCardForm] = useState<CreditCardFormState>(EMPTY_CREDIT_CARD_FORM);
  const rows = useSearch(data, search, row => [row.accounting_accounts?.name, row.confirmation_number, row.status, row.notes]);
  const creditCards = useMemo(
    () => (catalogs?.accounts || []).filter(isCreditCardAccount),
    [catalogs?.accounts]
  );
  const savingCard = createAccount.isPending || updateAccount.isPending;

  if (isLoading) return <LoadingState />;

  const openNewCard = () => {
    setCardForm(EMPTY_CREDIT_CARD_FORM);
    setCardOpen(true);
  };

  const openEditCard = (account: AccountingAccount) => {
    setCardForm(creditCardFormFromAccount(account));
    setCardOpen(true);
  };

  const saveCard = async () => {
    const payload = {
      account_type: 'credit_card',
      active: cardForm.active,
      brand: cardForm.brand.trim() || null,
      last_four: cardForm.last_four.trim() || null,
      name: cardForm.name.trim(),
    };
    try {
      if (cardForm.id) {
        await updateAccount.mutateAsync({ id: cardForm.id, patch: payload });
        toast.success('Credit card updated');
      } else {
        await createAccount.mutateAsync(payload);
        toast.success('Credit card added');
      }
      setCardForm(EMPTY_CREDIT_CARD_FORM);
      setCardOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save credit card'));
    }
  };

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Credit card payments"
        description="Manage cards on file and review payments made to credit cards, bank accounts, or credit lines."
        actions={
          <Button onClick={openNewCard} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add credit card
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Credit cards on file
          </CardTitle>
        </CardHeader>
        <CardContent>
          {creditCards.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Brand / bank</TableHead>
                  <TableHead>Last 4</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditCards.map(card => (
                  <TableRow key={card.id}>
                    <TableCell className="font-medium">{card.name}</TableCell>
                    <TableCell>{card.brand || '-'}</TableCell>
                    <TableCell>{card.last_four || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={card.active ? 'default' : 'secondary'}>
                        {card.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditCard(card)} className="gap-1.5">
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No credit cards saved yet. Add one to use it when entering paid invoices." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <SearchBox value={search} onChange={setSearch} />
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account/card</TableHead>
                  <TableHead>Payment date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Confirmation/reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.accounting_accounts?.name || '-'}</TableCell>
                    <TableCell>{row.payment_date || '-'}</TableCell>
                    <TableCell className="text-right font-medium"><MoneyText value={row.amount} /></TableCell>
                    <TableCell>{row.confirmation_number || '-'}</TableCell>
                    <TableCell><Badge variant="outline">{row.status || 'Unknown'}</Badge></TableCell>
                    <TableCell>{row.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No credit card payments match the current search." />
          )}
        </CardContent>
      </Card>
      <CreditCardDialog
        form={cardForm}
        onChange={patch => setCardForm(current => ({ ...current, ...patch }))}
        onClose={() => setCardOpen(false)}
        onSave={() => void saveCard()}
        open={cardOpen}
        saving={savingCard}
      />
    </div>
  );
}

export function AccountingPersonalBillsPage() {
  const { data = [], isLoading } = useAccountingPersonalBills();
  const [search, setSearch] = useState('');
  const rows = useSearch(data, search, row => [row.bill_name, row.accounting_vendors?.name, row.payer, row.accounting_payment_methods?.name, row.status, row.notes]);

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Personal bills"
        description="Personal bills tracked from the Modern State workbook."
      />
      <Card>
        <CardContent className="space-y-4 p-4">
          <SearchBox value={search} onChange={setSearch} />
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill/vendor</TableHead>
                  <TableHead>Payer</TableHead>
                  <TableHead>Payment type</TableHead>
                  <TableHead>Payment date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.bill_name || row.accounting_vendors?.name || '-'}</TableCell>
                    <TableCell>{row.payer || '-'}</TableCell>
                    <TableCell>{row.accounting_payment_methods?.name || '-'}</TableCell>
                    <TableCell>{row.payment_date || '-'}</TableCell>
                    <TableCell className="text-right font-medium"><MoneyText value={row.amount} /></TableCell>
                    <TableCell><Badge variant="outline">{row.status || 'Unknown'}</Badge></TableCell>
                    <TableCell>{row.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No personal bills match the current search." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AccountingTruckPage() {
  const { data = [], isLoading } = useAccountingTruckViolations();
  const [search, setSearch] = useState('');
  const rows = useSearch(data, search, row => [row.violation_number, row.description, row.receipt_number, row.payment_method, row.notes]);

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Truck"
        description="Truck violations and possible duplicate infractions from the import."
      />
      <Card>
        <CardContent className="space-y-4 p-4">
          <SearchBox value={search} onChange={setSearch} />
          {rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Violation/ticket</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Receipt/reference</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Payment date</TableHead>
                  <TableHead>Warning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.violation_number || '-'}</TableCell>
                    <TableCell>{row.violation_date || '-'}</TableCell>
                    <TableCell>{row.description || '-'}</TableCell>
                    <TableCell className="text-right"><MoneyText value={row.amount} /></TableCell>
                    <TableCell>{row.receipt_number || row.payment_method || '-'}</TableCell>
                    <TableCell className="text-right"><MoneyText value={row.paid_amount} /></TableCell>
                    <TableCell>{row.payment_date || '-'}</TableCell>
                    <TableCell>
                      {row.is_possible_duplicate ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Duplicate
                        </Badge>
                      ) : (
                        <Badge variant="outline">Clear</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState label="No truck rows match the current search." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
