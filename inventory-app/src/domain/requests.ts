// Request bodies for the inventory engine (backend/inventory_engine.py).
import { MONTE_CARLO_RUNS, OPTIMIZER } from './params';
import type { ForecastPoint, LeadTimeConfig, OptimizationResult, Params, SimResult } from './types';

export interface ApiLeadTimeConfig {
  type: LeadTimeConfig['type'];
  deterministic_value: number;
  values: Array<{ value: number; probability: number }> | null;
  poisson_lambda: number | null;
  binomial_n: number | null;
  binomial_p: number | null;
  uniform_min: number | null;
  uniform_max: number | null;
}

export interface ApiForecastEntry {
  date: string;
  p50: number;
  p90: number;
  resid_std: number | null;
  horizon_index: number | null;
}

interface SkuRequestBase {
  sku_id: string;
  input_filename: string | null;
  initial_stock: number;
  lead_time_config: ApiLeadTimeConfig;
  /** Older fields the engine still accepts. */
  lead_time_days: number;
  lead_time_std: number;
  review_period: number;
  target_service_level: number;
  forecast_data: ApiForecastEntry[];
  /** Wanted number of reviews between two orders. */
  order_interval_reviews: number;
  /** Share of one day's forecast error carried into the next day, 0 to 0.95. */
  error_persistence: number;
  min_order_qty?: number | null;
}

export interface SimulationRequest extends SkuRequestBase {
  safety_factor: number;
}

export interface OptimizationRequest extends SkuRequestBase {
  service_measure: Params['serviceMeasure'];
  tolerance: number;
  max_iterations: number;
  num_simulation_runs: number;
}

export interface BatchRequest {
  input_filename: string;
  sku_params: OptimizationRequest[];
}

const FALLBACK_LEAD_TIME_DAYS = 14;

export function toApiLeadTime(config: LeadTimeConfig): ApiLeadTimeConfig {
  return {
    type: config.type,
    deterministic_value: config.deterministicValue || FALLBACK_LEAD_TIME_DAYS,
    values: config.type === 'value' ? config.values.map(({ value, probability }) => ({ value, probability })) : null,
    poisson_lambda: config.poissonLambda,
    binomial_n: config.binomialN,
    binomial_p: config.binomialP,
    uniform_min: config.uniformMin,
    uniform_max: config.uniformMax,
  };
}

const toApiForecast = (forecast: ForecastPoint[]): ApiForecastEntry[] => forecast.map((point) => ({
  date: point.date,
  p50: point.p50,
  p90: point.p90,
  resid_std: point.resid_std ?? null,
  horizon_index: point.horizon_index ?? null,
}));

/** The persistence within the range the engine accepts. */
const errorPersistence = (params: Params) => Math.min(Math.max(Number(params.errorPersistence) || 0, 0), 0.95);

function baseRequest(sku: string, forecast: ForecastPoint[], params: Params, filename: string | null): SkuRequestBase {
  return {
    sku_id: sku,
    input_filename: filename,
    initial_stock: params.initialStock,
    lead_time_config: toApiLeadTime(params.leadTimeConfig),
    lead_time_days: params.leadTimeConfig.deterministicValue || FALLBACK_LEAD_TIME_DAYS,
    lead_time_std: 0,
    review_period: params.reviewPeriod,
    target_service_level: params.serviceLevel,
    forecast_data: toApiForecast(forecast),
    order_interval_reviews: Math.max(1, Math.round(params.orderInterval) || 1),
    error_persistence: errorPersistence(params),
  };
}

/** Body for simulate-timeline: one run with the safety factor the optimizer found. */
export function simulationRequest(sku: string, forecast: ForecastPoint[], params: Params, safetyFactor: number, filename: string | null): SimulationRequest {
  const body: SimulationRequest = { ...baseRequest(sku, forecast, params, filename), safety_factor: safetyFactor || 1.0 };
  if (params.moqValue > 0) body.min_order_qty = params.moqValue;
  return body;
}

