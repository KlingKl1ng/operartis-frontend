import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CircleCheck, Lock, Plus, Trash2, Upload } from 'lucide-react';
import { SectionLabel, Segmented } from '../../../app-shared/ui';
import { leadTimeProbabilitySum, leadTimeValuesValid, REVIEW_PERIODS, SAFETY_FACTOR, SERVICE_LEVEL } from '../domain/params';
import { targetReached } from '../domain/summary';
import type { LeadTimeConfig, LeadTimeType, OptimizationResult, Params, SimulationMode } from '../domain/types';
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

function Field({ label, locked, lockedLabel, children }: { label: string; locked?: boolean; lockedLabel?: string; children: ReactNode }) {
  return (
    <label className="ops-field">
      <span>
        {upper(label)}
        {locked && <Lock size={10} aria-label={lockedLabel} />}
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

function LeadTimeEditor({ config, onChange, disabled, t }: { config: LeadTimeConfig; onChange: (config: LeadTimeConfig) => void; disabled: boolean; t: Translator }) {
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
        {disabled && <Lock size={10} aria-label={t('locked')} />}
      </div>
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

      {config.type === 'poisson' && (
        <Field label="λ">
          <NumberField value={config.poissonLambda} min={0.1} step={0.5} disabled={disabled} onCommit={(poissonLambda) => set({ poissonLambda })} />
        </Field>
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

const REVIEW_LABEL: Record<number, TextKey> = { 1: 'daily', 7: 'weekly', 14: 'biWeekly', 30: 'monthly' };

export interface SidebarProps {
  t: Translator;
  filename: string | null;
  productCount: number;
  forecastDays: number;
  onUpload: () => void;
  busy: boolean;
  mode: SimulationMode;
  onModeChange: (mode: SimulationMode) => void;
  skus: string[];
  currentSku: string | null;
  onSelectSku: (sku: string) => void;
  params: Params;
  onParamsChange: (patch: Partial<Params>) => void;
  locked: { initialStock: boolean; leadTime: boolean; reviewPeriod: boolean; moq: boolean; serviceLevel: boolean };
  result: OptimizationResult | null;
}

export function Sidebar(props: SidebarProps) {
  const { t, params, locked, mode, skus, currentSku, result } = props;
  const anyLocked = Object.values(locked).some(Boolean);
  const index = currentSku ? skus.indexOf(currentSku) : -1;
  const step = (direction: number) => {
    if (!skus.length || index < 0) return;
    props.onSelectSku(skus[(index + direction + skus.length) % skus.length]);
  };

  return (
    <>
      <section>
        <SectionLabel>{t('dataSource')}</SectionLabel>
        <div className="inv-source-card">
          {props.filename ? (
            <>
              <strong title={props.filename}>{props.filename}</strong>
              <span className="inv-source-meta">
                {t.format.number(props.productCount, 0, 0)} {t('products')} · {t.format.number(props.forecastDays, 0, 0)} {t('days')}
              </span>
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

      <section>
        <SectionLabel>{t('interface')}</SectionLabel>
        <Segmented
          value={mode}
          onChange={props.onModeChange}
          disabled={props.busy}
          options={[{ value: 'optimize', label: t('optimizeMode') }, { value: 'whatif', label: t('whatIfMode') }]}
        />
        <p className="inv-hint">{t(mode === 'optimize' ? 'optimizeModeDesc' : 'whatIfModeDesc')}</p>
      </section>

      {skus.length > 1 && (
        <section>
          <SectionLabel>{t('skuNavigator')}</SectionLabel>
          <div className="inv-product-picker">
            <button className="ops-icon-button" type="button" onClick={() => step(-1)} aria-label={t('previousProduct')} title={t('previousProduct')}><ChevronLeft size={16} /></button>
            <select className="ops-select" value={currentSku || ''} onChange={(event) => props.onSelectSku(event.target.value)} aria-label={t('product')}>
              {skus.map((sku) => <option key={sku} value={sku}>{sku}</option>)}
            </select>
            <button className="ops-icon-button" type="button" onClick={() => step(1)} aria-label={t('nextProduct')} title={t('nextProduct')}><ChevronRight size={16} /></button>
          </div>
          <p className="inv-hint is-centered">{t('productOf', t.format.number(index + 1, 0, 0), t.format.number(skus.length, 0, 0))}</p>
        </section>
      )}

      <section>
        <SectionLabel>{t('parameters')}</SectionLabel>
        <div className="inv-policy-pill">{t('stochasticPolicy')}</div>
        <div className="inv-grid-2">
          <Field label={t('initialStock')} locked={locked.initialStock} lockedLabel={t('locked')}>
            <NumberField value={params.initialStock} min={0} disabled={locked.initialStock} onCommit={(initialStock) => props.onParamsChange({ initialStock })} />
          </Field>
          <Field label={t('minOrderQty')} locked={locked.moq} lockedLabel={t('locked')}>
            <NumberField value={params.moqValue} min={0} disabled={locked.moq} onCommit={(moqValue) => props.onParamsChange({ moqValue })} />
          </Field>
        </div>

        <LeadTimeEditor config={params.leadTimeConfig} disabled={locked.leadTime} t={t} onChange={(leadTimeConfig) => props.onParamsChange({ leadTimeConfig })} />

        <Field label={t('reviewPeriod')} locked={locked.reviewPeriod} lockedLabel={t('locked')}>
          <select className="ops-select" value={params.reviewPeriod} disabled={locked.reviewPeriod} onChange={(event) => props.onParamsChange({ reviewPeriod: parseInt(event.target.value, 10) })}>
            {/* A period read from the file that is not one of the four choices is still shown. */}
            {[...new Set([...REVIEW_PERIODS, params.reviewPeriod])].sort((a, b) => a - b).map((days) => (
              <option key={days} value={days}>{REVIEW_LABEL[days] ? t(REVIEW_LABEL[days]) : `${t.format.number(days, 0, 0)} ${t('days')}`}</option>
            ))}
          </select>
        </Field>

        <div className="ops-field">
          <span>
            {upper(t('targetServiceLevel'))}
            {locked.serviceLevel && <Lock size={10} aria-label={t('locked')} />}
            <b className="inv-field-value">{t.format.fixed(params.serviceLevel * 100, 1)}%</b>
          </span>
          <Slider
            value={Math.round(params.serviceLevel * 1000) / 10}
            min={SERVICE_LEVEL.min}
            max={SERVICE_LEVEL.max}
            step={SERVICE_LEVEL.step}
            presets={SERVICE_LEVEL.presets}
            format={(value) => `${t.format.number(value, 0, 1)}%`}
            disabled={locked.serviceLevel}
            ariaLabel={t('targetServiceLevel')}
            onChange={(value) => props.onParamsChange({ serviceLevel: value / 100 })}
          />
        </div>

        {mode === 'whatif' && (
          <div className="ops-field">
            <span>
              {t('safetyFactor')}
              <b className="inv-field-value">{t.format.fixed(params.safetyFactor, 1)}×</b>
            </span>
            <Slider
              value={params.safetyFactor}
              min={SAFETY_FACTOR.min}
              max={SAFETY_FACTOR.max}
              step={SAFETY_FACTOR.step}
              presets={SAFETY_FACTOR.presets}
              format={(value) => `${t.format.number(value, 0, 1)}×`}
              ariaLabel={t('safetyFactor')}
              onChange={(safetyFactor) => props.onParamsChange({ safetyFactor })}
            />
          </div>
        )}

        {anyLocked && <p className="inv-hint inv-lock-hint"><Lock size={11} /> {t('lockedHint')}</p>}
      </section>

      {mode === 'optimize' && result && (
        <section>
          <SectionLabel>{t('result')}</SectionLabel>
          <div className="inv-result-card">
            <div className="inv-result-title">
              <CircleCheck size={15} />
              {t(result.convergenceAchieved ? 'optimalPolicyFound' : 'bestPolicyFound')}
            </div>
            <dl>
              <div><dt>{t('targetAlpha')}</dt><dd>{t.format.number(result.targetAlpha * 100, 0, 2)}%</dd></div>
              <div>
                <dt>{t('achievedAlpha')}</dt>
                <dd className={targetReached(result) ? 'is-good' : 'is-warn'}>{t.format.fixed(result.achievedAlpha * 100, 1)}%</dd>
              </div>
              <div><dt>{t('achievedBeta')}</dt><dd>{t.format.fixed(result.achievedBeta * 100, 1)}%</dd></div>
              <div className="is-divided"><dt>{t('safetyFactor')}</dt><dd>{t.format.fixed(result.optimalSafetyFactor, 2)}×</dd></div>
              <div><dt>{t('avgReorderPoint')}</dt><dd>{t.format.fixed(result.avgSt, 1)}</dd></div>
              <div><dt>{t('avgOrderUpTo')}</dt><dd>{t.format.fixed(result.avgST, 1)}</dd></div>
              {result.mcAvgInventory != null && <div><dt>{t('avgInv')}</dt><dd>{t.format.number(result.mcAvgInventory, 0, 0)}</dd></div>}
              {result.mcAvgStockoutDays != null && <div><dt>{t('avgStockoutDays')}</dt><dd>{t.format.fixed(result.mcAvgStockoutDays, 1)}</dd></div>}
            </dl>
            <p>{t('foundInIterations', t.format.number(result.iterationsUsed, 0, 0))}</p>
          </div>
        </section>
      )}
    </>
  );
}
