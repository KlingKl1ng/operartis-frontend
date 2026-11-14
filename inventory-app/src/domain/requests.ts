// Request bodies for the inventory engine (backend/inventory_engine.py).
import { MONTE_CARLO_RUNS, OPTIMIZER } from './params';
import type { ForecastPoint, LeadTimeConfig, MonteCarloResult, OptimizationResult, Params, SimResult, SimulationMode } from './types';

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
  min_order_qty?: number | null;
}

export interface SimulationRequest extends SkuRequestBase {
  safety_factor: number;
}

export interface OptimizationRequest extends SkuRequestBase {
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
  };
}

/** Body for simulate-timeline and simulate-monte-carlo. */
export function simulationRequest(sku: string, forecast: ForecastPoint[], params: Params, filename: string | null): SimulationRequest {
  const body: SimulationRequest = { ...baseRequest(sku, forecast, params, filename), safety_factor: params.safetyFactor || 1.0 };
  if (params.moqValue > 0) body.min_order_qty = params.moqValue;
  return body;
}

/** Body for optimize-policy. */
export function optimizationRequest(sku: string, forecast: ForecastPoint[], params: Params, filename: string | null): OptimizationRequest {
  const body: OptimizationRequest = { ...baseRequest(sku, forecast, params, filename), ...OPTIMIZER };
  if (params.moqValue > 0) body.min_order_qty = params.moqValue;
  return body;
}

/** Body for optimize-batch: one optimization request per product. */
export function batchRequest(
  products: Array<{ sku: string; forecast: ForecastPoint[]; params: Params }>,
  filename: string | null,
): BatchRequest {
  return {
    input_filename: filename || 'Inventory_Data',
    sku_params: products.map(({ sku, forecast, params }) => ({
      ...baseRequest(sku, forecast, params, filename),
      min_order_qty: params.moqValue > 0 ? params.moqValue : null,
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
  mcResults: Record<string, MonteCarloResult>;
  optimizationResults: Record<string, OptimizationResult>;
  sourceJobId: string | null;
  filename: string | null;
  mode: SimulationMode;
  language: string;
}) {
  const skuResults = input.skus.map((sku) => {
    const sim = input.simResults[sku];
    const mc = input.mcResults[sku];
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
      safety_factor: optimum?.optimalSafetyFactor ?? params.safetyFactor,
      min_order_qty: params.moqValue,
      // The optimizer's 500-run result takes precedence over the single run on screen.
      achieved_alpha: optimum?.achievedAlpha ?? sim?.metrics?.alpha ?? 0,
      achieved_beta: optimum?.achievedBeta ?? sim?.metrics?.beta ?? 0,
      avg_inventory: sim?.metrics?.avgInventory ?? 0,
      total_stockouts: sim?.metrics?.totalStockouts ?? 0,
      total_days: sim?.metrics?.totalDays ?? timeline?.length ?? 0,
      mc_alpha_mean: optimum?.achievedAlpha ?? mc?.alpha?.mean ?? null,
      mc_alpha_p5: mc?.alpha?.p5 ?? null,
      mc_alpha_p95: mc?.alpha?.p95 ?? null,
      mc_beta_mean: optimum?.achievedBeta ?? mc?.beta?.mean ?? null,
      mc_beta_p5: mc?.beta?.p5 ?? null,
      mc_beta_p95: mc?.beta?.p95 ?? null,
      mc_avg_inventory_mean: optimum?.mcAvgInventory ?? mc?.avgInventory?.mean ?? null,
      mc_stockout_days_mean: optimum?.mcAvgStockoutDays ?? mc?.stockoutDays?.mean ?? null,
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
    simulation_mode: input.mode,
    num_monte_carlo_runs: MONTE_CARLO_RUNS,
    language: input.language,
  };
}
