import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type { Session } from '@supabase/supabase-js';
import { functionErrorMessage } from '@/lib/functionErrors';
import { listLocalEmployees } from '@/lib/localWarehouseData';
import { canAccessModule } from '@/lib/permissions';
import { clearStoredSupabaseAuthTokens, isInvalidRefreshTokenError } from '@/lib/supabaseAuth';

type Employee = Tables<'employees'>;
type PublicEmployee = Omit<Employee, 'passcode'> & { auth_user_id?: string | null };
type KioskAuthResponse = {
  employee: PublicEmployee;
  session: Session;
};

interface AuthCtx {
  user: PublicEmployee | null;
  loading: boolean;
  beginSignIn: (passcode: string) => Promise<PublicEmployee>;
  beginAdminSignIn: (email: string, password: string) => Promise<PublicEmployee>;
  sendPasswordReset: (email: string) => Promise<void>;
  beginSignUp: (name: string, passcode: string, adminPasscode: string) => Promise<PublicEmployee>;
  completeSignIn: (user: PublicEmployee) => void;
  signOut: () => Promise<void>;
}

const STORAGE_KEY = 'warehouse-kiosk-user-id';
const USER_STORAGE_KEY = 'warehouse-kiosk-user';
const EMPLOYEE_SELECT = 'id, name, active, created_at, updated_at, auth_user_id, role, store_number, permissions';
const MOCK_LOCAL = import.meta.env.VITE_MOCK_LOCAL === 'true';
const MOCK_ADMIN_EMAIL = import.meta.env.VITE_MOCK_ADMIN_EMAIL || 'admin@allzentro.local';
const MOCK_ADMIN_PASSWORD = import.meta.env.VITE_MOCK_ADMIN_PASSWORD || 'admin1234';
const MOCK_USER: PublicEmployee = {
  id: '00000000-0000-0000-0000-000000000101',
  name: 'Sebastian',
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  auth_user_id: null,
  role: 'admin',
  store_number: null,
  permissions: ['receiving', 'expected_boxes', 'prices', 'audit', 'accounting', 'settings'],
};

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function readCachedUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PublicEmployee) : null;
  } catch {
    return null;
  }
}

function cacheUser(employee: PublicEmployee) {
  localStorage.setItem(STORAGE_KEY, employee.id);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(employee));
}

async function clearLocalAuthSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (error) {
    if (!isInvalidRefreshTokenError(error)) throw error;
  } finally {
    clearStoredSupabaseAuthTokens();
  }
}

