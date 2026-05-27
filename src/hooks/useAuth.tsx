import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type { Session } from '@supabase/supabase-js';

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
  beginSignUp: (name: string, passcode: string, adminPasscode: string) => Promise<PublicEmployee>;
  completeSignIn: (user: PublicEmployee) => void;
  signOut: () => Promise<void>;
}

const STORAGE_KEY = 'warehouse-kiosk-user-id';
const EMPLOYEE_SELECT = 'id, name, active, created_at, updated_at, auth_user_id';
const MOCK_LOCAL = import.meta.env.VITE_MOCK_LOCAL === 'true';
const MOCK_USER: PublicEmployee = {
  id: '00000000-0000-0000-0000-000000000101',
  name: 'Test User',
  active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  auth_user_id: null,
};

async function invokeKioskAuth(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('kiosk-auth', { body });
  if (error) {
    const response = 'context' in error ? error.context : null;
    if (response instanceof Response) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || error.message);
    }
    throw error;
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
      if (MOCK_LOCAL && localStorage.getItem(STORAGE_KEY) === MOCK_USER.id) {
        setUser(MOCK_USER);
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) {
        localStorage.removeItem(STORAGE_KEY);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('employees')
        .select(EMPLOYEE_SELECT)
        .eq('auth_user_id', authUserId)
        .eq('active', true)
        .maybeSingle();

      if (error || !data) {
        await supabase.auth.signOut();
        setUser(null);
      } else {
        localStorage.setItem(STORAGE_KEY, data.id);
        setUser(data as PublicEmployee);
      }
      setLoading(false);
    };

    restoreUser();
  }, []);

  const beginSignIn = async (passcode: string) => {
    const normalizedPasscode = passcode.trim();
    if (MOCK_LOCAL) {
      if (normalizedPasscode !== '0315') throw new Error('Incorrect passcode');
      return MOCK_USER;
    }

    await supabase.auth.signOut();
    const result = await invokeKioskAuth({ action: 'sign-in', passcode: normalizedPasscode });
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (sessionError) throw sessionError;
    return result.employee;
  };

  const beginSignUp = async (name: string, passcode: string, adminPasscode: string) => {
    const normalizedName = name.trim();
    const normalizedPasscode = passcode.trim();
    if (MOCK_LOCAL) {
      if (!normalizedName || normalizedPasscode.length !== 4 || !adminPasscode) throw new Error('Invalid test registration');
      return { ...MOCK_USER, name: normalizedName };
    }

    await supabase.auth.signOut();
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
    localStorage.setItem(STORAGE_KEY, employee.id);
    setUser(employee);
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    if (MOCK_LOCAL) {
      setUser(null);
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, beginSignIn, beginSignUp, completeSignIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
