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
    const { data, error } = await supabase.functions.invoke('kiosk-auth', {
      body: { action: 'sign-in', passcode: normalizedPasscode },
    });
    if (error) throw error;
    const result = data as KioskAuthResponse;
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
    const { data, error } = await supabase.functions.invoke('kiosk-auth', {
      body: {
        action: 'sign-up',
        name: normalizedName,
        passcode: normalizedPasscode,
        adminPasscode,
      },
    });
    if (error) throw error;
    const result = data as KioskAuthResponse;
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
