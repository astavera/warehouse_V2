import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { functionErrorMessage } from '@/lib/functionErrors';
import { createLocalEmployee, shouldUseLocalData, updateLocalEmployee } from '@/lib/localWarehouseData';
import type { AppModule, EmployeeRole } from '@/lib/permissions';

type Employee = Tables<'employees'>;

type EmployeeAdminPatch = {
  active?: boolean;
  name?: string;
  permissions?: AppModule[] | null;
  role?: EmployeeRole;
  store_number?: number | null;
};

async function invokeEmployeeAdmin<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('employee-admin', { body });
  if (error) {
    throw new Error(await functionErrorMessage(error, 'Employee admin function failed'));
  }
  return data as T;
}

export async function updateEmployeeAccess(employeeId: string, patch: EmployeeAdminPatch) {
  if (shouldUseLocalData()) {
    updateLocalEmployee(employeeId, patch);
    return { ok: true };
  }

  return invokeEmployeeAdmin<{ ok: boolean; employee: Employee }>({
    action: 'update',
    employeeId,
    patch,
  });
}

export async function createEmployeeAccess(input: {
  name: string;
  passcode: string;
  role: EmployeeRole;
  permissions: AppModule[] | null;
  storeNumber: number | null;
}) {
  if (shouldUseLocalData()) {
    const employee = createLocalEmployee({
      name: input.name,
      passcode: input.passcode,
      active: true,
      permissions: input.permissions,
      role: input.role,
      store_number: input.role === 'store' ? input.storeNumber : null,
    });
    return { ok: true, employee };
  }

  return invokeEmployeeAdmin<{ ok: boolean; employee: Employee }>({
    action: 'create',
    name: input.name,
    passcode: input.passcode,
    permissions: input.permissions,
    role: input.role,
    storeNumber: input.role === 'store' ? input.storeNumber : null,
  });
}
