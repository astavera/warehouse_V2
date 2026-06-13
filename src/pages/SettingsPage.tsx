import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Edit, Loader2, Plus, RefreshCw, RotateCcw, Save, Search, Settings as SettingsIcon, Trash2, Upload, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { squarePrices, type VendorMappingStatus } from '@/hooks/useSquarePrices';
import { useEmployees } from '@/hooks/useSupabaseData';
import { createEmployeeAccess, deleteInactiveEmployeeAccess, updateEmployeeAccess } from '@/hooks/useEmployeeAdmin';
import {
  APP_MODULES,
  EMPLOYEE_ROLES,
  defaultModulesForRole,
  isSebastianAdmin,
  moduleLabel,
  normalizeEmployeeRole,
  type AppModule,
  type EmployeeRole,
  roleLabel,
} from '@/lib/permissions';
import { parseSquareVendorCatalogFile, type ParsedVendorCatalogFile } from '@/lib/squareVendorCatalogImport';
import type { Tables } from '@/integrations/supabase/types';

type Employee = Tables<'employees'>;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function cleanRole(role: string | null | undefined): EmployeeRole {
  return normalizeEmployeeRole(role);
}

function cleanModules(value: string[] | null | undefined, role: EmployeeRole): AppModule[] {
  if (role === 'store') return defaultModulesForRole(role);
  const modules = value?.filter((item): item is AppModule => APP_MODULES.includes(item as AppModule));
  return modules && modules.length > 0 ? modules : defaultModulesForRole(role);
}

function sameModules(a: AppModule[], b: AppModule[]) {
  return [...a].sort().join('|') === [...b].sort().join('|');
}

function toggleModule(modules: AppModule[], module: AppModule) {
  return modules.includes(module) ? modules.filter(item => item !== module) : [...modules, module];
}

