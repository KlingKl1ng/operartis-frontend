import { useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../../../app-shared/ui';
import { PARAM_COLUMN_KEYS, type FormatType, type LockState, type Mapping, type ParamColumnKey } from '../domain/types';
import type { TextKey, Translator } from '../i18n';
import { mappingComplete } from '../parsing/mapping';

const FORMAT_NAME: Record<FormatType, TextKey> = {
  operartis_residual: 'formatOperartis',
  forecaster_prefixed: 'formatQuantile',
  forecaster: 'formatForecaster',
  horizontal: 'formatHorizontal',
  vertical: 'formatVertical',
};

const PARAM_LABEL: Record<ParamColumnKey, TextKey> = {
  initial_stock: 'initialStock',
  lead_time_mean: 'leadTimeDays',
  lead_time_std: 'leadTime',
  review_period: 'reviewPeriod',
  min_order_qty: 'minOrderQty',
  target_service_level: 'targetServiceLevel',
};

const P90_FACTORS = [1.2, 1.3, 1.4, 1.5];

/**
 * Shown after a file is chosen: what layout was recognised, which columns
 * feed the forecast, and which parameters to take from the file.
 */
export function MappingDialog({
  headers,
  initial,
  initialLocks,
  onConfirm,
  onClose,
  t,
}: {
  headers: string[];
  initial: Mapping;
  initialLocks: LockState;
  onConfirm: (mapping: Mapping, locks: LockState) => void;
  onClose: () => void;
  t: Translator;
}) {
  const [mapping, setMapping] = useState(initial);
  const [locks, setLocks] = useState(initialLocks);
  const set = (patch: Partial<Mapping>) => setMapping((current) => ({ ...current, ...patch }));
  const recognised = mapping.format !== 'vertical';
  const anyParameter = PARAM_COLUMN_KEYS.some((key) => mapping[key]);

  const columnSelect = (value: string | undefined, onChange: (column: string) => void, emptyLabel: TextKey) => (
    <select className="ops-select" value={value || ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t(emptyLabel)}</option>
      {headers.map((header) => <option key={header} value={header}>{header}</option>)}
    </select>
  );

  const tile = (label: string, value: string | number, ok = true) => (
    <div className="inv-map-tile">
      <span>{label}</span>
      <strong>{ok ? value : '—'}</strong>
    </div>
  );

  return (
    <Modal
      title={recognised ? `${t(FORMAT_NAME[mapping.format])} · ${t('detected')}` : t('mapColumns')}
      badge={recognised ? <span className="ops-pill is-gold">{t('auto')}</span> : undefined}
      onClose={onClose}
      closeLabel={t('close')}
      footer={(
        <>
          <button className="ops-button is-quiet" type="button" onClick={onClose}>{t('cancel')}</button>
          <button className="ops-button is-primary" type="button" disabled={!mappingComplete(mapping)} onClick={() => onConfirm(mapping, locks)}>
            {t(anyParameter ? 'confirmLoadParams' : 'confirm')}
          </button>
        </>
      )}
    >
      <div className="inv-map">
        {mapping.format === 'operartis_residual' && (
          <>
            <div className="inv-map-banner"><Check size={15} /> {t('operartisForecastDetected')}</div>
            <div className="inv-map-tiles">
              {tile(t('skuColumn'), '✓', Boolean(mapping.sku_id))}
              {tile(t('residStdLabel'), '✓', Boolean(mapping.resid_std))}
              {tile(t('dateColumnsLabel'), t.format.number(mapping.date_columns?.length || 0, 0, 0))}
            </div>
            <label className="ops-field"><span>{t('skuColumn')}</span>{columnSelect(mapping.sku_id, (sku_id) => set({ sku_id }), 'select')}</label>
            <label className="ops-field"><span>{t('residStdColumn')}</span>{columnSelect(mapping.resid_std, (resid_std) => set({ resid_std }), 'select')}</label>
            <label className="ops-field">
              <span>{t('forecastHorizonDays')}</span>
              <input
                className="ops-input"
                type="number"
                min={1}
                max={mapping.date_columns?.length || 1}
                value={mapping.forecast_horizon || ''}
                onChange={(event) => {
                  const horizon = Math.max(1, Math.min(parseInt(event.target.value, 10) || 1, mapping.date_columns?.length || 1));
                  set({ forecast_horizon: horizon, forecast_columns: (mapping.date_columns || []).slice(-horizon) });
                }}
              />
            </label>
            <p className="inv-hint">{t('lastDaysAsForecast', t.format.number(mapping.forecast_horizon || 0, 0, 0))} {t('forecastHorizonTip')}</p>
          </>
        )}

        {(mapping.format === 'forecaster_prefixed' || mapping.format === 'horizontal') && (
          <>
            <div className="inv-map-banner"><Check size={15} /> {t('p50P90Detected')}</div>
            <p className="inv-hint">{t(mapping.format === 'forecaster_prefixed' ? 'formatP50P90' : 'dayColumnsFormat')}</p>
            <div className="inv-map-tiles">
              {tile(t('p50Columns'), t.format.number(mapping.p50_columns?.length || 0, 0, 0))}
              {tile(t('p90Columns'), t.format.number(mapping.p90_columns?.length || 0, 0, 0))}
            </div>
            <label className="ops-field"><span>{t('skuIdColumn')}</span>{columnSelect(mapping.sku_id, (sku_id) => set({ sku_id }), 'select')}</label>
            {mapping.format === 'horizontal' && (
              <label className="ops-field"><span>{t('startDateColumn')}</span>{columnSelect(mapping.start_date, (start_date) => set({ start_date }), 'notMapped')}</label>
            )}
          </>
        )}

        {mapping.format === 'forecaster' && (
          <>
            <div className="inv-map-banner"><Check size={15} /> {t('dateColumnsFormat')}</div>
            <div className="inv-map-tiles">
              {tile(t('dateColumnsLabel'), t.format.number(mapping.date_columns?.length || 0, 0, 0))}
              {tile('P90', `P50 × ${t.format.number(mapping.p90_variance_factor || 1.3, 0, 1)}`)}
            </div>
            <label className="ops-field"><span>{t('skuIdColumn')}</span>{columnSelect(mapping.sku_id, (sku_id) => set({ sku_id }), 'select')}</label>
            <div className="ops-field">
              <span>{t('p90Factor')}</span>
              <div className="ops-segmented">
                {P90_FACTORS.map((factor) => (
                  <button key={factor} type="button" className={(mapping.p90_variance_factor || 1.3) === factor ? 'is-active' : ''} onClick={() => set({ p90_variance_factor: factor })}>
                    {t.format.number(factor, 0, 1)}×
                  </button>
                ))}
              </div>
            </div>
            <p className="inv-hint">{t('p90Estimated', t.format.number(mapping.p90_variance_factor || 1.3, 0, 1))}</p>
          </>
        )}

        {mapping.format === 'vertical' && (
          <>
            <h3 className="inv-map-heading">{t('requiredColumns')}</h3>
            <div className="inv-map-grid">
              <label className="ops-field"><span>{t('skuIdColumn')}</span>{columnSelect(mapping.sku_id, (sku_id) => set({ sku_id }), 'notMapped')}</label>
              <label className="ops-field"><span>{t('dateColumn')} *</span>{columnSelect(mapping.date, (date) => set({ date }), 'select')}</label>
              <label className="ops-field"><span>{t('p50Column')} *</span>{columnSelect(mapping.p50, (p50) => set({ p50 }), 'select')}</label>
              <label className="ops-field"><span>{t('p90Column')} *</span>{columnSelect(mapping.p90, (p90) => set({ p90 }), 'select')}</label>
            </div>
          </>
        )}

        <h3 className="inv-map-heading">{t('optionalParameters')}</h3>
        <p className="inv-hint">{t('lockedOnSidebar')} · {t('uncheckToEdit')}</p>
        <div className="inv-map-params">
          {PARAM_COLUMN_KEYS.map((key) => (
            <div className="inv-map-param" key={key}>
              <label className="inv-map-lock" title={t(locks[key] ? 'locked' : 'editable')}>
                <input
                  type="checkbox"
                  checked={Boolean(locks[key])}
                  disabled={!mapping[key]}
                  onChange={(event) => setLocks((current) => ({ ...current, [key]: event.target.checked }))}
                />
                <span>{t(PARAM_LABEL[key])}{key === 'lead_time_std' ? ' (σ)' : ''}</span>
              </label>
              {columnSelect(mapping[key], (column) => {
                set({ [key]: column } as Partial<Mapping>);
                // A newly mapped parameter is taken from the file; an unmapped one cannot be.
                setLocks((current) => ({ ...current, [key]: Boolean(column) }));
              }, 'notMapped')}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
