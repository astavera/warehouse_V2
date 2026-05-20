import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

type Employee = {
  id: string;
  name: string;
  passcode: string;
  active: boolean;
  auth_user_id: string | null;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function publicEmployee(employee: Employee) {
  const { passcode: _passcode, ...safeEmployee } = employee;
  return safeEmployee;
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

    if (!/^[0-9]{4}$/.test(passcode)) {
      return jsonResponse({ error: 'Passcode must be 4 digits' }, 400);
    }

    let employee: Employee | null = null;

    if (action === 'sign-in') {
      const { data, error } = await admin
        .from('employees')
        .select('id, name, passcode, active, auth_user_id')
        .eq('passcode', passcode)
        .eq('active', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonResponse({ error: 'Incorrect passcode' }, 401);
      employee = data as Employee;
    } else if (action === 'sign-up') {
      if (!adminPasscode) return jsonResponse({ error: 'Admin passcode is not configured' }, 500);
      const requestedAdminPasscode = typeof payload.adminPasscode === 'string' ? payload.adminPasscode.trim() : '';
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';

      if (requestedAdminPasscode !== adminPasscode) {
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
        .insert({ name, passcode, active: true })
        .select('id, name, passcode, active, auth_user_id')
        .single();
      if (error) throw error;
      employee = data as Employee;
    } else {
      return jsonResponse({ error: 'Unsupported auth action' }, 400);
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

    return jsonResponse({
      employee: publicEmployee({ ...employee, auth_user_id: authUserId }),
      session: sessionData.session,
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown auth error' }, 500);
  }
});