function PermissionBadges({ modules }: { modules: AppModule[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {modules.map(module => (
        <Badge key={module} variant="outline" className="bg-white">
          {moduleLabel(module)}
        </Badge>
      ))}
    </div>
  );
}

function PermissionToggleGrid({
  disabled,
  modules,
  onChange,
}: {
  disabled?: boolean;
  modules: AppModule[];
  onChange: (modules: AppModule[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {APP_MODULES.map(module => {
        const checked = modules.includes(module);
        return (
          <div
            key={module}
            className="flex min-h-[58px] items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2"
          >
          <span>
            <span className="block text-sm font-medium">{moduleLabel(module)}</span>
            <span className="block text-xs text-muted-foreground">
              {module === 'receiving'
                ? 'Warehouse workflows'
                : module === 'expected_boxes'
                  ? 'Expected shipments'
                  : module === 'prices'
                    ? 'Store price changes'
                    : module === 'audit'
                      ? 'Inventory audit'
                      : module === 'accounting'
                        ? 'AP and financials'
                        : 'Users and access'}
            </span>
          </span>
            <Switch
              checked={checked}
              disabled={disabled}
              onCheckedChange={() => onChange(toggleModule(modules, module))}
            />
          </div>
        );
      })}
    </div>
  );
}

function formatStatusDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function VendorMappingSettings() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<VendorMappingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<
    (ParsedVendorCatalogFile & { imported: number; updatedProducts: number }) | null
  >(null);

  const refreshStatus = async () => {
    setLoading(true);
    try {
      setStatus(await squarePrices.vendorMappingStatus());
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load vendor mapping status'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const importCatalog = async (file: File) => {
    setImporting(true);
    try {
      const parsed = await parseSquareVendorCatalogFile(file);
      if (parsed.rows.length === 0) {
        toast.error('No Vendor Name rows found in that file.');
        return;
      }

      const result = await squarePrices.importVendorMappings(parsed.rows, file.name);
      if (!result.ok) throw new Error(result.error || 'Failed to import catalog vendors');

      setLastImport({
        ...parsed,
        imported: result.imported,
        updatedProducts: result.updatedProducts,
      });
      if (result.status) setStatus(result.status);
      else await refreshStatus();
      toast.success(`Imported ${result.imported} vendor mappings`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to import catalog vendors'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-5 w-5" />
          Square vendor mapping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xl font-bold">{status?.mappingCount ?? '-'}</div>
            <div className="text-xs text-muted-foreground">catalog mappings</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xl font-bold">{status?.unknownProducts ?? '-'}</div>
            <div className="text-xs text-muted-foreground">products without vendor</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xl font-bold text-amber-600">{status?.changedUnknownProducts ?? '-'}</div>
            <div className="text-xs text-muted-foreground">price changes without vendor</div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-sm font-semibold">{formatStatusDate(status?.lastImportAt)}</div>
            <div className="text-xs text-muted-foreground">last import</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Use Square catalog export columns: Vendor Name plus SKU, GTIN, UPC, or Barcode.
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void refreshStatus()} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={importing} className="gap-1.5">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import catalog
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void importCatalog(file);
            }}
          />
        </div>

        {lastImport && (
          <div className="rounded-lg border bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {lastImport.imported} mappings imported, {lastImport.updatedProducts} price rows updated.
            {lastImport.conflictRows > 0 ? ` ${lastImport.conflictRows} barcode conflicts overwritten.` : ''}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeeAccessCard({
  employee,
  onDeleted,
  onSaved,
}: {
  employee: Employee;
  onDeleted: () => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState<EmployeeRole>(cleanRole(employee.role));
  const [permissions, setPermissions] = useState<AppModule[]>(cleanModules(employee.permissions, cleanRole(employee.role)));
  const [storeNumber, setStoreNumber] = useState(employee.store_number ? String(employee.store_number) : '');
  const [active, setActive] = useState(employee.active);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedRole = cleanRole(employee.role);
  const savedPermissions = cleanModules(employee.permissions, savedRole);
  const effectivePermissions =
    role === 'admin' || role === 'store' ? defaultModulesForRole(role) : permissions;
  const isDirty =
    name !== employee.name ||
    role !== savedRole ||
    !sameModules(effectivePermissions, savedPermissions) ||
    active !== employee.active ||
    (storeNumber || '') !== (employee.store_number ? String(employee.store_number) : '');

  useEffect(() => {
    setName(employee.name);
    setRole(cleanRole(employee.role));
    setPermissions(cleanModules(employee.permissions, cleanRole(employee.role)));
    setStoreNumber(employee.store_number ? String(employee.store_number) : '');
    setActive(employee.active);
  }, [employee]);

  const handleRoleChange = (value: string) => {
    const nextRole = value as EmployeeRole;
    setRole(nextRole);
    setPermissions(defaultModulesForRole(nextRole));
    if (nextRole !== 'store') setStoreNumber('');
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateEmployeeAccess(employee.id, {
        name: name.trim(),
        permissions: effectivePermissions,
        role,
        active,
        store_number: role === 'store' && storeNumber ? Number(storeNumber) : null,
      });
      toast.success('User updated');
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update user'));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async () => {
    if (isSebastianAdmin(employee)) {
      toast.error('Sebastian admin user cannot be deleted');
      return;
    }

    const confirmed = window.confirm(`Delete user "${employee.name}"? This cannot be undone.`);
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteInactiveEmployeeAccess(employee.id);
      toast.success('User deleted');
      onDeleted();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete user'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">{employee.name}</h2>
              <Badge variant={employee.active ? 'default' : 'secondary'}>
                {employee.active ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant="outline">{roleLabel(savedRole)}</Badge>
              {employee.store_number && <Badge variant="secondary">Store {employee.store_number}</Badge>}
            </div>
            <PermissionBadges modules={savedPermissions} />
          </div>
          <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full gap-1.5 lg:w-auto">
            <Edit className="h-4 w-4" />
            Edit access
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void deleteUser()}
            disabled={deleting || isSebastianAdmin(employee)}
            className="w-full gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 lg:w-auto"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Edit access
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={event => setName(event.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label>Active user</Label>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label>Role preset</Label>
              <Select value={role} onValueChange={handleRoleChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_ROLES.map(item => (
                    <SelectItem key={item} value={item}>
                      {roleLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Store</Label>
              <Input
                value={storeNumber}
                onChange={event => setStoreNumber(event.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={role !== 'store'}
                placeholder={role === 'store' ? '72' : '-'}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Module access</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPermissions(defaultModulesForRole(role))}
                disabled={role === 'admin' || role === 'store'}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Role defaults
              </Button>
            </div>
            {role === 'admin' && (
              <p className="text-sm text-muted-foreground">
                Admin users always keep full access.
              </p>
            )}
            {role === 'store' && (
              <p className="text-sm text-muted-foreground">
                Store staff users only keep Prices access.
              </p>
            )}
            <PermissionToggleGrid
              disabled={role === 'admin' || role === 'store'}
              modules={effectivePermissions}
              onChange={setPermissions}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={save}
              disabled={
                !isDirty ||
                saving ||
                !name.trim() ||
                effectivePermissions.length === 0 ||
                (role === 'store' && !storeNumber)
              }
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function SettingsPage() {
  const { employees, loading, refetch } = useEmployees();
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [role, setRole] = useState<EmployeeRole>('warehouse');
  const [permissions, setPermissions] = useState<AppModule[]>(defaultModulesForRole('warehouse'));
  const [storeNumber, setStoreNumber] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<EmployeeRole | 'all'>('all');

  const counts = useMemo(() => {
    return employees.reduce<Record<EmployeeRole, number>>(
      (acc, employee) => {
        acc[cleanRole(employee.role)] += 1;
        return acc;
      },
      { admin: 0, accounting: 0, warehouse: 0, store: 0 }
    );
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter(employee => {
      if (roleFilter !== 'all' && cleanRole(employee.role) !== roleFilter) return false;
      if (!query) return true;
      const haystack = [
        employee.name,
        roleLabel(cleanRole(employee.role)),
        employee.store_number ? `store ${employee.store_number}` : '',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [employees, roleFilter, search]);

  const createUser = async () => {
    setCreating(true);
    try {
      const effectivePermissions =
        role === 'admin' || role === 'store' ? defaultModulesForRole(role) : permissions;
      await createEmployeeAccess({
        name: name.trim(),
        passcode,
        permissions: effectivePermissions,
        role,
        storeNumber: role === 'store' && storeNumber ? Number(storeNumber) : null,
      });
      setName('');
      setPasscode('');
      setRole('warehouse');
      setPermissions(defaultModulesForRole('warehouse'));
      setStoreNumber('');
      await refetch();
      toast.success('User created');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create user'));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20 text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <SettingsIcon className="h-6 w-6" />
          Settings
        </h1>
        <div className="flex flex-wrap gap-2">
          {EMPLOYEE_ROLES.map(item => (
            <Badge key={item} variant="secondary">
              {roleLabel(item)}: {counts[item]}
            </Badge>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create user</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_140px_180px_120px_120px] lg:items-end">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={event => setName(event.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Passcode</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={passcode}
                onChange={event => setPasscode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4 digits"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={value => {
                  const nextRole = value as EmployeeRole;
                  setRole(nextRole);
                  setPermissions(defaultModulesForRole(nextRole));
                  if (nextRole !== 'store') setStoreNumber('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_ROLES.map(item => (
                    <SelectItem key={item} value={item}>
                      {roleLabel(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Store</Label>
              <Input
                value={storeNumber}
                onChange={event => setStoreNumber(event.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={role !== 'store'}
                placeholder={role === 'store' ? '72' : '-'}
              />
            </div>
            <Button
              onClick={createUser}
              disabled={creating || !name.trim() || passcode.length !== 4 || permissions.length === 0 || (role === 'store' && !storeNumber)}
              className="gap-1.5"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Initial permissions</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPermissions(defaultModulesForRole(role))}
                disabled={role === 'admin' || role === 'store'}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Role defaults
              </Button>
            </div>
            <PermissionToggleGrid
              disabled={role === 'admin' || role === 'store'}
              modules={role === 'admin' || role === 'store' ? defaultModulesForRole(role) : permissions}
              onChange={setPermissions}
            />
          </div>
        </CardContent>
      </Card>

      <VendorMappingSettings />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Existing users</h2>
            <p className="text-sm text-muted-foreground">{filteredEmployees.length} of {employees.length} users shown</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_190px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search users"
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={value => setRoleFilter(value as EmployeeRole | 'all')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {EMPLOYEE_ROLES.map(item => (
                  <SelectItem key={item} value={item}>
                    {roleLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3">
          {filteredEmployees.map(employee => (
            <EmployeeAccessCard key={employee.id} employee={employee} onDeleted={refetch} onSaved={refetch} />
          ))}
          {filteredEmployees.length === 0 && (
            <div className="rounded-lg border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              No users match the current filters.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
