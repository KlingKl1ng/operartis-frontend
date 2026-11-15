import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleCheck, Pause, Play, RefreshCw, SkipBack, StepForward, TriangleAlert } from 'lucide-react';
import { Segmented } from '../../../app-shared/ui';
import { bandLabelFit, chartScale } from '../domain/chartScale';
import { MONTE_CARLO_RUNS } from '../domain/params';
import { targetReached } from '../domain/summary';
import type { OptimizationResult, SimResult, TimelineDay } from '../domain/types';
import type { TextKey, Translator } from '../i18n';
import { label as upper } from './Label';

// Series colours, checked for colour-blind separation and contrast on both
// surfaces. Red is kept for shortages; demand is a neutral backdrop.
const SERIES = {
  light: { inventoryPosition: '#2a78d6', s_t: '#eb6834', arrival: '#1baf7a', inventory: '#eda100', S_t: '#6250d6', demand: '#94a3b8', shortage: '#dc2626', grid: '#e2e8f0', axis: '#64748b', surface: '#ffffff' },
  dark: { inventoryPosition: '#3987e5', s_t: '#d95926', arrival: '#199e70', inventory: '#c98500', S_t: '#9085e9', demand: '#64748b', shortage: '#f87171', grid: '#334155', axis: '#94a3b8', surface: '#0f172a' },
} as const;

let ruler: CanvasRenderingContext2D | null | undefined;
/** The drawn width of a chart label (9 px, bold). */
function labelWidth(text: string): number {
  if (ruler === undefined) ruler = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ruler) return text.length * 6;
  ruler.font = "700 9px Inter, 'Segoe UI', sans-serif";
  return ruler.measureText(text).width;
}

