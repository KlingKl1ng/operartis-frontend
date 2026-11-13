import type { OpenedScenarioVersion, SavedScenario, SavedScenarioList, SaveScenarioResult, ScenarioTemplate, SolveAccepted, ValidationResponse, VrpJobStatus, VrpScenario, VrpSolution } from './types';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const localDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

function endpoint(path: string): string {
  return localDevelopment && path.startsWith('/vrp') ? `/api${path}` : path;
}

function apiErrorMessage(payload: unknown, fallback: string): string {
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
    const value = detail as { message?: unknown; msg?: unknown; errors?: Array<{ message?: string }> };
    if (typeof value.message === 'string') return value.message;
    if (typeof value.msg === 'string') return value.msg;
    if (Array.isArray(value.errors)) return value.errors.map((item) => item.message).filter(Boolean).join(' ') || fallback;
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
        const payload = await me.json() as { csrf_token?: string };
        token = payload.csrf_token || '';
        if (token) sessionStorage.setItem('operartis_csrf_token', token);
      }
    }
    if (token) headers.set('X-CSRF-Token', token);
  }
  return fetch(path, { ...init, headers, credentials: 'include' });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resolvedPath = endpoint(path);
  const response = window.OperartisApi?.apiFetch
    ? await window.OperartisApi.apiFetch(resolvedPath, init)
    : await fallbackFetch(resolvedPath, init);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(apiErrorMessage(payload, `${response.status} ${response.statusText || 'Request failed'}`));
  }
  return response.json() as Promise<T>;
}

export async function importScenarioFile(file: File): Promise<ValidationResponse> {
  const body = new FormData();
  body.append('file', file);
  return request<ValidationResponse>('/vrp/scenarios/import', { method: 'POST', body });
}

export function validateScenario(scenario: VrpScenario): Promise<ValidationResponse> {
  return request<ValidationResponse>('/vrp/scenarios/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenario),
  });
}

export function submitSolve(scenario: VrpScenario): Promise<SolveAccepted> {
  return request<SolveAccepted>('/vrp/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenario),
  });
}

export function getJobStatus(jobId: string): Promise<VrpJobStatus> {
  return request<VrpJobStatus>(`/vrp/jobs/${encodeURIComponent(jobId)}`);
}

export function getJobResult(jobId: string): Promise<VrpSolution> {
  return request<VrpSolution>(`/vrp/jobs/${encodeURIComponent(jobId)}/result`);
}

export function cancelJob(jobId: string): Promise<{ job_id: string; status: string }> {
  return request(`/vrp/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
}

async function downloadFile(apiPath: string, fallbackFilename: string, errorMessage: string): Promise<void> {
  const path = endpoint(apiPath);
  const response = window.OperartisApi?.apiFetch
    ? await window.OperartisApi.apiFetch(path)
    : await fallbackFetch(path, {});
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(apiErrorMessage(payload, errorMessage));
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallbackFilename;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJobExport(jobId: string, format: 'xlsx' | 'json' | 'geojson' = 'xlsx'): Promise<void> {
  return downloadFile(
    `/vrp/jobs/${encodeURIComponent(jobId)}/export?format=${format}`,
    `operartis-vrp-result.${format}`,
    'Export failed',
  );
}

export async function listTemplates(): Promise<ScenarioTemplate[]> {
  const payload = await request<{ templates: ScenarioTemplate[] }>('/vrp/templates');
  return payload.templates;
}

export function importTemplate(templateId: string): Promise<ValidationResponse> {
  return request<ValidationResponse>(`/vrp/templates/${encodeURIComponent(templateId)}/import`, { method: 'POST' });
}

export function downloadTemplate(template: ScenarioTemplate): Promise<void> {
  return downloadFile(`/vrp/templates/${encodeURIComponent(template.id)}/download`, template.filename, 'Template download failed');
}

export async function waitForJob(
  jobId: string,
  onProgress: (job: VrpJobStatus) => void,
  signal?: AbortSignal,
): Promise<VrpSolution> {
  while (!signal?.aborted) {
    const job = await getJobStatus(jobId);
    onProgress(job);
    if (job.status === 'completed') return getJobResult(jobId);
    if (job.status === 'failed') throw new Error(job.error || 'Optimization failed');
    if (job.status === 'cancelled') throw new DOMException('Optimization cancelled', 'AbortError');
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 700);
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new DOMException('Optimization cancelled', 'AbortError'));
      }, { once: true });
    });
  }
  throw new DOMException('Optimization cancelled', 'AbortError');
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export function listSavedScenarios(): Promise<SavedScenarioList> {
  return request<SavedScenarioList>('/vrp/saved-scenarios');
}

export function saveNewScenario(name: string, scenario: VrpScenario, sourceFilename: string | null): Promise<SaveScenarioResult> {
  return request<SaveScenarioResult>('/vrp/saved-scenarios', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name, scenario, source_filename: sourceFilename }),
  });
}

export function saveScenarioVersion(scenarioId: string, scenario: VrpScenario): Promise<SaveScenarioResult> {
  return request<SaveScenarioResult>(`/vrp/saved-scenarios/${encodeURIComponent(scenarioId)}/versions`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ scenario }),
  });
}

export function openScenarioVersion(scenarioId: string, versionId: string): Promise<OpenedScenarioVersion> {
  return request<OpenedScenarioVersion>(`/vrp/saved-scenarios/${encodeURIComponent(scenarioId)}/versions/${encodeURIComponent(versionId)}`);
}

export function renameSavedScenario(scenarioId: string, name: string): Promise<SavedScenario> {
  return request<SavedScenario>(`/vrp/saved-scenarios/${encodeURIComponent(scenarioId)}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ name }),
  });
}

export function deleteSavedScenario(scenarioId: string): Promise<{ deleted: boolean; id: string }> {
  return request(`/vrp/saved-scenarios/${encodeURIComponent(scenarioId)}`, { method: 'DELETE' });
}
