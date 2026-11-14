import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Pause, Play, RefreshCw, SkipBack, StepForward, TriangleAlert } from 'lucide-react';
import { Segmented } from '../../../app-shared/ui';
import { singleRunBand } from '../domain/summary';
import type { SimResult, TimelineDay } from '../domain/types';
import type { TextKey, Translator } from '../i18n';
import { label as upper } from './Label';

// Series colours, checked for colour-blind separation and contrast on both
// surfaces. Red is kept for shortages; demand is a neutral backdrop.
const SERIES = {
  light: { inventoryPosition: '#2a78d6', s_t: '#eb6834', arrival: '#1baf7a', inventory: '#eda100', S_t: '#6250d6', demand: '#94a3b8', shortage: '#dc2626', grid: '#e2e8f0', axis: '#64748b', surface: '#ffffff' },
  dark: { inventoryPosition: '#3987e5', s_t: '#d95926', arrival: '#199e70', inventory: '#c98500', S_t: '#9085e9', demand: '#64748b', shortage: '#f87171', grid: '#334155', axis: '#94a3b8', surface: '#0f172a' },
} as const;

type SeriesKey = 'inventory' | 'inventoryPosition' | 'S_t' | 's_t' | 'demand' | 'arrival' | 'backlogNeg';

const LEGEND: Array<{ key: SeriesKey; label: TextKey; color: keyof typeof SERIES.light; shape: 'line' | 'dash' | 'bar' | 'area' }> = [
  { key: 'inventory', label: 'onHand', color: 'inventory', shape: 'line' },
  { key: 'inventoryPosition', label: 'invPosition', color: 'inventoryPosition', shape: 'dash' },
  { key: 'S_t', label: 'targetSt', color: 'S_t', shape: 'dash' },
  { key: 's_t', label: 'reorderSt', color: 's_t', shape: 'dash' },
  { key: 'demand', label: 'demand', color: 'demand', shape: 'bar' },
  { key: 'arrival', label: 'orderArrival', color: 'arrival', shape: 'bar' },
  { key: 'backlogNeg', label: 'backlog', color: 'shortage', shape: 'area' },
];