/** The warm-up band's name, kept inside the band whatever its width. */
function warmupLabel(text: string, fill: string, surface: string) {
  return ({ viewBox }: { viewBox?: { x?: number; y?: number; width?: number; height?: number } }) => {
    const { x = 0, y = 0, width = 0, height = 0 } = viewBox ?? {};
    const fit = bandLabelFit(width, height, labelWidth(text));
    if (fit === 'none') return null;
    // An outline in the surface colour keeps the text readable where a line crosses it.
    const style = { fill, fontSize: 9, fontWeight: 700, stroke: surface, strokeWidth: 3, strokeLinejoin: 'round' as const, paintOrder: 'stroke' };
    if (fit === 'across') return <text x={x + 5} y={y + 13} {...style}>{text}</text>;
    // Along the band: starts under the top edge and reads upwards.
    const centre = x + width / 2;
    return <text x={centre} y={y + 6} textAnchor="end" dominantBaseline="central" transform={`rotate(-90 ${centre} ${y + 6})`} {...style}>{text}</text>;
  };
}

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
function LiveChart({ timeline, currentDay, warmupDays, dark, t }: { timeline: TimelineDay[]; currentDay: number; warmupDays: number; dark: boolean; t: Translator }) {
  const [picked, setPicked] = useState<Set<SeriesKey>>(new Set());
  const colors = dark ? SERIES.dark : SERIES.light;
  const shown = (key: SeriesKey) => picked.size === 0 || picked.has(key);
  const opacity = (key: SeriesKey, normal = 1) => (shown(key) ? normal : 0.12);

  const data = useMemo(() => timeline.map((day, index) => (index <= currentDay ? {
    date: day.date,
    isReviewDay: day.isReviewDay,
    warmup: index < warmupDays,
    inventory: day.invAfterDemand,
    inventoryPosition: day.inventoryPosition,
    s_t: day.s_t,
    S_t: day.S_t,
    demand: day.actualDemand,
    arrival: day.arrivedQty > 0 ? day.arrivedQty : null,
    // Unfilled demand is drawn below the zero line.
    backlogNeg: day.backlog > 0 ? -day.backlog : null,
    stockout: day.stockoutEvent ? day.invAfterDemand : null,
  } : { date: day.date, s_t_future: day.s_t, S_t_future: day.S_t })), [timeline, currentDay, warmupDays]);

  // From the whole run, not the days played so far: the lines must not move during playback.
  const scale = useMemo(() => chartScale(timeline), [timeline]);

  const toggle = (key: SeriesKey) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className="inv-chart">
      <div className="inv-legend" role="group" aria-label={t('inventorySimulation')}>
        {LEGEND.map((item) => (
          <button key={item.key} type="button" className={picked.has(item.key) ? 'is-picked' : picked.size ? 'is-faded' : ''} aria-pressed={picked.has(item.key)} onClick={() => toggle(item.key)}>
            <i className={`inv-swatch is-${item.shape}`} style={{ color: colors[item.color] }} aria-hidden="true" />
            {t(item.label)}
          </button>
        ))}
        <span className="inv-legend-note"><i className="inv-swatch is-dot" style={{ color: colors.shortage }} aria-hidden="true" />{t('stockoutLabel')}</span>
      </div>
      <div className="inv-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="inv-on-hand-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.inventory} stopOpacity={0.28} />
                <stop offset="95%" stopColor={colors.inventory} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} strokeOpacity={0.6} />
            <XAxis dataKey="date" tickFormatter={(value) => t.format.date(value)} tick={{ fontSize: 10, fill: colors.axis }} minTickGap={50} axisLine={false} tickLine={false} />
            <YAxis domain={scale.domain} ticks={scale.ticks} interval={0} tickFormatter={(value) => t.format.number(value, 0, 0)} tick={{ fontSize: 10, fill: colors.axis }} axisLine={false} tickLine={false} width={52} />
            <ReferenceLine y={0} stroke={colors.axis} strokeWidth={1} />
            {/* The first days are not counted in Alpha and Beta: stockouts here come from the starting stock, not the policy. */}
            {warmupDays > 0 && timeline.length > 0 && (
              <ReferenceArea
                x1={timeline[0].date}
                x2={timeline[Math.min(warmupDays, timeline.length) - 1].date}
                fill={colors.axis}
                fillOpacity={0.12}
                stroke="none"
                label={warmupLabel(t('warmup').toUpperCase(), colors.axis, colors.surface)}
              />
            )}
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as { isReviewDay?: boolean; warmup?: boolean; stockout?: number | null };
                const rows = payload.filter((entry) => entry.value != null && entry.dataKey !== 'stockout' && !String(entry.dataKey).endsWith('_future'));
                return (
                  <div className="inv-tooltip">
                    <strong>
                      {t.format.date(label)}
                      {point?.isReviewDay && <span className="ops-pill is-gold">{t('reviewDay')}</span>}
                    </strong>
                    {point?.stockout != null && <p className="inv-tooltip-alert"><TriangleAlert size={12} /> {t('stockout')}</p>}
                    {point?.warmup && <p className="inv-tooltip-note">{t('warmupNotCounted')}</p>}
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
        {/* Leaves stock, so it carries a minus sign; a day without demand shows a plain 0. */}
        <strong>{Math.round(day.actualDemand) > 0 ? `−${whole(day.actualDemand)}` : whole(0)}</strong>
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
function StatTable({ timeline, currentDay, warmupDays, t }: { timeline: TimelineDay[]; currentDay: number; warmupDays: number; t: Translator }) {
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
    { label: 'orderPlaced', cell: (day) => (day.orderPlaced ? whole(day.orderPlaced.qty ?? day.orderPlaced.quantity) : '—'), flag: (day) => (day.orderPlaced ? 'is-good' : '') },
    { label: 'arrivedOrders', cell: (day) => positive(day.arrivedQty), flag: (day) => (day.arrivedQty > 0 ? 'is-good' : '') },
    { label: 'invPosition', cell: (day) => whole(day.inventoryPosition) },
    { label: 'onHand', cell: (day) => whole(day.invAfterDemand) },
    { label: 'inTransit', cell: (day) => positive(day.inTransit) },
    { label: 'backlog', cell: (day) => positive(day.backlog), flag: (day) => (day.backlog > 0 ? 'is-bad' : '') },
    { label: 'stockoutLabel', cell: (day) => (day.stockoutEvent ? t('yes') : '—'), flag: (day) => (day.stockoutEvent ? 'is-bad' : '') },
    { label: 'reviewDay', cell: (day) => (day.isReviewDay ? t('yes') : '—'), flag: (day) => (day.isReviewDay ? 'is-gold' : '') },
  ];

  return (
    <div className="inv-stat-scroll ops-scroller" ref={scroller}>
      <table className="inv-stat-table">
        <thead>
          <tr>
            <th>{t('parameterDate')}</th>
            {timeline.map((day, index) => (
              <th
                key={index}
                className={`${index === currentDay ? 'is-now' : index < currentDay ? 'is-past' : ''} ${index < warmupDays ? 'is-warmup' : ''}`}
                title={index < warmupDays ? t('warmupNotCounted') : undefined}
              >
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
  /** One simulated run, shown day by day. */
  result: SimResult | null;
  /** What the optimizer found for the product: averages over all its runs. */
  policy: OptimizationResult | null;
  running: boolean;
  /** Why the engine could not optimize it in its last run. */
  failure?: string;
  onReload: () => void;
  reloading: boolean;
}

/** The policy the optimizer found, with its service levels averaged over all runs. */
function PolicyCard({ policy, t }: { policy: OptimizationResult; t: Translator }) {
  // Two rows of four: what the policy achieves, then the policy itself and the stock it holds.
  const figures: Array<{ label: TextKey; value: string; level?: 'good' | 'warn' }> = [
    { label: 'targetAlpha', value: `${t.format.number(policy.targetAlpha * 100, 0, 2)}%` },
    { label: 'achievedAlpha', value: `${t.format.fixed(policy.achievedAlpha * 100, 1)}%`, level: policy.status === 'tuned' && targetReached(policy) ? 'good' : 'warn' },
    { label: 'achievedBeta', value: `${t.format.fixed(policy.achievedBeta * 100, 1)}%` },
    { label: 'avgStockoutDays', value: policy.mcAvgStockoutDays != null ? t.format.fixed(policy.mcAvgStockoutDays, 1) : '—' },
    { label: 'safetyFactor', value: `${t.format.fixed(policy.optimalSafetyFactor, 2)}×` },
    { label: 'avgReorderPoint', value: t.format.fixed(policy.avgSt, 1) },
    { label: 'avgOrderUpTo', value: t.format.fixed(policy.avgST, 1) },
    { label: 'avgInv', value: policy.mcAvgInventory != null ? t.format.number(policy.mcAvgInventory, 0, 0) : '—' },
  ];
  return (
    <section className="inv-policy ops-card" aria-label={t('policy')} title={`${t('avgOfRuns', t.format.number(MONTE_CARLO_RUNS, 0, 0))}. ${t('serviceMeaning')}`}>
      <div className="inv-policy-head">
        {policy.status === 'tuned'
          ? <strong><CircleCheck size={14} aria-hidden="true" />{t('optimalPolicyFound')}</strong>
          : <strong className="is-warn" title={t(policy.status === 'forecast_too_short' ? 'forecastTooShortHint' : 'targetNotReachableHint')}><TriangleAlert size={14} aria-hidden="true" />{t(policy.status === 'forecast_too_short' ? 'forecastTooShort' : 'targetNotReachable')}</strong>}
      </div>
      {/* Labels keep their case: (s) and (S) are different things. */}
      <dl>
        {figures.map((figure) => (
          <div key={figure.label}>
            <dt>{t(figure.label)}</dt>
            <dd className={figure.level ? `is-${figure.level}` : undefined}>{figure.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** One product: the policy found, today's figures, the run as a chart or table, and playback. */
export function ProductView({ t, dark, result, policy, running, failure, onReload, reloading }: ProductViewProps) {
  const [currentDay, setCurrentDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(200);
  const [view, setView] = useState<'chart' | 'table'>('table');
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

  if (!timeline || days === 0) {
    return (
      <div className="inv-product">
        <div className="inv-product-empty ops-card">
          <strong>{running ? t('running') : failure ? t('productFailed') : t('readyToSimulate')}</strong>
          {!running && <p>{failure ?? t('loadDataPrompt')}</p>}
        </div>
      </div>
    );
  }

  const day = timeline[Math.min(currentDay, days - 1)];
  const metrics = result?.metrics;
  // Days at the start that Alpha and Beta leave out.
  const warmupDays = metrics?.warmup_days ?? 0;
  const share = (label: string, value: number | null | undefined) => (value == null ? null : (
    <div key={label}>
      <span>{upper(label)}:</span>
      <strong>{t.format.fixed(value * 100, 1)}%</strong>
    </div>
  ));

  return (
    <div className="inv-product">
      {policy && <PolicyCard policy={policy} t={t} />}

      {/* Everything in this card describes the one simulated run that is played back. */}
      <div className="inv-run-card ops-card">
        <div className="inv-run-card-head">
          <h3>{t(view === 'chart' ? 'inventorySimulation' : 'inventorySimulationStats')}</h3>
          {metrics && (
            <div className="inv-run-metrics" title={metrics.warmup_days == null ? t('thisRunHint') : `${t('thisRunHint')}. ${t('warmupExcluded', metrics.warmup_days)}`}>
              {/* Figures of this run after the warm-up, counted as the optimizer and the policy card count them: Alpha per replenishment cycle, Beta per unit of demand. */}
              {share('Alpha', metrics.alpha_cycle ?? metrics.alpha_steady)}
              {share('Beta', metrics.beta_steady)}
              <div><span>{t('avgInv')}:</span><strong>{t.format.number(metrics.avgInventory, 0, 0)}</strong></div>
            </div>
          )}
          <Segmented value={view} onChange={setView} options={[{ value: 'table', label: t('table') }, { value: 'chart', label: t('chart') }]} ariaLabel={t('view')} />
        </div>
        {/* The day the playback bar points at. */}
        <DayTiles day={day} t={t} />
        {view === 'chart'
          ? <LiveChart timeline={timeline} currentDay={currentDay} warmupDays={warmupDays} dark={dark} t={t} />
          : <StatTable timeline={timeline} currentDay={currentDay} warmupDays={warmupDays} t={t} />}
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
        {/* As wide as the label gets on the last day (the font is monospaced), so the slider keeps its length while playing. */}
        <span className="inv-playback-day" style={{ minWidth: `${`${t.format.date(day.date)} · ${t('day')} ${t.format.number(days, 0, 0)} / ${t.format.number(days, 0, 0)}`.length + 1}ch` }}>
          {t.format.date(day.date)} · <b>{t('day')} {t.format.number(currentDay + 1, 0, 0)}</b> / {t.format.number(days, 0, 0)}
        </span>
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
