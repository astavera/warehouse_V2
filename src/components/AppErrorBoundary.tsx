import { Component, type ErrorInfo, type ReactNode } from 'react';

const CHUNK_RELOAD_KEY = 'warehouse-last-chunk-error-reload';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ChunkLoadError|dynamically imported module|Importing a module script failed|Failed to fetch|Unable to preload CSS/i.test(message);
}

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    if (!isChunkLoadError(error) || typeof window === 'undefined') return;

    const lastReload = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    const now = Date.now();
    if (now - lastReload < CHUNK_RELOAD_COOLDOWN_MS) return;

    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    window.location.reload();
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-semibold text-foreground">Loading issue</p>
          <p className="mt-2 text-sm text-muted-foreground">Refresh the page to continue.</p>
          <button
            type="button"
            className="mt-5 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
}