/** The simulated days up to "now", with the policy levels of the days still to come shown faintly. */
function LiveChart({ timeline, currentDay, dark, t }: { timeline: TimelineDay[]; currentDay: number; dark: boolean; t: Translator }) {
  const [picked, setPicked] = useState<Set<SeriesKey>>(new Set());
  const colors = dark ? SERIES.dark : SERIES.light;
  const shown = (key: SeriesKey) => picked.size === 0 || picked.has(key);
  const opacity = (key: SeriesKey, normal = 1) => (shown(key) ? normal : 0.12);

  const data = useMemo(() => timeline.map((day, index) => (index <= currentDay ? {
    date: day.date,
    isReviewDay: day.isReviewDay,
    inventory: day.invAfterDemand,
    inventoryPosition: day.inventoryPosition,
    s_t: day.s_t,
    S_t: day.S_t,
    demand: day.actualDemand,
    arrival: day.arrivedQty > 0 ? day.arrivedQty : null,
    // Unfilled demand is drawn below the zero line.
    backlogNeg: day.backlog > 0 ? -day.backlog : null,
    stockout: day.stockoutEvent ? day.invAfterDemand : null,
  } : { date: day.date, s_t_future: day.s_t, S_t_future: day.S_t })), [timeline, currentDay]);

  const toggle = (key: SeriesKey) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className="inv-chart">
      <div className="inv-legend" role="group" aria-label={t('liveInventorySimulation')}>
        {LEGEND.map((item) => (
          <button key={item.key} type="button" className={picked.has(item.key) ? 'is-picked' : picked.size ? 'is-faded' : ''} aria-pressed={picked.has(item.key)} onClick={() => toggle(item.key)}>
            <i className={`inv-swatch is-${item.shape}`} style={{ color: colors[item.color] }} aria-hidden="true" />
            {t(item.label)}
          </button>
        ))}
        <span className="inv-legend-note"><i className="inv-swatch is-dot" style={{ color: colors.shortage }} aria-hidden="true" />{t('stockoutQuestion').replace('?', '')}</span>
      </div>
      <div className="inv-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="inv-on-hand-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.inventory} stopOpacity={0.28} />
                <stop offset="95%" stopColor={colors.inventory} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} strokeOpacity={0.6} />
            <XAxis dataKey="date" tickFormatter={(value) => t.format.date(value)} tick={{ fontSize: 10, fill: colors.axis }} minTickGap={50} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(value) => t.format.number(value, 0, 0)} tick={{ fontSize: 10, fill: colors.axis }} axisLine={false} tickLine={false} width={52} />
            <ReferenceLine y={0} stroke={colors.axis} strokeWidth={1} />
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as { isReviewDay?: boolean; stockout?: number | null };
                const rows = payload.filter((entry) => entry.value != null && entry.dataKey !== 'stockout' && !String(entry.dataKey).endsWith('_future'));
                return (
                  <div className="inv-tooltip">
                    <strong>
                      {t.format.date(label)}
                      {point?.isReviewDay && <span className="ops-pill is-gold">{t('reviewDay')}</span>}
                    </strong>
                    {point?.stockout != null && <p className="inv-tooltip-alert"><TriangleAlert size={12} /> {t('stockout')}</p>}
                    {rows.map((entry) => (
                      <p key={String(entry.dataKey)}>
                        <i style={{ background: entry.color }} />
                        <span>{entry.name}</span>
                        <b>{t.format.number(Math.abs(Number(entry.value)), 0, 0)}</b>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Line type="stepAfter" dataKey="S_t_future" stroke={colors.S_t} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={opacity('S_t', 0.35)} dot={false} legendType="none" isAnimationActive={false} />
            <Line type="stepAfter" dataKey="s_t_future" stroke={colors.s_t} strokeWidth={1} strokeDasharray="4 4" strokeOpacity={opacity('s_t', 0.35)} dot={false} legendType="none" isAnimationActive={false} />
            <Bar dataKey="demand" fill={colors.demand} fillOpacity={opacity('demand', 0.55)} barSize={4} radius={[2, 2, 0, 0]} name={t('demand')} isAnimationActive={false} />
            <Bar dataKey="arrival" fill={colors.arrival} fillOpacity={opacity('arrival', 0.9)} barSize={6} radius={[2, 2, 0, 0]} name={t('orderArrival')} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="S_t" stroke={colors.S_t} strokeWidth={2} strokeDasharray="6 4" strokeOpacity={opacity('S_t')} dot={false} name={t('targetSt')} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="s_t" stroke={colors.s_t} strokeWidth={2} strokeDasharray="2 3" strokeOpacity={opacity('s_t')} dot={false} name={t('reorderSt')} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="inventoryPosition" stroke={colors.inventoryPosition} strokeWidth={2} strokeDasharray="10 4" strokeOpacity={opacity('inventoryPosition')} dot={false} name={t('invPosition')} isAnimationActive={false} />
            <Area type="stepAfter" dataKey="inventory" stroke={colors.inventory} strokeWidth={2.5} strokeOpacity={opacity('inventory')} fill="url(#inv-on-hand-fill)" fillOpacity={shown('inventory') ? 1 : 0} dot={false} name={t('onHand')} isAnimationActive={false} />
            <Area type="stepAfter" dataKey="backlogNeg" stroke={colors.shortage} strokeWidth={1.5} strokeOpacity={opacity('backlogNeg')} fill={colors.shortage} fillOpacity={opacity('backlogNeg', 0.25)} dot={false} name={t('backlog')} isAnimationActive={false} />
            <Line dataKey="stockout" stroke="none" dot={{ r: 5, fill: colors.shortage, stroke: colors.surface, strokeWidth: 2 }} activeDot={false} legendType="none" isAnimationActive={false} />
            {timeline[currentDay] && (
              <ReferenceLine x={timeline[currentDay].date} stroke={colors.axis} strokeDasharray="3 3" label={{ value: t('now'), position: 'top', fontSize: 9, fontWeight: 700, fill: colors.axis }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Today's figures as six tiles. */
function DayTiles({ day, t }: { day: TimelineDay; t: Translator }) {
  const whole = (value: number) => t.format.number(value, 0, 0);
  const onHandState = day.invAfterDemand <= 0 ? 'bad' : day.invAfterDemand <= day.s_t ? 'warn' : 'good';
  return (
    <div className={`inv-day-tiles ${day.stockoutEvent ? 'has-stockout' : ''}`}>
      <div className={`inv-tile is-${onHandState}`}>
        <span>{t('onHand')}</span>
        <strong>{whole(day.invAfterDemand)}</strong>
        {day.stockoutEvent && <small><TriangleAlert size={11} /> {t('stockout')}</small>}
      </div>
      <div className="inv-tile">
        <span>{t('demand')}</span>
        <strong>−{whole(day.actualDemand)}</strong>
      </div>
      <div className={`inv-tile ${day.arrivedQty > 0 ? 'is-arrival' : 'is-idle'}`}>
        <span>{t('arrived')}</span>
        <strong>{day.arrivedQty > 0 ? `+${whole(day.arrivedQty)}` : '—'}</strong>
      </div>
      <div className={`inv-tile ${day.inTransit > 0 ? '' : 'is-idle'}`}>
        <span>{t('inTransit')}</span>
        <strong>{day.inTransit > 0 ? whole(day.inTransit) : '—'}</strong>
        {day.pipelineOrders.length > 0 && <small>{whole(day.pipelineOrders.length)} {t('orders')}</small>}
      </div>
      <div className={`inv-tile ${day.inventoryPosition < day.s_t ? 'is-below' : ''}`} title={t('onHandFormula')}>
        <span>{t('invPosition')}</span>
        <strong>{whole(day.inventoryPosition)}</strong>
      </div>
      <div className={`inv-tile ${day.backlog > 0 ? 'is-bad' : 'is-idle'}`}>
        <span>{t('backlog')}</span>
        <strong>{day.backlog > 0 ? whole(day.backlog) : '—'}</strong>
        {day.backlog > 0 && <small>{t('unfulfilled')}</small>}
      </div>
    </div>
  );
}

const COLUMN_WIDTH = 92;
const LABEL_WIDTH = 168;

/** Every day of the run as a column; the current day stays in view. */
function StatTable({ timeline, currentDay, t }: { timeline: TimelineDay[]; currentDay: number; t: Translator }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const visible = element.clientWidth - LABEL_WIDTH;
    element.scrollLeft = Math.max(0, currentDay * COLUMN_WIDTH - (visible / 2 - COLUMN_WIDTH / 2));
  }, [currentDay]);

  const whole = (value: number | undefined) => (value == null ? '—' : t.format.number(value, 0, 0));
  const positive = (value: number) => (value > 0 ? whole(value) : '—');
  const rows: Array<{ label: TextKey; cell: (day: TimelineDay) => string; flag?: (day: TimelineDay) => string }> = [
    { label: 'reorderPoint', cell: (day) => whole(day.s_t) },
    { label: 'orderUpTo', cell: (day) => whole(day.S_t) },
    { label: 'demand', cell: (day) => whole(day.actualDemand) },
    { label: 'orderPlaced', cell: (day) => (day.orderPlaced ? `✓ ${whole(day.orderPlaced.qty ?? day.orderPlaced.quantity)}` : '—'), flag: (day) => (day.orderPlaced ? 'is-good' : '') },
    { label: 'arrivedOrders', cell: (day) => positive(day.arrivedQty), flag: (day) => (day.arrivedQty > 0 ? 'is-good' : '') },
    { label: 'invPosition', cell: (day) => whole(day.inventoryPosition) },
    { label: 'onHand', cell: (day) => whole(day.invAfterDemand) },
    { label: 'inTransit', cell: (day) => positive(day.inTransit) },
    { label: 'backlog', cell: (day) => positive(day.backlog), flag: (day) => (day.backlog > 0 ? 'is-bad' : '') },
    { label: 'stockoutQuestion', cell: (day) => (day.stockoutEvent ? `⚠ ${t('yes')}` : '—'), flag: (day) => (day.stockoutEvent ? 'is-bad' : '') },
    { label: 'reviewDayQuestion', cell: (day) => (day.isReviewDay ? `● ${t('yes')}` : '—'), flag: (day) => (day.isReviewDay ? 'is-gold' : '') },
  ];

  return (
    <div className="inv-stat-scroll ops-scroller" ref={scroller}>
      <table className="inv-stat-table">
        <thead>
          <tr>
            <th>{t('parameterDate')}</th>
            {timeline.map((day, index) => (
              <th key={index} className={index === currentDay ? 'is-now' : index < currentDay ? 'is-past' : ''}>
                <span>{t('day')} {index + 1}</span>
                {t.format.date(day.date)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th>{t(row.label)}</th>
              {timeline.map((day, index) => (
                <td key={index} className={`${row.flag?.(day) || ''} ${index === currentDay ? 'is-now' : ''}`}>{row.cell(day)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SPEEDS = [{ ms: 1000, label: '0.5' }, { ms: 500, label: '1' }, { ms: 200, label: '2' }, { ms: 100, label: '5' }, { ms: 50, label: '10' }];

export interface ProductViewProps {
  t: Translator;
  dark: boolean;
  sku: string;
  canStep: boolean;
  onStep: (direction: number) => void;
  result: SimResult | null;
  running: boolean;
  onReload: () => void;
  reloading: boolean;
}

/** One product: today's figures, the run as a chart or table, and playback. */
export function ProductView({ t, dark, sku, canStep, onStep, result, running, onReload, reloading }: ProductViewProps) {
  const [currentDay, setCurrentDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(200);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const timeline = result?.timeline;
  const days = timeline?.length || 0;

  // A new run or another product starts again from day 1.
  useEffect(() => {
    setCurrentDay(0);
    setPlaying(false);
  }, [timeline]);

  useEffect(() => {
    if (!playing || days === 0) return;
    const timer = window.setInterval(() => {
      setCurrentDay((day) => {
        if (day >= days - 1) {
          setPlaying(false);
          return day;
        }
        return day + 1;
      });
    }, speed);
    return () => window.clearInterval(timer);
  }, [playing, speed, days]);

  const heading = (
    <div className="inv-product-name">
      {canStep && <button className="ops-icon-button inv-small-icon" type="button" onClick={() => onStep(-1)} aria-label={t('previousProduct')}><ChevronLeft size={14} /></button>}
      <h2 title={sku}>{sku}</h2>
      {canStep && <button className="ops-icon-button inv-small-icon" type="button" onClick={() => onStep(1)} aria-label={t('nextProduct')}><ChevronRight size={14} /></button>}
    </div>
  );

  if (!timeline || days === 0) {
    return (
      <div className="inv-product">
        <div className="inv-product-head">{heading}</div>
        <div className="inv-product-empty ops-card">
          <strong>{running ? t('statusSimulating') : t('readyToSimulate')}</strong>
          {!running && <p>{t('loadDataPrompt')}</p>}
        </div>
      </div>
    );
  }

  const day = timeline[Math.min(currentDay, days - 1)];
  const metrics = result?.metrics;
  const share = (label: TextKey, value: number | null | undefined) => (value == null ? null : (
    <div key={label}>
      <span>{upper(t(label))}</span>
      <strong><i className={`inv-dot is-${singleRunBand(value)}`} aria-hidden="true" />{t.format.fixed(value * 100, 1)}%</strong>
    </div>
  ));

  return (
    <div className="inv-product">
      <div className="inv-product-head">
        {heading}
        <span className="inv-product-date">{t.format.date(day.date)} · <b>{t('day')} {t.format.number(currentDay + 1, 0, 0)}</b></span>
        {metrics && (
          <div className="inv-run-metrics">
            {share('alphaFull', metrics.alpha)}
            {share('betaFull', metrics.beta)}
            {share('alphaSteady', metrics.alpha_steady)}
            {share('betaSteady', metrics.beta_steady)}
            <div><span>{t('avgInv')}</span><strong>{t.format.number(metrics.avgInventory, 0, 0)}</strong></div>
          </div>
        )}
      </div>

      {Boolean(metrics?.warmup_stockout_days) && (
        <p className="inv-warning"><TriangleAlert size={13} /> {t('warmupStockoutWarning', metrics!.warmup_stockout_days!, metrics!.warmup_days || 21)}</p>
      )}

      <DayTiles day={day} t={t} />

      <div className="inv-run-card ops-card">
        <div className="inv-run-card-head">
          <h3>{t(view === 'chart' ? 'liveInventorySimulation' : 'statisticalLiveTable')}</h3>
          <span>{t.format.number(days, 0, 0)} {t('periods')}</span>
          <Segmented value={view} onChange={setView} options={[{ value: 'chart', label: t('chart') }, { value: 'table', label: t('table') }]} ariaLabel={t('view')} />
        </div>
        {view === 'chart'
          ? <LiveChart timeline={timeline} currentDay={currentDay} dark={dark} t={t} />
          : <StatTable timeline={timeline} currentDay={currentDay} t={t} />}
      </div>

      <div className="inv-playback ops-card">
        <button className="ops-icon-button" type="button" onClick={onReload} disabled={reloading} title={t('reload')} aria-label={t('reload')}>
          <RefreshCw size={15} className={reloading ? 'inv-spin' : ''} />
        </button>
        <button className="ops-icon-button" type="button" onClick={() => { setCurrentDay(0); setPlaying(false); }} title={t('resetToDay1')} aria-label={t('resetToDay1')}><SkipBack size={15} /></button>
        <button className="ops-icon-button inv-play" type="button" onClick={() => setPlaying(!playing)} title={t(playing ? 'pause' : 'play')} aria-label={t(playing ? 'pause' : 'play')}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="ops-icon-button" type="button" onClick={() => setCurrentDay((value) => Math.min(value + 1, days - 1))} disabled={currentDay >= days - 1} title={t('stepForward')} aria-label={t('stepForward')}><StepForward size={15} /></button>
        <input type="range" min={0} max={Math.max(1, days - 1)} value={currentDay} disabled={days < 2} aria-label={t('day')} onChange={(event) => setCurrentDay(parseInt(event.target.value, 10))} />
        <span className="inv-playback-day">{t('day')} {t.format.number(currentDay + 1, 0, 0)} / {t.format.number(days, 0, 0)}</span>
        <label className="inv-playback-speed">
          <span>{t('speed')}</span>
          <select className="ops-select" value={speed} onChange={(event) => setSpeed(parseInt(event.target.value, 10))}>
            {SPEEDS.map((item) => <option key={item.ms} value={item.ms}>{t.format.number(Number(item.label), 0, 1)}×</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
