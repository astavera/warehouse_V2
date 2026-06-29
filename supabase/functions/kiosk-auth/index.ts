import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

type Employee = {
  id: string;
  name: string;
  passcode: string;
  active: boolean;
  auth_user_id: string | null;
  permissions: string[] | null;
  role: string;
  store_number: number | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const PASSCODE_EMPLOYEE_SUFFIX = ' Passcode';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function randomPassword() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function employeeEmail(employeeId: string) {
  return `${employeeId}@warehouse.localhost`;
}

function passcodeEmployeeName(employee: Employee) {
  return employee.name.endsWith(PASSCODE_EMPLOYEE_SUFFIX)
    ? employee.name
    : `${employee.name}${PASSCODE_EMPLOYEE_SUFFIX}`;
}

function publicEmployee(employee: Employee) {
  const { passcode: _passcode, ...safeEmployee } = employee;
  return safeEmployee;
}

function hasAccountingAccess(employee: Employee) {
  const permissions = Array.isArray(employee.permissions) ? employee.permissions : [];
  return (
    employee.role === 'accounting' ||
    permissions.includes('accounting') ||
    permissions.some(permission => permission.startsWith('accounting.'))
  );
}

function requiresPasswordLogin(employee: Employee) {
  if (employee.name.endsWith(PASSCODE_EMPLOYEE_SUFFIX)) return false;

  const permissions = Array.isArray(employee.permissions) ? employee.permissions : [];
  return employee.role === 'admin' || permissions.includes('settings') || hasAccountingAccess(employee);
}

function passcodePermissions(employee: Employee) {
  const permissions = Array.isArray(employee.permissions) ? employee.permissions : [];
  const allowed = permissions.filter(permission =>
    permission !== 'accounting' && !permission.startsWith('accounting.')
  );
  return allowed.length > 0 ? allowed : ['receiving'];
}

function isFourDigitPasscode(value: string | null | undefined) {
  return /^[0-9]{4}$/.test(value || '');
}

function passcodeSeed(value: string) {
  let seed = 0;
  for (const char of value) {
    seed = (seed * 31 + char.charCodeAt(0)) % 9000;
  }
  return seed;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error) {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'details', 'hint', 'code']) {
      if (typeof record[key] === 'string' && record[key]) return String(record[key]);
    }
    return JSON.stringify(error);
  }
  return String(error || 'Unknown auth error');
}

async function availableShadowPasscode(
  admin: ReturnType<typeof createClient>,
  sourceEmployee: Employee,
  shadow?: Employee
) {
  if (
    shadow &&
    isFourDigitPasscode(shadow.passcode) &&
    shadow.passcode !== sourceEmployee.passcode
  ) {
    const { data, error } = await admin
      .from('employees')
      .select('id')
      .eq('passcode', shadow.passcode)
      .limit(2);
    if (error) throw error;
    const owners = (data || []) as Array<{ id: string }>;
    if (owners.length === 0 || owners.every(row => row.id === shadow.id)) return shadow.passcode;
  }

  const seed = passcodeSeed(sourceEmployee.id);
  for (let attempt = 0; attempt < 9000; attempt += 1) {
    const candidate = String(1000 + ((seed + attempt) % 9000)).padStart(4, '0');
    if (candidate === sourceEmployee.passcode) continue;

    const { data, error } = await admin
      .from('employees')
      .select('id')
      .eq('passcode', candidate)
      .limit(1);
    if (error) throw error;
    const owner = ((data || []) as Array<{ id: string }>)[0];
    if (!owner || owner.id === shadow?.id) return candidate;
  }

  throw new Error('No available passcode for passcode-only access');
}

async function getOrCreatePasscodeEmployee(
  admin: ReturnType<typeof createClient>,
  employee: Employee
) {
  const name = passcodeEmployeeName(employee);
  const permissions = passcodePermissions(employee);

  const { data: existing, error: existingError } = await admin
    .from('employees')
    .select('id, name, passcode, active, auth_user_id, role, store_number, permissions')
    .eq('name', name)
    .eq('active', true)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const shadow = existing as Employee;
    const currentPermissions = Array.isArray(shadow.permissions) ? shadow.permissions : [];
    const internalPasscode = await availableShadowPasscode(admin, employee, shadow);
    const needsUpdate =
      shadow.passcode !== internalPasscode ||
      shadow.role !== 'warehouse' ||
      shadow.store_number !== null ||
      JSON.stringify([...currentPermissions].sort()) !== JSON.stringify([...permissions].sort());

    if (!needsUpdate) return shadow;

    const { data, error } = await admin
      .from('employees')
      .update({
        passcode: internalPasscode,
        role: 'warehouse',
        store_number: null,
        permissions,
      })
      .eq('id', shadow.id)
      .select('id, name, passcode, active, auth_user_id, role, store_number, permissions')
      .single();
    if (error) throw error;
    return data as Employee;
  }

  const internalPasscode = await availableShadowPasscode(admin, employee);
  const { data, error } = await admin
    .from('employees')
    .insert({
      name,
      passcode: internalPasscode,
      active: true,
      role: 'warehouse',
      store_number: null,
      permissions,
    })
    .select('id, name, passcode, active, auth_user_id, role, store_number, permissions')
    .single();
  if (error) throw error;
  return data as Employee;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown';
}

