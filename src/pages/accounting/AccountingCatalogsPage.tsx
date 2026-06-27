import { useMemo, useState } from 'react';
import { CreditCard, Loader2, Pencil, Plus, Store, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAccountingAccountMutations,
  useAccountingCatalogs,
  useAccountingCategoryMutations,
  useAccountingPaymentMethodMutations,
  useAccountingStoreMutations,
} from '@/hooks/useAccountingData';
import { normalizeText, type AccountingAccount, type AccountingCategory, type AccountingPaymentMethod, type AccountingStore } from '@/lib/accounting';
import { AccountingPageHeader, EmptyState, LoadingState } from './AccountingComponents';

type EditableCatalog = 'stores' | 'accounts' | 'methods' | 'categories';
type CatalogTab = EditableCatalog;
type CatalogRow = Record<string, unknown> & {
  id: string;
  name: string;
  normalized_name: string;
  updated_at?: string;
  accounting_stores?: Pick<AccountingStore, 'id' | 'name' | 'normalized_name'> | null;
};

const NO_STORE = 'none';

type StoreFormState = { id?: string; name: string };
type CategoryFormState = { id?: string; name: string };
type PaymentMethodFormState = { id?: string; name: string };
type AccountFormState = {
  account_type: string;
  active: boolean;
  brand: string;
  id?: string;
  last_four: string;
  name: string;
  store_id: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function catalogSingular(kind: EditableCatalog) {
  if (kind === 'accounts') return 'account';
  if (kind === 'categories') return 'category';
  if (kind === 'methods') return 'payment method';
  return 'store';
}

function rowSearchText(row: CatalogRow) {
  return [
    row.name,
    row.normalized_name,
    row.account_type,
    row.brand,
    row.last_four,
    row.source,
    row.accounting_stores?.name,
  ]
    .filter(Boolean)
    .join(' ');
}

function CatalogTable({
  onEdit,
  rows,
  search,
  type,
}: {
  onEdit?: (row: CatalogRow) => void;
  rows: CatalogRow[];
  search: string;
  type: CatalogTab;
}) {
  const filtered = useMemo(() => {
    const query = normalizeText(search);
    if (!query) return rows;
    return rows.filter(row => normalizeText(rowSearchText(row)).includes(query));
  }, [rows, search]);

  if (!filtered.length) return <EmptyState label="No catalog rows match the current search." />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          {type === 'accounts' && <TableHead>Store</TableHead>}
          {type === 'accounts' && <TableHead>Type</TableHead>}
          {type === 'accounts' && <TableHead>Brand</TableHead>}
          {type === 'accounts' && <TableHead>Last four</TableHead>}
          {type === 'accounts' && <TableHead>Status</TableHead>}
          <TableHead>Updated</TableHead>
          {onEdit && <TableHead className="w-[80px] text-right">Edit</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map(row => (
          <TableRow key={row.id}>
            <TableCell>
              <div className="font-medium">{row.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{row.normalized_name}</div>
            </TableCell>
            {type === 'accounts' && <TableCell>{row.accounting_stores?.name || '-'}</TableCell>}
            {type === 'accounts' && <TableCell><Badge variant="outline">{String(row.account_type || 'account')}</Badge></TableCell>}
            {type === 'accounts' && <TableCell>{String(row.brand || '-')}</TableCell>}
            {type === 'accounts' && <TableCell>{String(row.last_four || '-')}</TableCell>}
            {type === 'accounts' && (
              <TableCell>
                <Badge variant={row.active === false ? 'secondary' : 'outline'}>{row.active === false ? 'Inactive' : 'Active'}</Badge>
              </TableCell>
            )}
            <TableCell>{row.updated_at ? new Date(String(row.updated_at)).toLocaleDateString('en-US') : '-'}</TableCell>
            {onEdit && (
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => onEdit(row)}>
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">Edit {row.name}</span>
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function storeFormFromRow(row?: Partial<AccountingStore>): StoreFormState {
  return {
    id: row?.id,
    name: row?.name || '',
  };
}

function categoryFormFromRow(row?: Partial<AccountingCategory>): CategoryFormState {
  return {
    id: row?.id,
    name: row?.name || '',
  };
}

function paymentMethodFormFromRow(row?: Partial<AccountingPaymentMethod>): PaymentMethodFormState {
  return {
    id: row?.id,
    name: row?.name || '',
  };
}

function accountFormFromRow(row?: Partial<AccountingAccount>): AccountFormState {
  return {
    account_type: row?.account_type || 'credit_card',
    active: row?.active ?? true,
    brand: row?.brand || '',
    id: row?.id,
    last_four: row?.last_four || '',
    name: row?.name || '',
    store_id: row?.store_id || NO_STORE,
  };
}

export default function AccountingCatalogsPage() {
  const { data, isLoading } = useAccountingCatalogs();
  const { createAccount, updateAccount } = useAccountingAccountMutations();
  const { createCategory, updateCategory } = useAccountingCategoryMutations();
  const { createPaymentMethod, updatePaymentMethod } = useAccountingPaymentMethodMutations();
  const { createStore, updateStore } = useAccountingStoreMutations();
  const [activeTab, setActiveTab] = useState<CatalogTab>('stores');
  const [editor, setEditor] = useState<{ kind: EditableCatalog; mode: 'create' | 'edit' } | null>(null);
  const [search, setSearch] = useState('');
  const [storeForm, setStoreForm] = useState<StoreFormState>(() => storeFormFromRow());
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(() => categoryFormFromRow());
  const [paymentMethodForm, setPaymentMethodForm] = useState<PaymentMethodFormState>(() => paymentMethodFormFromRow());
  const [accountForm, setAccountForm] = useState<AccountFormState>(() => accountFormFromRow());

  if (isLoading) return <LoadingState />;

  const stores = data?.stores || [];
  const isSaving =
    createStore.isPending ||
    updateStore.isPending ||
    createAccount.isPending ||
    updateAccount.isPending ||
    createCategory.isPending ||
    updateCategory.isPending ||
    createPaymentMethod.isPending ||
    updatePaymentMethod.isPending;

  const openCreate = (kind: EditableCatalog) => {
    if (kind === 'stores') setStoreForm(storeFormFromRow());
    if (kind === 'accounts') setAccountForm(accountFormFromRow());
    if (kind === 'methods') setPaymentMethodForm(paymentMethodFormFromRow());
    if (kind === 'categories') setCategoryForm(categoryFormFromRow());
    setEditor({ kind, mode: 'create' });
  };

  const openEdit = (kind: EditableCatalog, row: CatalogRow) => {
    if (kind === 'stores') setStoreForm(storeFormFromRow(row as AccountingStore));
    if (kind === 'accounts') setAccountForm(accountFormFromRow(row as AccountingAccount));
    if (kind === 'methods') setPaymentMethodForm(paymentMethodFormFromRow(row as AccountingPaymentMethod));
    if (kind === 'categories') setCategoryForm(categoryFormFromRow(row as AccountingCategory));
    setEditor({ kind, mode: 'edit' });
  };

  const closeEditor = () => {
    if (!isSaving) setEditor(null);
  };

  const saveEditor = async () => {
    if (!editor) return;
    try {
      if (editor.kind === 'stores') {
        if (storeForm.id) {
          await updateStore.mutateAsync({ id: storeForm.id, patch: { name: storeForm.name } });
          toast.success('Store updated');
        } else {
          await createStore.mutateAsync({ name: storeForm.name });
          toast.success('Store created');
        }
      }
      if (editor.kind === 'accounts') {
        const payload = {
          account_type: accountForm.account_type,
          active: accountForm.active,
          brand: accountForm.brand || null,
          last_four: accountForm.last_four || null,
          name: accountForm.name,
          store_id: accountForm.store_id === NO_STORE ? null : accountForm.store_id,
        };
        if (accountForm.id) {
          await updateAccount.mutateAsync({ id: accountForm.id, patch: payload });
          toast.success('Account updated');
        } else {
          await createAccount.mutateAsync(payload);
          toast.success('Account created');
        }
      }
      if (editor.kind === 'methods') {
        if (paymentMethodForm.id) {
          await updatePaymentMethod.mutateAsync({ id: paymentMethodForm.id, patch: { name: paymentMethodForm.name } });
          toast.success('Payment method updated');
        } else {
          await createPaymentMethod.mutateAsync({ name: paymentMethodForm.name });
          toast.success('Payment method created');
        }
      }
      if (editor.kind === 'categories') {
        if (categoryForm.id) {
          await updateCategory.mutateAsync({ id: categoryForm.id, patch: { name: categoryForm.name } });
          toast.success('Category updated');
        } else {
          await createCategory.mutateAsync({ name: categoryForm.name });
          toast.success('Category created');
        }
      }
      setEditor(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Catalog save failed'));
    }
  };

  const activeEditable = activeTab;

  return (
    <div className="space-y-6">
      <AccountingPageHeader
        title="Catalogs"
        description="Manage stores, accounts/cards, payment methods, and categories."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{stores.length}</div><div className="text-xs text-muted-foreground">stores</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{data?.accounts.length || 0}</div><div className="text-xs text-muted-foreground">accounts/cards</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{data?.paymentMethods.length || 0}</div><div className="text-xs text-muted-foreground">payment methods</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{data?.categories.length || 0}</div><div className="text-xs text-muted-foreground">categories</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base">Catalog records</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search catalogs" className="sm:w-[320px]" />
              {activeEditable && (
                <Button onClick={() => openCreate(activeEditable)} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add {catalogSingular(activeEditable)}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={activeTab} onValueChange={value => setActiveTab(value as CatalogTab)}>
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              <TabsTrigger className="min-h-9 rounded-lg px-3" value="stores">Stores</TabsTrigger>
              <TabsTrigger className="min-h-9 rounded-lg px-3" value="accounts">Accounts</TabsTrigger>
              <TabsTrigger className="min-h-9 rounded-lg px-3" value="methods">Payment methods</TabsTrigger>
              <TabsTrigger className="min-h-9 rounded-lg px-3" value="categories">Categories</TabsTrigger>
            </TabsList>
            <TabsContent value="stores">
              <CatalogTable rows={(data?.stores || []) as CatalogRow[]} search={search} type="stores" onEdit={row => openEdit('stores', row)} />
            </TabsContent>
            <TabsContent value="accounts">
              <CatalogTable rows={(data?.accounts || []) as CatalogRow[]} search={search} type="accounts" onEdit={row => openEdit('accounts', row)} />
            </TabsContent>
            <TabsContent value="methods">
              <CatalogTable rows={(data?.paymentMethods || []) as CatalogRow[]} search={search} type="methods" onEdit={row => openEdit('methods', row)} />
            </TabsContent>
            <TabsContent value="categories">
              <CatalogTable rows={(data?.categories || []) as CatalogRow[]} search={search} type="categories" onEdit={row => openEdit('categories', row)} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!editor} onOpenChange={open => !open && closeEditor()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editor?.kind === 'stores' && <Store className="h-4 w-4 text-primary" />}
              {editor?.kind === 'accounts' && <CreditCard className="h-4 w-4 text-primary" />}
              {editor?.kind === 'methods' && <CreditCard className="h-4 w-4 text-primary" />}
              {editor?.kind === 'categories' && <Tags className="h-4 w-4 text-primary" />}
              {editor?.mode === 'edit' ? 'Edit' : 'Add'} {editor ? catalogSingular(editor.kind) : 'catalog'}
            </DialogTitle>
            <DialogDescription>
              {editor?.kind === 'accounts'
                ? 'Assign each account/card to the store it belongs to when applicable.'
                : 'Keep catalog names clean so invoices and reports stay consistent.'}
            </DialogDescription>
          </DialogHeader>

          {editor?.kind === 'stores' && (
            <div className="space-y-2">
              <Label htmlFor="catalog-store-name">Store name</Label>
              <Input id="catalog-store-name" value={storeForm.name} onChange={event => setStoreForm(form => ({ ...form, name: event.target.value }))} autoFocus />
            </div>
          )}

          {editor?.kind === 'categories' && (
            <div className="space-y-2">
              <Label htmlFor="catalog-category-name">Category name</Label>
              <Input id="catalog-category-name" value={categoryForm.name} onChange={event => setCategoryForm(form => ({ ...form, name: event.target.value }))} autoFocus />
            </div>
          )}

          {editor?.kind === 'methods' && (
            <div className="space-y-2">
              <Label htmlFor="catalog-method-name">Payment method name</Label>
              <Input id="catalog-method-name" value={paymentMethodForm.name} onChange={event => setPaymentMethodForm(form => ({ ...form, name: event.target.value }))} autoFocus />
            </div>
          )}

          {editor?.kind === 'accounts' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="catalog-account-name">Account name</Label>
                <Input id="catalog-account-name" value={accountForm.name} onChange={event => setAccountForm(form => ({ ...form, name: event.target.value }))} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-account-store">Linked store</Label>
                <Select value={accountForm.store_id} onValueChange={value => setAccountForm(form => ({ ...form, store_id: value }))}>
                  <SelectTrigger id="catalog-account-store"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STORE}>No store</SelectItem>
                    {stores.map(storeRow => (
                      <SelectItem key={storeRow.id} value={storeRow.id}>{storeRow.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-account-type">Type</Label>
                <Select value={accountForm.account_type} onValueChange={value => setAccountForm(form => ({ ...form, account_type: value }))}>
                  <SelectTrigger id="catalog-account-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit_card">Credit card</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-account-brand">Brand / bank</Label>
                <Input id="catalog-account-brand" value={accountForm.brand} onChange={event => setAccountForm(form => ({ ...form, brand: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-account-last-four">Last four</Label>
                <Input id="catalog-account-last-four" value={accountForm.last_four} onChange={event => setAccountForm(form => ({ ...form, last_four: event.target.value }))} maxLength={8} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                <div>
                  <Label htmlFor="catalog-account-active">Active</Label>
                  <div className="text-xs text-muted-foreground">Inactive accounts stay visible for history.</div>
                </div>
                <Switch id="catalog-account-active" checked={accountForm.active} onCheckedChange={checked => setAccountForm(form => ({ ...form, active: checked }))} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEditor} disabled={isSaving}>Cancel</Button>
            <Button onClick={() => void saveEditor()} disabled={isSaving} className="gap-1.5">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
