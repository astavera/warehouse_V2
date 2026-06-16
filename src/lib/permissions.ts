export type EmployeeRole = 'admin' | 'accounting' | 'warehouse' | 'store';
export type AppModule = 'receiving' | 'expected_boxes' | 'prices' | 'audit' | 'accounting' | 'settings';
export type PricePermission = 'prices.use' | 'prices.manage';
export type AccountingPermission =
  | 'accounting.view'
  | 'accounting.manage'
  | 'accounting.import'
  | 'accounting.reports'
  | 'accounting.catalogs';

export const EMPLOYEE_ROLES: EmployeeRole[] = ['admin', 'accounting', 'warehouse', 'store'];
export const APP_MODULES: AppModule[] = ['receiving', 'expected_boxes', 'prices', 'audit', 'accounting', 'settings'];
export const SEBASTIAN_ADMIN_AUTH_USER_ID = 'e7bb5b60-b264-49b2-8358-81d0f3c37b09';
export const SEBASTIAN_ADMIN_EMPLOYEE_ID = '77f47458-3aa1-4fdb-a08a-8e7924671ec1';
export const LOCAL_SEBASTIAN_ADMIN_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000101';
export const ACCOUNTING_PERMISSIONS: AccountingPermission[] = [
  'accounting.view',
  'accounting.manage',
  'accounting.import',
  'accounting.reports',
  'accounting.catalogs',
];
const STORE_ROLE_ALIASES = new Set(['store', 'staff', 'store_staff', 'staff_store', 'store-staff', 'staff-store']);
const PRICE_STAFF_MODULES = new Set<AppModule>(['receiving', 'prices']);

type PermissionUser = {
  id?: string | null;
  auth_user_id?: string | null;
  name?: string | null;
  permissions?: string[] | null;
  role?: string | null;
};

export function isSebastianAdmin(user: PermissionUser | null | undefined) {
  return (
    user?.auth_user_id === SEBASTIAN_ADMIN_AUTH_USER_ID ||
    user?.id === SEBASTIAN_ADMIN_EMPLOYEE_ID ||
    user?.id === LOCAL_SEBASTIAN_ADMIN_EMPLOYEE_ID
  );
}

export function normalizeEmployeeRole(role: string | null | undefined): EmployeeRole {
  const value = (role || '').trim().toLowerCase();
  if (value === 'admin' || value === 'accounting' || value === 'warehouse') return value;
  if (STORE_ROLE_ALIASES.has(value)) return 'store';
  return 'warehouse';
}

export function getEmployeeRole(user: PermissionUser | null | undefined): EmployeeRole {
  if (isSebastianAdmin(user)) return 'admin';
  return normalizeEmployeeRole(user?.role);
}

export function isPriceStaffUser(user: PermissionUser | null | undefined) {
  if (!user || isSebastianAdmin(user)) return false;

  const role = normalizeEmployeeRole(user.role);
  if (role === 'store') return true;
  if (role !== 'warehouse') return false;

  const modules = user.permissions?.filter((module): module is AppModule =>
    APP_MODULES.includes(module as AppModule)
  );
  return Boolean(
    modules?.includes('prices') &&
    modules.every(module => PRICE_STAFF_MODULES.has(module))
  );
}

export function defaultModulesForRole(role: EmployeeRole): AppModule[] {
  if (role === 'admin') return ['receiving', 'expected_boxes', 'prices', 'audit', 'accounting', 'settings'];
  if (role === 'accounting') return ['receiving', 'expected_boxes', 'prices', 'audit', 'accounting'];
  if (role === 'warehouse') return ['receiving'];
  return ['prices'];
}

export function defaultAccountingPermissionsForRole(role: EmployeeRole): AccountingPermission[] {
  if (role === 'admin' || role === 'accounting') return [...ACCOUNTING_PERMISSIONS];
  return [];
}

export function getEffectiveModules(user: PermissionUser | null | undefined): AppModule[] {
  const role = getEmployeeRole(user);
  if (role === 'admin') return defaultModulesForRole(role);
  if (isPriceStaffUser(user)) return defaultModulesForRole('store');

  const custom = user?.permissions?.filter((module): module is AppModule =>
    APP_MODULES.includes(module as AppModule)
  );
  if (custom && custom.length > 0) return custom;

  const hasAccountingPermission = user?.permissions?.some(permission =>
    ACCOUNTING_PERMISSIONS.includes(permission as AccountingPermission)
  );
  if (hasAccountingPermission) return [...defaultModulesForRole(role), 'accounting'];

  return defaultModulesForRole(role);
}

export function canAccessModule(user: PermissionUser | null | undefined, module: AppModule) {
  return getEffectiveModules(user).includes(module);
}

export function canAccessPricePermission(
  user: PermissionUser | null | undefined,
  permission: PricePermission
) {
  if (!canAccessModule(user, 'prices')) return false;
  if (permission === 'prices.use') return true;
  return isSebastianAdmin(user);
}

export function getEffectiveAccountingPermissions(user: PermissionUser | null | undefined): AccountingPermission[] {
  const role = getEmployeeRole(user);
  if (role === 'admin' || role === 'accounting') return defaultAccountingPermissionsForRole(role);

  const permissions = user?.permissions?.filter((permission): permission is AccountingPermission =>
    ACCOUNTING_PERMISSIONS.includes(permission as AccountingPermission)
  );
  if (permissions?.length) return permissions;
  return canAccessModule(user, 'accounting') ? ['accounting.view'] : [];
}

export function canAccessAccountingPermission(
  user: PermissionUser | null | undefined,
  permission: AccountingPermission
) {
  return getEffectiveAccountingPermissions(user).includes(permission);
}

export function getDefaultLandingPath(user: PermissionUser | null | undefined) {
  if (isPriceStaffUser(user) && canAccessModule(user, 'prices')) return '/prices';
  if (getEmployeeRole(user) === 'accounting' && canAccessModule(user, 'accounting')) return '/accounting';
  if (canAccessModule(user, 'receiving')) return '/';
  if (canAccessModule(user, 'expected_boxes')) return '/expected-boxes';
  if (canAccessModule(user, 'accounting')) return '/accounting';
  if (canAccessModule(user, 'audit')) return '/inventory-audit';
  if (canAccessModule(user, 'prices')) return '/prices';
  if (canAccessModule(user, 'settings')) return '/settings';
  return '/login';
}

export function roleLabel(role: EmployeeRole) {
  if (role === 'admin') return 'Admin';
  if (role === 'accounting') return 'Accounting';
  if (role === 'warehouse') return 'Warehouse staff';
  return 'Store staff';
}

export function moduleLabel(module: AppModule) {
  if (module === 'receiving') return 'Receiving';
  if (module === 'expected_boxes') return 'Expected Boxes';
  if (module === 'prices') return 'Prices';
  if (module === 'audit') return 'Audit';
  if (module === 'accounting') return 'Accounting';
  return 'Settings';
}

export function accountingPermissionLabel(permission: AccountingPermission) {
  if (permission === 'accounting.view') return 'View';
  if (permission === 'accounting.manage') return 'Manage';
  if (permission === 'accounting.import') return 'Import';
  if (permission === 'accounting.reports') return 'Reports';
  return 'Catalogs';
}
