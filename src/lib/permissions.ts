export type EmployeeRole = 'admin' | 'accounting' | 'warehouse' | 'store';
export type AppModule = 'receiving' | 'expected_boxes' | 'prices' | 'audit' | 'accounting' | 'settings';
export type AccountingPermission =
  | 'accounting.view'
  | 'accounting.manage'
  | 'accounting.import'
  | 'accounting.reports'
  | 'accounting.catalogs';

export const EMPLOYEE_ROLES: EmployeeRole[] = ['admin', 'accounting', 'warehouse', 'store'];
export const APP_MODULES: AppModule[] = ['receiving', 'expected_boxes', 'prices', 'audit', 'accounting', 'settings'];
export const ACCOUNTING_PERMISSIONS: AccountingPermission[] = [
  'accounting.view',
  'accounting.manage',
  'accounting.import',
  'accounting.reports',
  'accounting.catalogs',
];

type PermissionUser = {
  name?: string | null;
  permissions?: string[] | null;
  role?: string | null;
};

export function getEmployeeRole(user: PermissionUser | null | undefined): EmployeeRole {
  const role = user?.role;
  if (role === 'admin' || role === 'accounting' || role === 'warehouse' || role === 'store') {
    return role;
  }

  if ((user?.name || '').trim().toLowerCase() === 'sebastian') return 'admin';
  return 'warehouse';
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
