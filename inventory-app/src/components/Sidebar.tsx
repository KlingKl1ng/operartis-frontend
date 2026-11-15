import { useEffect, useState, type ReactNode } from 'react';
import { Lock, LockOpen, Plus, Trash2, Upload } from 'lucide-react';
import { SectionLabel } from '../../../app-shared/ui';
import { ERROR_PERSISTENCE, leadTimeProbabilitySum, leadTimeValuesValid, ORDER_INTERVALS, REVIEW_PERIODS, SERVICE_LEVEL } from '../domain/params';
import type { LeadTimeConfig, LeadTimeType, Params } from '../domain/types';
import type { TextKey, Translator } from '../i18n';
import { label as upper } from './Label';

/**
 * A number box that lets the user type freely (including clearing it) and
 * reports a value only when the text is a valid number within the limits.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step = 1,
  integer = false,
  disabled,
  invalid,
  ariaLabel,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    // Follow outside changes (another product, a file load) unless the box already shows that number.
    setDraft((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  const accept = (text: string): number | null => {
    if (text.trim() === '') return null;
    const parsed = integer ? parseInt(text, 10) : parseFloat(text);
    if (!Number.isFinite(parsed)) return null;
    if (min !== undefined && parsed < min) return null;
    if (max !== undefined && parsed > max) return null;
    return parsed;
  };

  return (
    <input
      className="ops-input"
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || accept(draft) === null || undefined}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = accept(event.target.value);
        if (next !== null) onCommit(next);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

/**
 * How a value that comes from the file is shown: 'file' on the overview, where it
 * differs per product; 'locked' or 'open' for the one product whose tab is showing.
 */
type FileLock = 'file' | 'locked' | 'open' | undefined;

function LockMark({ lock, t }: { lock: FileLock; t: Translator }) {
  if (!lock) return null;
  return lock === 'open'
    ? <LockOpen size={10} className="inv-lock-open" aria-label={t('fromFile')} />
    : <Lock size={10} aria-label={t(lock === 'file' ? 'fromFile' : 'locked')} />;
}

/** Stands in for a value that the file gives per product. */
function FromFile({ t }: { t: Translator }) {
  return <input className="ops-input" value={t('fromFile')} disabled readOnly />;
}

function Field({ label, lock, t, children }: { label: string; lock?: FileLock; t?: Translator; children: ReactNode }) {
  return (
    <label className="ops-field">
      <span>
        {upper(label)}
        {t && <LockMark lock={lock} t={t} />}
      </span>
      {children}
    </label>
  );
}

const LEAD_TIME_TYPES: Array<{ type: LeadTimeType; label: TextKey }> = [
  { type: 'deterministic', label: 'deterministicFixed' },
  { type: 'value', label: 'customDiscrete' },
  { type: 'poisson', label: 'poisson' },
  { type: 'binomial', label: 'binomial' },
  { type: 'uniform', label: 'discreteUniform' },
];