async function invokeKioskAuth(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('kiosk-auth', { body });
  if (error) {
    throw new Error(await functionErrorMessage(error, 'Sign-in failed'));
  }

  const result = data as KioskAuthResponse;
  if (!result?.session?.access_token || !result?.session?.refresh_token || !result?.employee) {
    throw new Error('Login session was not returned');
  }
  return result;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  beginSignIn: async () => {
    throw new Error('Not implemented');
  },
  beginAdminSignIn: async () => {
    throw new Error('Not implemented');
  },
  sendPasswordReset: async () => {
    throw new Error('Not implemented');
  },
  beginSignUp: async () => {
    throw new Error('Not implemented');
  },
  completeSignIn: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicEmployee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreUser = async () => {
      const isPasswordRecoveryRoute = window.location.pathname === '/reset-password';

      if (MOCK_LOCAL) {
        const cachedId = localStorage.getItem(STORAGE_KEY);
        const employee = listLocalEmployees().find(row => row.id === cachedId);
        if (employee) {
          const { passcode: _passcode, ...safeEmployee } = employee;
          setUser(safeEmployee);
          setLoading(false);
          return;
        }
        if (cachedId === MOCK_USER.id) {
          setUser(MOCK_USER);
          setLoading(false);
          return;
        }
        setLoading(false);
        return;
      }

      const cachedUser = readCachedUser();
      if (isOffline() && cachedUser) {
        setUser(cachedUser);
        setLoading(false);
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession().catch(error => ({
        data: { session: null },
        error,
      }));
      if (sessionError) {
        if (isInvalidRefreshTokenError(sessionError)) {
          await clearLocalAuthSession();
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(USER_STORAGE_KEY);
          setUser(null);
          setLoading(false);
          return;
        }
        if (cachedUser) {
          setUser(cachedUser);
          setLoading(false);
          return;
        }
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        setUser(null);
        setLoading(false);
        return;
      }
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        setLoading(false);
        return;
      }
      if (isPasswordRecoveryRoute) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('employees')
        .select(EMPLOYEE_SELECT)
        .eq('auth_user_id', authUserId)
        .eq('active', true)
        .maybeSingle();

      if (error) {
        if (cachedUser && (cachedUser.auth_user_id === authUserId || localStorage.getItem(STORAGE_KEY) === cachedUser.id)) {
          setUser(cachedUser);
          setLoading(false);
          return;
        }

        await clearLocalAuthSession();
        setUser(null);
      } else if (!data) {
        await clearLocalAuthSession();
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(USER_STORAGE_KEY);
        setUser(null);
      } else {
        const employee = data as PublicEmployee;
        cacheUser(employee);
        setUser(employee);
      }
      setLoading(false);
    };

    restoreUser();
  }, []);

  const beginSignIn = async (passcode: string) => {
    const normalizedPasscode = passcode.trim();
    if (MOCK_LOCAL) {
      const employee = listLocalEmployees().find(row => row.passcode === normalizedPasscode && row.active);
      if (!employee) throw new Error('Incorrect passcode');
      const { passcode: _passcode, ...safeEmployee } = employee;
      return safeEmployee;
    }
    if (isOffline()) {
      throw new Error('Reconnect to sign in. Offline mode works after a user has already opened the workspace on this device.');
    }

    await clearLocalAuthSession();
    const result = await invokeKioskAuth({ action: 'sign-in', passcode: normalizedPasscode });
    if (canAccessModule(result.employee, 'settings')) {
      throw new Error('Admin users must sign in with email and password.');
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (sessionError) throw sessionError;
    return result.employee;
  };

  const beginAdminSignIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) throw new Error('Email and password are required');

    if (MOCK_LOCAL) {
      if (normalizedEmail !== MOCK_ADMIN_EMAIL || password !== MOCK_ADMIN_PASSWORD) {
        throw new Error('Incorrect admin email or password');
      }
      return MOCK_USER;
    }
    if (isOffline()) {
      throw new Error('Reconnect to sign in as admin.');
    }

    await clearLocalAuthSession();
    const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    if (signInError) throw signInError;

    const authUserId = sessionData.user?.id;
    if (!authUserId) {
      await clearLocalAuthSession();
      throw new Error('Admin session was not returned');
    }

    const { data, error } = await supabase
      .from('employees')
      .select(EMPLOYEE_SELECT)
      .eq('auth_user_id', authUserId)
      .eq('active', true)
      .maybeSingle();
    if (error) {
      await clearLocalAuthSession();
      throw error;
    }
    if (!data) {
      await clearLocalAuthSession();
      throw new Error('No active employee profile is linked to this admin account');
    }

    const employee = data as PublicEmployee;
    if (!canAccessModule(employee, 'settings')) {
      await clearLocalAuthSession();
      throw new Error('This email is not allowed to open admin settings');
    }

    return employee;
  };

  const sendPasswordReset = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Email is required');
    if (MOCK_LOCAL) {
      throw new Error('Password reset is only available against Supabase auth');
    }
    if (isOffline()) {
      throw new Error('Reconnect to send a password reset email.');
    }

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });
    if (error) throw error;
  };

  const beginSignUp = async (name: string, passcode: string, adminPasscode: string) => {
    const normalizedName = name.trim();
    const normalizedPasscode = passcode.trim();
    if (MOCK_LOCAL) {
      if (!normalizedName || normalizedPasscode.length !== 4 || !adminPasscode) throw new Error('Invalid test registration');
      return { ...MOCK_USER, name: normalizedName, role: 'warehouse', store_number: null, permissions: null };
    }
    if (isOffline()) {
      throw new Error('Reconnect to register a new employee.');
    }

    await clearLocalAuthSession();
    const result = await invokeKioskAuth({
      action: 'sign-up',
      name: normalizedName,
      passcode: normalizedPasscode,
      adminPasscode,
    });
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (sessionError) throw sessionError;
    return result.employee;
  };

  const completeSignIn = (employee: PublicEmployee) => {
    cacheUser(employee);
    setUser(employee);
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    if (MOCK_LOCAL) {
      setUser(null);
      return;
    }

    await clearLocalAuthSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, beginSignIn, beginAdminSignIn, sendPasswordReset, beginSignUp, completeSignIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
