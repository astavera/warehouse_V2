import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLES = new Set(['admin', 'accounting', 'warehouse', 'store']);
const PERMISSIONS = new Set([
  'receiving',
  'expected_boxes',
  'prices',
  'audit',
  'accounting',
  'settings',
  'accounting.view',
  'accounting.manage',
  'accounting.import',
  'accounting.reports',
  'accounting.catalogs',
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAdminEmployee(employee: { name?: string | null; role?: string | null }) {
  return employee.role === 'admin' || (employee.name || '').trim().toLowerCase() === 'sebastian';
}

function cleanStoreNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Store number must be a positive number');
  return n;
}

function cleanRole(value: unknown) {
  const role = typeof value === 'string' ? value : '';
  if (!ROLES.has(role)) throw new Error('Invalid role');
  return role;
}

function cleanPermissions(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) throw new Error('Permissions must be an array');
  const unique = [...new Set(value.map(item => String(item)))];
  for (const permission of unique) {
    if (!PERMISSIONS.has(permission)) throw new Error(`Invalid permission: ${permission}`);
  }
  return unique;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: 'Missing Supabase secrets' }, 500);
    }

    const authorization = req.headers.get('authorization') || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      return jsonResponse({ error: 'Your secure session expired. Please sign out and sign in again.' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return jsonResponse({ error: 'Your secure session expired. Please sign out and sign in again.' }, 401);
    }

    const { data: actor, error: actorError } = await admin
      .from('employees')
      .select('id, name, role')
      .eq('auth_user_id', authData.user.id)
      .eq('active', true)
      .maybeSingle();
    if (actorError) throw actorError;
    if (!actor || !isAdminEmployee(actor)) return jsonResponse({ error: 'Admin access required' }, 403);

    const payload = await req.json().catch(() => ({}));
    const action = typeof payload.action === 'string' ? payload.action : '';

    if (action === 'create') {
      const name = typeof payload.name === 'string' ? payload.name.trim() : '';
      const passcode = typeof payload.passcode === 'string' ? payload.passcode.trim() : '';
      const role = cleanRole(payload.role || 'warehouse');
      const storeNumber = role === 'store' ? cleanStoreNumber(payload.storeNumber) : null;
      const permissions = cleanPermissions(payload.permissions);

      if (!name) return jsonResponse({ error: 'Name is required' }, 400);
      if (!/^[0-9]{4}$/.test(passcode)) return jsonResponse({ error: 'Passcode must be 4 digits' }, 400);

      const { data: existingPasscode, error: passcodeError } = await admin
        .from('employees')
        .select('id')
        .eq('passcode', passcode)
        .maybeSingle();
      if (passcodeError) throw passcodeError;
      if (existingPasscode) return jsonResponse({ error: 'That passcode is already in use' }, 409);

      const { data, error } = await admin
        .from('employees')
        .insert({
          name,
          passcode,
          active: true,
          permissions,
          role,
          store_number: storeNumber,
        })
        .select('id, name, active, created_at, updated_at, auth_user_id, role, store_number, permissions')
        .single();
      if (error) throw error;
      return jsonResponse({ ok: true, employee: data });
    }

    if (action === 'update') {
      const employeeId = typeof payload.employeeId === 'string' ? payload.employeeId : '';
      if (!employeeId) return jsonResponse({ error: 'Employee id is required' }, 400);

      const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch as Record<string, unknown> : {};
      const updates: Record<string, unknown> = {};
      if ('name' in patch) {
        const name = typeof patch.name === 'string' ? patch.name.trim() : '';
        if (!name) return jsonResponse({ error: 'Name is required' }, 400);
        updates.name = name;
      }
      if ('active' in patch) updates.active = Boolean(patch.active);
      if ('permissions' in patch) updates.permissions = cleanPermissions(patch.permissions);
      if ('role' in patch) updates.role = cleanRole(patch.role);
      if ('store_number' in patch || 'storeNumber' in patch) {
        updates.store_number = cleanStoreNumber(patch.store_number ?? patch.storeNumber);
      }
      if (updates.role && updates.role !== 'store') updates.store_number = null;
      if (Object.keys(updates).length === 0) return jsonResponse({ error: 'Nothing to update' }, 400);

      if (employeeId === actor.id && updates.role && updates.role !== 'admin') {
        return jsonResponse({ error: 'You cannot remove your own admin role' }, 400);
      }
      if (employeeId === actor.id && updates.active === false) {
        return jsonResponse({ error: 'You cannot deactivate yourself' }, 400);
      }

      const { data, error } = await admin
        .from('employees')
        .update(updates)
        .eq('id', employeeId)
        .select('id, name, active, created_at, updated_at, auth_user_id, role, store_number, permissions')
        .single();
      if (error) throw error;
      return jsonResponse({ ok: true, employee: data });
    }

    return jsonResponse({ error: `Unsupported action: ${action || '(empty)'}` }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown employee admin error' }, 500);
  }
});
