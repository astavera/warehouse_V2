import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Employee = Tables<'employees'>;

interface AuthCtx {
  user: Employee | null;
  loading: boolean;
  beginSignIn: (passcode: string) => Promise<Employee>;
  beginSignUp: (name: string, passcode: string) => Promise<Employee>;
  completeSignIn: (user: Employee) => void;
  signOut: () => Promise<void>;
}

const STORAGE_KEY = 'warehouse-kiosk-user-id';

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
  const [user, setUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreUser = async () => {
      const userId = localStorage.getItem(STORAGE_KEY);
      if (!userId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', userId)
        .eq('active', true)
        .maybeSingle();

      if (error || !data) {
        localStorage.removeItem(STORAGE_KEY);
        setUser(null);
      } else {
        setUser(data);
      }
      setLoading(false);
    };

    restoreUser();
  }, []);

  const beginSignIn = async (passcode: string) => {
    const normalizedPasscode = passcode.trim();

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('passcode', normalizedPasscode)
      .eq('active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Incorrect passcode');
    return data;
  };

  const beginSignUp = async (name: string, passcode: string) => {
    const normalizedName = name.trim();
    const normalizedPasscode = passcode.trim();

    const { data: existing, error: existingError } = await supabase
      .from('employees')
      .select('id')
      .ilike('name', normalizedName)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) throw new Error('That name is already registered');

    const { data: existingPasscode, error: existingPasscodeError } = await supabase
      .from('employees')
      .select('id')
      .eq('passcode', normalizedPasscode)
      .maybeSingle();

    if (existingPasscodeError) throw existingPasscodeError;
    if (existingPasscode) throw new Error('That passcode is already in use');

    const { data, error } = await supabase
      .from('employees')
      .insert({
        name: normalizedName,
        passcode: normalizedPasscode,
        active: true,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  };

  const completeSignIn = (employee: Employee) => {
    localStorage.setItem(STORAGE_KEY, employee.id);
    setUser(employee);
  };

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, beginSignIn, beginSignUp, completeSignIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
