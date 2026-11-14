// Calls to the Operartis backend. Requests go through operartis-api.js (session
// cookie, CSRF token, re-authentication); the fallback covers a page that loads
// without it.

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const isLocalDevelopment = () => typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Turn a FastAPI error body into one readable sentence. */
export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return String((item as { msg?: unknown }).msg || (item as { message?: unknown }).message || '');
      return '';
    }).filter(Boolean).join(' ') || fallback;
  }
  if (detail && typeof detail === 'object') {
    const value = detail as { message?: unknown; msg?: unknown };
    if (typeof value.message === 'string') return value.message;
    if (typeof value.msg === 'string') return value.msg;
  }
  return fallback;
}

async function fallbackFetch(path: string, init: RequestInit): Promise<Response> {
  const method = String(init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  if (unsafeMethods.has(method) && !headers.has('X-CSRF-Token')) {
    let token = sessionStorage.getItem('operartis_csrf_token') || '';
    if (!token) {
      const me = await fetch('/auth/me', { credentials: 'include' });
      if (me.ok) {
        token = ((await me.json()) as { csrf_token?: string }).csrf_token || '';
        if (token) sessionStorage.setItem('operartis_csrf_token', token);
      }
    }
    if (token) headers.set('X-CSRF-Token', token);
  }
  return fetch(path, { ...init, headers, credentials: 'include' });
}

/**
 * An API client for one module. `prefix` is the module's first path segment
 * (for example "/inventory"). On a local dev server those paths are sent as
 * "/api/inventory/…" so they do not collide with the page's own address; the
 * dev server strips "/api" again.
 */
export function createApi(prefix: string) {
  const endpoint = (path: string) => (isLocalDevelopment() && path.startsWith(prefix) ? `/api${path}` : path);

  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    const resolved = endpoint(path);
    const response = window.OperartisApi?.apiFetch
      ? await window.OperartisApi.apiFetch(resolved, init)
      : await fallbackFetch(resolved, init);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(apiErrorMessage(payload, `${response.status} ${response.statusText || 'Request failed'}`), response.status);
    }
    return response;
  }

  return {
    get: async <T>(path: string): Promise<T> => (await send(path)).json() as Promise<T>,
    post: async <T>(path: string, body?: unknown): Promise<T> => (await send(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })).json() as Promise<T>,
    /** POST that answers with a file; saves it under the server's filename. */
    postForDownload: async (path: string, body: unknown, fallbackFilename: string): Promise<void> => {
      const response = await send(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallbackFilename;
      saveBlob(await response.blob(), filename);
    },
  };
}

export function saveBlob(blob: Blob, filename: string): void {
  if (window.OperartisSecurity?.downloadBlob) {
    window.OperartisSecurity.downloadBlob(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