/** Body for optimize-batch: one optimization request per product. Every run goes through it, also a single product. */
export function batchRequest(
  products: Array<{ sku: string; forecast: ForecastPoint[]; params: Params }>,
  filename: string | null,
): BatchRequest {
  return {
    input_filename: filename || 'Inventory_Data',
    sku_params: products.map(({ sku, forecast, params }) => ({
      ...baseRequest(sku, forecast, params, filename),
      min_order_qty: params.moqValue > 0 ? params.moqValue : null,
      service_measure: params.serviceMeasure === 'fill' ? 'fill' : 'cycle',
      ...OPTIMIZER,
    })),
  };
}

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/** Body for export-report: everything shown for each product that has a result. */
export function exportRequest(input: {
  skus: string[];
  paramsFor: (sku: string) => Params;
  forecasts: Record<string, ForecastPoint[]>;
  simResults: Record<string, SimResult>;
  optimizationResults: Record<string, OptimizationResult>;
  sourceJobId: string | null;
  filename: string | null;
  language: string;
}) {
  const skuResults = input.skus.map((sku) => {
    const sim = input.simResults[sku];
    const optimum = input.optimizationResults[sku];
    const params = input.paramsFor(sku);
    const leadTime = params.leadTimeConfig;
    const timeline = sim?.timeline;
    return {
      sku_id: sku,
      initial_stock: params.initialStock,
      lead_time_config: {
        type: leadTime.type,
        deterministic_value: leadTime.deterministicValue || FALLBACK_LEAD_TIME_DAYS,
        values: leadTime.values.map(({ value, probability }) => ({ value, probability })),
        poisson_lambda: leadTime.poissonLambda || null,
        binomial_n: leadTime.binomialN || null,
        binomial_p: leadTime.binomialP || null,
        uniform_min: leadTime.uniformMin || null,
        uniform_max: leadTime.uniformMax || null,
      },
      review_period: params.reviewPeriod,
      target_service_level: params.serviceLevel,
      safety_factor: optimum?.optimalSafetyFactor ?? 1.0,
      min_order_qty: params.moqValue,
      order_interval_reviews: Math.max(1, Math.round(params.orderInterval) || 1),
      error_persistence: errorPersistence(params),
      service_measure: optimum?.serviceMeasure ?? params.serviceMeasure,
      // The optimizer's 500-run result takes precedence over the single run on screen.
      achieved_alpha: optimum?.achievedAlpha ?? sim?.metrics?.alpha ?? 0,
      achieved_beta: optimum?.achievedBeta ?? sim?.metrics?.beta ?? 0,
      avg_inventory: sim?.metrics?.avgInventory ?? 0,
      total_stockouts: sim?.metrics?.totalStockouts ?? 0,
      total_days: sim?.metrics?.totalDays ?? timeline?.length ?? 0,
      mc_alpha_mean: optimum?.achievedAlpha ?? null,
      mc_alpha_p5: null,
      mc_alpha_p95: null,
      mc_beta_mean: optimum?.achievedBeta ?? null,
      mc_beta_p5: null,
      mc_beta_p95: null,
      mc_avg_inventory_mean: optimum?.mcAvgInventory ?? null,
      mc_stockout_days_mean: optimum?.mcAvgStockoutDays ?? null,
      alpha_steady: sim?.metrics?.alpha_steady ?? null,
      beta_steady: sim?.metrics?.beta_steady ?? null,
      warmup_days: sim?.metrics?.warmup_days ?? null,
      avg_s_t: timeline?.length ? average(timeline.map((day) => day.s_t).filter((value) => value != null)) : null,
      avg_S_t: timeline?.length ? average(timeline.map((day) => day.S_t).filter((value) => value != null)) : null,
      timeline: timeline?.map((day) => ({
        day: day.day,
        date: day.date,
        p50: day.p50,
        p90: day.p90,
        s_t: day.s_t,
        S_t: day.S_t,
        actual_demand: day.actualDemand,
        inv_after_demand: day.invAfterDemand,
        in_transit: day.inTransit,
        inventory_position: day.inventoryPosition,
        order_placed: day.orderPlaced,
        arrived_qty: day.arrivedQty,
        stockout_event: day.stockoutEvent,
        backlog: day.backlog,
      })) ?? null,
      // A forecast-report file carries its own uncertainty; the derived P90 is not exported for it.
      forecast_data: (input.forecasts[sku] || []).map((point) => (
        point.resid_std !== undefined && point.horizon_index !== undefined
          ? { date: point.date, p50: point.p50, resid_std: point.resid_std, horizon_index: point.horizon_index }
          : { date: point.date, p50: point.p50, p90: point.p90 }
      )),
    };
  }).filter((result) => result.achieved_alpha > 0 || result.timeline);

  return {
    source_job_id: input.sourceJobId,
    input_filename: input.filename || 'Inventory_Data',
    sku_results: skuResults,
    // The report still names its mode; this page only optimizes.
    simulation_mode: 'optimize',
    num_monte_carlo_runs: MONTE_CARLO_RUNS,
    language: input.language,
  };
}
