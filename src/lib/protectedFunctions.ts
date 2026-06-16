import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/functionErrors';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function getAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const shouldRefresh = !session?.access_token || expiresAtMs <= Date.now() + 60_000;

  if (session?.access_token && !shouldRefresh) return session.access_token;

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
    throw new Error(
      await functionErrorMessage(
        { context: new Response(JSON.stringify(payload)) },
        `Function ${name} failed`
      )
    );
  }

  return payload as T;
}
