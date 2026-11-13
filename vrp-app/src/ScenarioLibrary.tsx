import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Check, FolderOpen, LoaderCircle, PencilLine, Route, Save, Trash2, X } from 'lucide-react';
import { deleteSavedScenario, listSavedScenarios, openScenarioVersion, renameSavedScenario } from './api';
import type { OpenedScenarioVersion, SavedScenario, SavedScenarioVersion } from './types';

export const SAVED_SCENARIOS_QUERY_KEY = ['vrp-saved-scenarios'];

export interface OpenSavedScenario {
  id: string;
  name: string;
  versionId: string;
  versionNumber: number;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatMoney(value: number, currency: string | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: currency === 'VND' ? 0 : 2 }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function planLine(version: SavedScenarioVersion): string | null {
  const summary = version.latest_plan?.summary;
  if (!summary || summary.total_cost == null) return null;
  const parts = [formatMoney(summary.total_cost, summary.currency)];
  if (summary.vehicles_used != null) parts.push(`${summary.vehicles_used} vehicle${summary.vehicles_used === 1 ? '' : 's'}`);
  if (summary.distance_meters != null) parts.push(`${(summary.distance_meters / 1000).toFixed(1)} km`);
  if (summary.customers_served != null && summary.customers_total != null) parts.push(`${summary.customers_served}/${summary.customers_total} served`);
  return parts.join(' · ');
}

/** Cost change against the nearest older version that has a saved plan. */
function costChange(versions: SavedScenarioVersion[], index: number): { delta: number; currency?: string; against: number } | null {
  const cost = versions[index].latest_plan?.summary.total_cost;
  if (cost == null) return null;
  const older = versions.slice(index + 1).find((version) => version.latest_plan?.summary.total_cost != null);
  if (!older) return null;
  return { delta: cost - (older.latest_plan!.summary.total_cost as number), currency: versions[index].latest_plan!.summary.currency, against: older.version_number };
}

function versionCounts(version: SavedScenarioVersion | null): string {
  const counts = version?.summary.counts;
  if (!counts) return '';
  return `${counts.depots} depots · ${counts.customers} customers · ${counts.vehicles} vehicles`;
}

export function ScenarioLibraryPane({ current, onOpened, onRenamed, onDeleted, onChooseTemplate, onBusyChange }: {
  current: OpenSavedScenario | null;
  onOpened: (opened: OpenedScenarioVersion) => void;
  onRenamed: (scenarioId: string, name: string) => void;
  onDeleted: (scenarioId: string) => void;
  onChooseTemplate: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const libraryQuery = useQuery({ queryKey: SAVED_SCENARIOS_QUERY_KEY, queryFn: listSavedScenarios });
  const scenarios = libraryQuery.data?.scenarios || [];
  const [selectedId, setSelectedId] = useState<string | null>(current?.id || null);
  const selected = scenarios.find((item) => item.id === selectedId) || scenarios[0] || null;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { onBusyChange(Boolean(busy)); }, [busy, onBusyChange]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The scenario library request failed');
    } finally {
      setBusy(null);
    }
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: SAVED_SCENARIOS_QUERY_KEY });

  const submitRename = (event: FormEvent, item: SavedScenario) => {
    event.preventDefault();
    const name = renameValue.trim();
    if (!name || name === item.name) { setRenamingId(null); return; }
    void run(`rename-${item.id}`, async () => {
      const renamed = await renameSavedScenario(item.id, name);
      onRenamed(renamed.id, renamed.name);
      await refresh();
      setRenamingId(null);
    });
  };

  const remove = (item: SavedScenario) => void run(`delete-${item.id}`, async () => {
    await deleteSavedScenario(item.id);
    onDeleted(item.id);
    setConfirmDeleteId(null);
    if (selectedId === item.id) setSelectedId(null);
    await refresh();
  });

  const open = (item: SavedScenario, version: SavedScenarioVersion) => void run(`open-${version.id}`, async () => {
    onOpened(await openScenarioVersion(item.id, version.id));
  });

  if (libraryQuery.isLoading) {
    return <div className="scenario-template-status scenario-library-status" role="status"><LoaderCircle className="spin" size={18} /> Loading your scenarios…</div>;
  }
  if (libraryQuery.isError) {
    return <p className="import-error" role="alert"><AlertTriangle size={16} /> {libraryQuery.error instanceof Error ? libraryQuery.error.message : 'Your scenarios could not be loaded'}</p>;
  }
  if (!scenarios.length) {
    return (
      <div className="scenario-library-empty">
        <FolderOpen size={30} />
        <strong>No saved scenarios yet</strong>
        <span>Load a template or upload a workbook, then press <Save size={12} aria-label="Save" /> in the top bar to keep it here with its version history.</span>
        <button className="button button-quiet" type="button" onClick={onChooseTemplate}>Browse templates</button>
      </div>
    );
  }

  return (
    <div className="scenario-library">
      <ul className="scenario-library-list" aria-label="Saved scenarios">
        {scenarios.map((item) => {
          const isSelected = selected?.id === item.id;
          const isOpen = current?.id === item.id;
          return (
            <li key={item.id} className={`scenario-library-item ${isSelected ? 'is-selected' : ''}`}>
              {renamingId === item.id ? (
                <form className="scenario-library-rename" onSubmit={(event) => submitRename(event, item)}>
                  <input
                    autoFocus
                    value={renameValue}
                    maxLength={120}
                    aria-label="Scenario name"
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setRenamingId(null); } }}
                  />
                  <button type="submit" aria-label="Save name" disabled={busy === `rename-${item.id}`}><Check size={14} /></button>
                  <button type="button" aria-label="Cancel rename" onClick={() => setRenamingId(null)}><X size={14} /></button>
                </form>
              ) : (
                <button type="button" className="scenario-library-select" aria-pressed={isSelected} onClick={() => { setSelectedId(item.id); setConfirmDeleteId(null); }}>
                  <strong>{item.name}{isOpen && <span className="scenario-library-badge">Open</span>}</strong>
                  <small>{item.source_filename || 'Created in the app'}</small>
                  <small>v{item.latest_version?.version_number ?? 0} · {formatTimestamp(item.updated_at)}</small>
                </button>
              )}
              {renamingId !== item.id && (
                <div className="scenario-library-actions">
                  {confirmDeleteId === item.id ? (
                    <>
                      <button type="button" className="is-danger" onClick={() => remove(item)} disabled={busy === `delete-${item.id}`}>{busy === `delete-${item.id}` ? <LoaderCircle className="spin" size={13} /> : 'Delete'}</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} aria-label="Keep scenario"><X size={13} /></button>
                    </>
                  ) : (
                    <>
                      <button type="button" title="Rename" aria-label={`Rename ${item.name}`} onClick={() => { setRenamingId(item.id); setRenameValue(item.name); setConfirmDeleteId(null); }}><PencilLine size={13} /></button>
                      <button type="button" title="Delete" aria-label={`Delete ${item.name}`} onClick={() => setConfirmDeleteId(item.id)}><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <section className="scenario-library-versions" aria-label="Version history">
        <span className="eyebrow">Version history</span>
        {selected?.versions.map((version, index, versions) => {
          const isOpen = current?.versionId === version.id;
          const plan = planLine(version);
          const change = costChange(versions, index);
          return (
            <article key={version.id} className={`scenario-version-card ${isOpen ? 'is-open' : ''}`}>
              <div>
                <strong>Version {version.version_number}{isOpen && <span className="scenario-library-badge">Open</span>}</strong>
                <small>{formatTimestamp(version.created_at)}</small>
                <small>{versionCounts(version)}</small>
                {plan
                  ? <span className="scenario-version-plan"><Route size={12} /> Plan · {plan}</span>
                  : <span className="scenario-version-plan is-empty">No saved plan · open and optimize to add one</span>}
                {change && Math.abs(change.delta) >= 0.005 && (
                  <span className={`scenario-version-change ${change.delta < 0 ? 'is-better' : 'is-worse'}`}>
                    {change.delta < 0 ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                    {change.delta < 0 ? '−' : '+'}{formatMoney(Math.abs(change.delta), change.currency)} vs version {change.against}
                  </span>
                )}
              </div>
              <button className="button button-primary" type="button" onClick={() => selected && open(selected, version)} disabled={Boolean(busy)}>
                {busy === `open-${version.id}` ? <LoaderCircle className="spin" size={15} /> : <FolderOpen size={15} />} Open
              </button>
            </article>
          );
        })}
      </section>

      {error && <p className="import-error scenario-library-error" role="alert"><AlertTriangle size={16} /> {error}</p>}
    </div>
  );
}

export function SaveScenarioDialog({ defaultName, saving, error, onCancel, onSave }: {
  defaultName: string;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onCancel(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onCancel, saving]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && !saving) onSave(name.trim());
  };
  return (
    <div className="modal-layer modal-layer-top" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <form className="import-dialog save-scenario-dialog" role="dialog" aria-modal="true" aria-labelledby="save-scenario-title" onSubmit={submit}>
        <header>
          <div>
            <span className="entity-dialog-icon"><Save size={20} /></span>
            <span><h2 id="save-scenario-title">Save scenario</h2><small>Keep it in My scenarios. Later saves add new versions.</small></span>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={saving} aria-label="Close dialog"><X size={18} /></button>
        </header>
        <label className="save-scenario-field">
          <span>Name</span>
          <input autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </label>
        {error && <p className="import-error" role="alert"><AlertTriangle size={16} /> {error}</p>}
        <footer>
          <span className="scenario-dialog-note">Private to your account.</span>
          <button className="button button-quiet" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={!name.trim() || saving}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} Save
          </button>
        </footer>
      </form>
    </div>
  );
}
