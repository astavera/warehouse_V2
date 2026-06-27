const SUPABASE_AUTH_KEY_PATTERN = /^sb-.+-auth-token$/;

export function isInvalidRefreshTokenError(error: unknown) {
  const message = String(
    error && typeof error === 'object' && 'message' in error
      ? (error as { message?: unknown }).message
      : error
  ).toLowerCase();

  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('refresh token has expired') ||
    message.includes('refresh token already used')
  );
}

export function clearStoredSupabaseAuthTokens() {
  if (typeof window === 'undefined') return;

  const clearStorage = (storage: Storage) => {
    Object.keys(storage).forEach(key => {
      if (SUPABASE_AUTH_KEY_PATTERN.test(key) || key === 'supabase.auth.token') {
        storage.removeItem(key);
      }
    });
  };

  try {
    clearStorage(window.localStorage);
  } catch {
    // Ignore storage access failures; auth recovery should not block rendering.
  }

  try {
    clearStorage(window.sessionStorage);
  } catch {
    // Ignore storage access failures; auth recovery should not block rendering.
  }
}
