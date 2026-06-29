export const PASSCODE_EMPLOYEE_SUFFIX = ' Passcode';

type NamedEmployee = {
  name?: string | null;
};

export function displayEmployeeName(name: string | null | undefined) {
  const value = (name || '').trim();
  return value.endsWith(PASSCODE_EMPLOYEE_SUFFIX)
    ? value.slice(0, -PASSCODE_EMPLOYEE_SUFFIX.length)
    : value;
}

export function isPasscodeShadowEmployee(employee: NamedEmployee | null | undefined) {
  return Boolean(employee?.name?.trim().endsWith(PASSCODE_EMPLOYEE_SUFFIX));
}
