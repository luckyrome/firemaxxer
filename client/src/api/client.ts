export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let onAuthFailure: (() => void) | null = null;
export function registerAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function doFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (res.status === 204) return undefined as T;

  if (res.ok) return res.json() as Promise<T>;

  let message = res.statusText;
  try {
    const body = await res.json();
    if (typeof body.error === 'string') message = body.error;
  } catch { /* ignore */ }

  throw new ApiError(res.status, message);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await doFetch<T>(path, init);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;

    const refreshed = await tryRefresh();
    if (!refreshed) {
      onAuthFailure?.();
      throw err;
    }

    try {
      return await doFetch<T>(path, init);
    } catch (retryErr) {
      if (retryErr instanceof ApiError && retryErr.status === 401) {
        onAuthFailure?.();
      }
      throw retryErr;
    }
  }
}