async function isRateLimited(admin: ReturnType<typeof createClient>, ipAddress: string, passcodeHash: string) {
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [ipAttempts, credentialAttempts] = await Promise.all([
    admin
      .from('kiosk_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .eq('success', false)
      .gte('created_at', windowStart),
    admin
      .from('kiosk_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .eq('passcode_hash', passcodeHash)
      .eq('success', false)
      .gte('created_at', windowStart),
  ]);

  if (ipAttempts.error) throw ipAttempts.error;
  if (credentialAttempts.error) throw credentialAttempts.error;
  return (ipAttempts.count || 0) >= 20 || (credentialAttempts.count || 0) >= 8;
}

async function recordLoginAttempt(
  admin: ReturnType<typeof createClient>,
  action: string,
  ipAddress: string,
  passcodeHash: string,
  success: boolean
) {
  await admin.from('kiosk_login_attempts').insert({
    action,
    ip_address: ipAddress,
    passcode_hash: passcodeHash,
    success,
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const adminPasscode = Deno.env.get('KIOSK_ADMIN_PASSCODE');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: 'Missing Supabase auth secrets' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = await req.json().catch(() => ({}));
    const action = typeof payload.action === 'string' ? payload.action : '';
    const passcode = typeof payload.passcode === 'string' ? payload.passcode.trim() : '';
    const requestedAdminPasscode = typeof payload.adminPasscode === 'string' ? payload.adminPasscode.trim() : '';
    const ipAddress = clientIp(req);

    if (!/^[0-9]{4}$/.test(passcode)) {
      return jsonResponse({ error: 'Passcode must be 4 digits' }, 400);
    }
    if (action !== 'sign-in' && action !== 'sign-up') {
      return jsonResponse({ error: 'Unsupported auth action' }, 400);
    }

    const passcodeHash = await sha256(
      action === 'sign-up'
        ? `admin:${requestedAdminPasscode || 'invalid'}`
        : `employee:${passcode || 'invalid'}`
    );
    if (await isRateLimited(admin, ipAddress, passcodeHash)) {
      return jsonResponse({ error: 'Too many attempts. Try again in 10 minutes.' }, 429);
    }

    let employee: Employee | null = null;

    if (action === 'sign-in') {
      const { data, error } = await admin
        .from('employees')
        .select('id, name, passcode, active, auth_user_id, role, store_number, permissions')
        .eq('passcode', passcode)
        .eq('active', true)
        .limit(20);
      if (error) throw error;
      const matches = (data || []) as Employee[];
      if (matches.length === 0) {
        await recordLoginAttempt(admin, action, ipAddress, passcodeHash, false);
        return jsonResponse({ error: 'Incorrect passcode' }, 401);
      }

      const passcodeEmployee = matches.find(row => !requiresPasswordLogin(row));
      employee = passcodeEmployee || await getOrCreatePasscodeEmployee(admin, matches[0]);
    } else if (action === 'sign-up') {
      if (!adminPasscode) return jsonResponse({ error: 'Admin passcode is not configured' }, 500);
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';

      if (requestedAdminPasscode !== adminPasscode) {
        await recordLoginAttempt(admin, action, ipAddress, passcodeHash, false);
        return jsonResponse({ error: 'Incorrect admin passcode' }, 401);
      }
      if (!name) return jsonResponse({ error: 'Employee name is required' }, 400);

      const { data: existingName, error: existingNameError } = await admin
        .from('employees')
        .select('id')
        .ilike('name', name)
        .maybeSingle();
      if (existingNameError) throw existingNameError;
      if (existingName) return jsonResponse({ error: 'That name is already registered' }, 409);

      const { data: existingPasscode, error: existingPasscodeError } = await admin
        .from('employees')
        .select('id')
        .eq('passcode', passcode)
        .maybeSingle();
      if (existingPasscodeError) throw existingPasscodeError;
      if (existingPasscode) return jsonResponse({ error: 'That passcode is already in use' }, 409);

      const { data, error } = await admin
        .from('employees')
        .insert({ name, passcode, active: true, role: 'warehouse', store_number: null, permissions: null })
        .select('id, name, passcode, active, auth_user_id, role, store_number, permissions')
        .single();
      if (error) throw error;
      employee = data as Employee;
    }

    const password = randomPassword();
    const email = employeeEmail(employee.id);
    let authUserId = employee.auth_user_id;

    if (authUserId) {
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_id: employee.id, employee_name: employee.name },
      });
      if (updateAuthError) throw updateAuthError;
    } else {
      const { data: authUser, error: createAuthError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_id: employee.id, employee_name: employee.name },
      });
      if (createAuthError) throw createAuthError;
      authUserId = authUser.user.id;

      const { error: employeeUpdateError } = await admin
        .from('employees')
        .update({ auth_user_id: authUserId })
        .eq('id', employee.id);
      if (employeeUpdateError) throw employeeUpdateError;
      employee.auth_user_id = authUserId;
    }

    const { data: sessionData, error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;
    await recordLoginAttempt(admin, action, ipAddress, passcodeHash, true);

    return jsonResponse({
      employee: publicEmployee({ ...employee, auth_user_id: authUserId }),
      session: sessionData.session,
    });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
});