function LeadTimeEditor({ config, onChange, lock, t }: { config: LeadTimeConfig; onChange: (config: LeadTimeConfig) => void; lock: FileLock; t: Translator }) {
  const disabled = lock === 'locked';
  const set = (patch: Partial<LeadTimeConfig>) => onChange({ ...config, ...patch });
  const expected = config.type === 'binomial'
    ? config.binomialN * config.binomialP
    : config.type === 'uniform'
      ? (config.uniformMin + config.uniformMax) / 2
      : config.type === 'value'
        ? config.values.reduce((sum, item) => sum + item.value * item.probability, 0)
        : null;

  return (
    <div className="inv-leadtime">
      <div className="ops-field-label">
        {t('leadTime')}
        <LockMark lock={lock} t={t} />
      </div>
      {/* A type that needs one number shares its row with it. */}
      <div className={config.type === 'deterministic' || config.type === 'poisson' ? 'inv-grid-2' : undefined}>
        <Field label={t('type')}>
          <select className="ops-select" value={config.type} disabled={disabled} onChange={(event) => set({ type: event.target.value as LeadTimeType })}>
            {LEAD_TIME_TYPES.map((item) => <option key={item.type} value={item.type}>{t(item.label)}</option>)}
          </select>
        </Field>
        {config.type === 'deterministic' && (
          <Field label={t('valueDays')}>
            <NumberField value={config.deterministicValue} min={1} integer disabled={disabled} onCommit={(deterministicValue) => set({ deterministicValue })} />
          </Field>
        )}
        {config.type === 'poisson' && (
          <Field label="λ">
            <NumberField value={config.poissonLambda} min={0.1} step={0.5} disabled={disabled} onCommit={(poissonLambda) => set({ poissonLambda })} />
          </Field>
        )}
      </div>

      {config.type === 'value' && (
        <div className="inv-value-list">
          <div className="inv-value-list-head">
            <span>{t('valueDays')}</span>
            <span>{t('probability')}</span>
            <span />
          </div>
          {config.values.map((item, index) => (
            <div className="inv-value-row" key={index}>
              <NumberField
                value={item.value}
                min={1}
                integer
                disabled={disabled}
                ariaLabel={t('valueDays')}
                onCommit={(value) => set({ values: config.values.map((entry, position) => (position === index ? { ...entry, value } : entry)) })}
              />
              <NumberField
                value={item.probability}
                min={0}
                max={1}
                step={0.05}
                disabled={disabled}
                ariaLabel={t('probability')}
                onCommit={(probability) => set({ values: config.values.map((entry, position) => (position === index ? { ...entry, probability } : entry)) })}
              />
              <button
                className="ops-icon-button inv-small-icon"
                type="button"
                disabled={disabled || config.values.length <= 1}
                aria-label={t('remove')}
                title={t('remove')}
                onClick={() => set({ values: config.values.filter((_, position) => position !== index) })}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="inv-value-list-foot">
            <button className="ops-button is-quiet is-small" type="button" disabled={disabled} onClick={() => set({ values: [...config.values, { value: 14, probability: 0 }] })}>
              <Plus size={13} /> {t('add')}
            </button>
            <span className={leadTimeValuesValid(config) ? 'inv-sum' : 'inv-sum is-bad'} title={leadTimeValuesValid(config) ? undefined : t('valueListInvalid')}>
              {t('probabilitySum')}: {t.format.number(leadTimeProbabilitySum(config) * 100, 0, 1)}%
            </span>
          </div>
        </div>
      )}

      {config.type === 'binomial' && (
        <div className="inv-grid-2">
          <Field label="n">
            <NumberField value={config.binomialN} min={1} integer disabled={disabled} onCommit={(binomialN) => set({ binomialN })} />
          </Field>
          <Field label="p">
            <NumberField value={config.binomialP} min={0} max={1} step={0.05} disabled={disabled} onCommit={(binomialP) => set({ binomialP })} />
          </Field>
        </div>
      )}

      {config.type === 'uniform' && (
        <div className="inv-grid-2">
          <Field label={t('minDays')}>
            <NumberField value={config.uniformMin} min={1} max={config.uniformMax} integer disabled={disabled} onCommit={(uniformMin) => set({ uniformMin })} />
          </Field>
          <Field label={t('maxDays')}>
            <NumberField value={config.uniformMax} min={config.uniformMin} integer disabled={disabled} onCommit={(uniformMax) => set({ uniformMax })} />
          </Field>
        </div>
      )}

      {expected !== null && (
        <p className="inv-hint">{t('expectedValueDays')} {t.format.number(expected, 0, 1)} {t('days')}</p>
      )}
    </div>
  );
}

function Slider({
  value,
  onChange,
  min,
  max,
  step,
  presets,
  format,
  disabled,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  presets: readonly number[];
  format: (value: number) => string;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className="inv-slider">
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={ariaLabel} onChange={(event) => onChange(parseFloat(event.target.value))} />
      <div className="inv-presets">
        {presets.map((preset) => (
          <button key={preset} type="button" className={Math.abs(preset - value) < 1e-9 ? 'is-active' : ''} disabled={disabled} onClick={() => onChange(preset)}>
            {format(preset)}
          </button>
        ))}
      </div>
    </div>
  );
}

const PERSISTENCE_LABEL: Record<number, TextKey> = { 0: 'persistenceNone', 0.3: 'persistenceLow', 0.5: 'persistenceMedium', 0.7: 'persistenceHigh' };
const REVIEW_LABEL: Record<number, TextKey> = { 1: 'daily', 7: 'weekly', 14: 'biWeekly', 30: 'monthly' };
/** A number of days in words where there is a word for it: "Weekly", otherwise "21 days". */
const daysLabel = (days: number, t: Translator) => (REVIEW_LABEL[days] ? t(REVIEW_LABEL[days]) : `${t.format.number(days, 0, 0)} ${t('days')}`);

type FieldFlags = { initialStock: boolean; leadTime: boolean; reviewPeriod: boolean; moq: boolean; serviceLevel: boolean };

export interface SidebarProps {
  t: Translator;
  filename: string | null;
  productCount: number;
  forecastDays: number;
  onUpload: () => void;
  busy: boolean;
  hasFile: boolean;
  /** The product whose parameters are shown; null means the values for all products. */
  product: string | null;
  params: Params;
  onParamsChange: (patch: Partial<Params>) => void;
  /** The parameters the uploaded file gives; they differ per product. */
  fileFields: FieldFlags;
  /** The error persistence estimated from the forecast report's past forecast errors, if it has any. */
  reportPersistence: number | null;
  /** Those of them that are locked until the user unlocks a product. */
  lockedFields: FieldFlags;
  /** The product's file values were unlocked for editing. */
  unlocked: boolean;
  /** The product runs with values of its own. */
  edited: boolean;
  onUnlock: () => void;
  onDiscardChanges: () => void;
}

export function Sidebar(props: SidebarProps) {
  const { t, params, fileFields, unlocked, edited, product } = props;
  const anyFromFile = Object.values(fileFields).some(Boolean);
  const anyLocked = (Object.keys(fileFields) as Array<keyof FieldFlags>).some((field) => fileFields[field] && props.lockedFields[field]);
  const lock = (field: keyof FieldFlags): FileLock => (
    !fileFields[field] ? undefined : !product ? 'file' : props.lockedFields[field] && !unlocked ? 'locked' : 'open'
  );
  const fixed = (field: keyof FieldFlags) => lock(field) === 'locked' || lock(field) === 'file';
  const perProduct = (field: keyof FieldFlags) => lock(field) === 'file';

  return (
    <>
      <section>
        <SectionLabel>{t('dataSource')}</SectionLabel>
        <div className={`inv-source-card ${props.filename ? 'is-loaded' : ''}`}>
          {props.filename ? (
            <>
              <div className="inv-source-file">
                <strong title={props.filename}>{props.filename}</strong>
                <span className="inv-source-meta">
                  {t.format.number(props.productCount, 0, 0)} {t('products')} · {t.format.number(props.forecastDays, 0, 0)} {t('days')}
                </span>
              </div>
              <button className="inv-source-action" type="button" onClick={props.onUpload} disabled={props.busy} title={t('uploadAnother')} aria-label={t('uploadAnother')}>
                <Upload size={14} />
              </button>
            </>
          ) : (
            <button className="inv-source-empty" type="button" onClick={props.onUpload} disabled={props.busy}>
              <Upload size={32} />
              <span>{t('uploadInputData')}</span>
            </button>
          )}
        </div>
      </section>

      {/* Remounted per product so a half-typed number never carries over to another product. */}
      <section key={product ?? ''}>
        <SectionLabel>{t('parameters')}</SectionLabel>
        {props.hasFile && props.productCount > 1 && (
          <div className={`inv-scope ${product ? 'is-product' : ''}`}>
            <span>{t('appliesTo')}</span>
            <strong title={product ?? undefined}>{product ?? t('allProducts')}</strong>
          </div>
        )}
        <div className="inv-policy-pill">{t('stochasticPolicy')}</div>

        {!product && anyFromFile && (
          <div className="inv-lock-hint">
            <Lock size={12} />
            <span>{t('fileValuesHint')}</span>
          </div>
        )}
        {product && (anyLocked || edited) && (
          <div className={`inv-lock-hint ${unlocked || edited ? 'is-open' : ''}`}>
            {unlocked || !anyLocked ? <LockOpen size={12} /> : <Lock size={12} />}
            <span>{t(unlocked ? 'unlockedHint' : anyLocked ? 'lockedHint' : 'editedHint')}</span>
            {anyLocked && !unlocked && (
              <button className="ops-button is-quiet is-small" type="button" onClick={props.onUnlock} title={t('unlockValuesHint')}>{t('unlockValues')}</button>
            )}
            {(unlocked || edited) && (
              <button className="ops-button is-quiet is-small" type="button" onClick={props.onDiscardChanges} title={t('discardChangesHint')}>{t('discardChanges')}</button>
            )}
          </div>
        )}

        <div className="inv-grid-2">
          <Field label={t('initialStock')} lock={lock('initialStock')} t={t}>
            {perProduct('initialStock')
              ? <FromFile t={t} />
              : <NumberField value={params.initialStock} min={0} disabled={fixed('initialStock')} onCommit={(initialStock) => props.onParamsChange({ initialStock })} />}
          </Field>
          <Field label={t('minOrderQty')} lock={lock('moq')} t={t}>
            {perProduct('moq')
              ? <FromFile t={t} />
              : <NumberField value={params.moqValue} min={0} disabled={fixed('moq')} onCommit={(moqValue) => props.onParamsChange({ moqValue })} />}
          </Field>
        </div>

        {perProduct('leadTime') ? (
          <div className="inv-leadtime">
            <div className="ops-field-label">
              {t('leadTime')}
              <LockMark lock="file" t={t} />
            </div>
            <FromFile t={t} />
          </div>
        ) : (
          <LeadTimeEditor config={params.leadTimeConfig} lock={lock('leadTime')} t={t} onChange={(leadTimeConfig) => props.onParamsChange({ leadTimeConfig })} />
        )}

        <div className="inv-grid-2">
          <Field label={t('reviewPeriodShort')} lock={lock('reviewPeriod')} t={t}>
            {perProduct('reviewPeriod') ? <FromFile t={t} /> : (
              <select className="ops-select" value={params.reviewPeriod} disabled={fixed('reviewPeriod')} onChange={(event) => props.onParamsChange({ reviewPeriod: parseInt(event.target.value, 10) })}>
                {/* A period read from the file that is not one of the four choices is still shown. */}
                {[...new Set([...REVIEW_PERIODS, params.reviewPeriod])].sort((a, b) => a - b).map((days) => (
                  <option key={days} value={days}>{daysLabel(days, t)}</option>
                ))}
              </select>
            )}
          </Field>
          {/* How often to order: a whole number of reviews, shown in days. It sets the order size, the gap between s and S. */}
          <Field label={t('orderInterval')} lock={undefined} t={t}>
            {perProduct('reviewPeriod') ? (
              <select className="ops-select" value={params.orderInterval} title={t('orderIntervalHint')} onChange={(event) => props.onParamsChange({ orderInterval: parseInt(event.target.value, 10) })}>
                {/* The review period R differs per product, so the interval cannot be given in days here. */}
                {[...new Set([...ORDER_INTERVALS, params.orderInterval])].sort((a, b) => a - b).map((reviews) => (
                  <option key={reviews} value={reviews}>{`${t.format.number(reviews, 0, 0)} × R`}</option>
                ))}
              </select>
            ) : (
              <select className="ops-select" value={params.orderInterval} title={t('orderIntervalHint')} onChange={(event) => props.onParamsChange({ orderInterval: parseInt(event.target.value, 10) })}>
                {[...new Set([...ORDER_INTERVALS, params.orderInterval])].sort((a, b) => a - b).map((reviews) => (
                  <option key={reviews} value={reviews}>{daysLabel(reviews * params.reviewPeriod, t)}</option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {/* How strongly a day's forecast error carries over into the next day. */}
        <Field label={t('errorPersistence')} lock={undefined} t={t}>
          <select className="ops-select" value={params.errorPersistence} title={t('errorPersistenceHint')} onChange={(event) => props.onParamsChange({ errorPersistence: parseFloat(event.target.value) })}>
            {[...new Set([...ERROR_PERSISTENCE, params.errorPersistence, ...(props.reportPersistence != null ? [props.reportPersistence] : [])])].sort((a, b) => a - b).map((share) => (
              <option key={share} value={share}>
                {share === props.reportPersistence ? t('persistenceFromReport') : PERSISTENCE_LABEL[share] ? t(PERSISTENCE_LABEL[share]) : t('persistenceOwn')}
                {share > 0 || share === props.reportPersistence ? ` (${t.format.number(share, 0, 2)})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <div className="ops-field">
          <span>
            {upper(t('targetServiceLevel'))}
            <LockMark lock={lock('serviceLevel')} t={t} />
            {!perProduct('serviceLevel') && <b className="inv-field-value">{t.format.fixed(params.serviceLevel * 100, 1)}%</b>}
          </span>
          {perProduct('serviceLevel') ? <FromFile t={t} /> : (
            <Slider
              value={Math.round(params.serviceLevel * 1000) / 10}
              min={SERVICE_LEVEL.min}
              max={SERVICE_LEVEL.max}
              step={SERVICE_LEVEL.step}
              presets={SERVICE_LEVEL.presets}
              format={(value) => `${t.format.number(value, 0, 1)}%`}
              disabled={fixed('serviceLevel')}
              ariaLabel={t('targetServiceLevel')}
              onChange={(value) => props.onParamsChange({ serviceLevel: value / 100 })}
            />
          )}
        </div>
      </section>
    </>
  );
}
