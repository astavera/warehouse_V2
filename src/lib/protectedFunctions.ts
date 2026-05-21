import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function getAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.access_token) return sessionData.session.access_token;

  const { data: refreshedSession } = await supabase.auth.refreshSession();
  if (refreshedSession.session?.access_token) return refreshedSession.session.access_token;

  throw new Error('Your session expired. Please sign in again.');
}

export async function invokeProtectedFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.details?.error?.message ||
      payload?.details?.errors?.[0]?.message ||
      payload?.error ||
      `Function ${name} failed`;
    throw new Error(message);
  }

  return payload as T;
}
