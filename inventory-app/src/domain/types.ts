// Shapes used across the inventory module.

export type LeadTimeType = 'deterministic' | 'value' | 'poisson' | 'binomial' | 'uniform';

export interface LeadTimeValue {
  value: number;
  probability: number;
}

export interface LeadTimeConfig {
  type: LeadTimeType;
  deterministicValue: number;
  values: LeadTimeValue[];
  poissonLambda: number;
  binomialN: number;
  binomialP: number;
  uniformMin: number;
  uniformMax: number;
}

/** The parameters shown in the sidebar. */
export interface Params {
  initialStock: number;
  leadTimeConfig: LeadTimeConfig;
  reviewPeriod: number;
  /** Target cycle service level as a fraction, 0.95 = 95 %. */
  serviceLevel: number;
  /** Multiplier on forecast uncertainty; only used in What-If mode. */
  safetyFactor: number;
  /** Minimum order quantity; 0 means none. */
  moqValue: number;
}

/** One forecast period of one product, as sent to the engine. */
export interface ForecastPoint {
  date: string;
  p50: number;
  p90: number;
  resid_std?: number;
  horizon_index?: number;
}

/** Per-product parameters read from optional columns of the uploaded file. */
export interface FileSkuParams {
  initialStock: number | null;
  leadTime: number | null;
  leadTimeStd: number;
  reviewPeriod: number | null;
  moqValue: number;
  serviceLevel: number | null;
}

export type FormatType = 'vertical' | 'horizontal' | 'forecaster_prefixed' | 'forecaster' | 'operartis_residual';

export type ParamColumnKey =
  | 'initial_stock'
  | 'lead_time_mean'
  | 'lead_time_std'
  | 'review_period'
  | 'min_order_qty'
  | 'target_service_level';

export const PARAM_COLUMN_KEYS: ParamColumnKey[] = [
  'initial_stock',
  'lead_time_mean',
  'lead_time_std',
  'review_period',
  'min_order_qty',
  'target_service_level',
];

/** Which file column feeds which field. Empty string = not mapped. */
export interface Mapping extends Record<ParamColumnKey, string> {
  format: FormatType;
  sku_id: string;
  // vertical
  date?: string;
  p50?: string;
  p90?: string;
  // horizontal and forecaster_prefixed
  p50_columns?: string[];
  p90_columns?: string[];
  start_date?: string;
  // forecaster and operartis_residual
  date_columns?: string[];
  p90_variance_factor?: number;
  // operartis_residual
  resid_std?: string;
  forecast_columns?: string[];
  forecast_horizon?: number;
  header_row_index?: number;
}

/** Parameters the user chose to take from the file; these are read-only in Optimize mode. */
export type LockState = Partial<Record<ParamColumnKey, boolean>>;

/** What the first look at a file found before any mapping. */
export interface FileMetadata {
  isOperartisForecast?: boolean;
  headerRowIndex?: number;
  forecastHorizon?: number;
}

export interface ParsedFile {
  /** Forecast per product, only products with at least one usable period. */
  grouped: Record<string, ForecastPoint[]>;
  skus: string[];
  skuParams: Record<string, FileSkuParams>;
}

// ---------- Results ----------

/** An order as the engine reports it: quantity plus the day it is due. */
export interface OrderInfo {
  qty?: number;
  quantity?: number;
  arrival_day?: number;
  [key: string]: unknown;
}

/** One simulated day (TimelineEntry in backend/inventory_engine.py). */
export interface TimelineDay {
  day: number;
  date: string;
  p50: number;
  p90: number;
  /** Reorder point for the day. */
  s_t: number;
  /** Order-up-to level for the day. */
  S_t: number;
  invBeforeArrival: number;
  arrivedQty: number;
  invAfterArrival: number;
  actualDemand: number;
  fulfilled: number;
  invBeforeDemand: number;
  invAfterDemand: number;
  shortage: number;
  backlog: number;
  stockoutEvent: boolean;
  orderPlaced: OrderInfo | null;
  pipelineOrders: OrderInfo[];
  inventoryPosition: number;
  inTransit: number;
  undershoot: number;
  isReviewDay: boolean;
}

export interface TimelineMetrics {
  alpha: number;
  beta: number;
  avgInventory: number;
  totalStockouts: number;
  totalDays?: number;
  alpha_steady?: number | null;
  beta_steady?: number | null;
  warmup_days?: number | null;
  warmup_stockout_days?: number | null;
  steady_state_days?: number | null;
}

export interface SimResult {
  jobId?: string | null;
  skuId?: string;
  timeline: TimelineDay[];
  metrics: TimelineMetrics | null;
}

export interface Spread {
  mean: number;
  p5: number;
  p95: number;
}

export interface MonteCarloResult {
  jobId?: string | null;
  numRuns: number;
  alpha: Spread;
  beta: Spread;
  avgInventory: Spread;
  stockoutDays: Spread;
}

export interface OptimizationResult {
  jobId?: string | null;
  skuId: string;
  targetAlpha: number;
  achievedAlpha: number;
  achievedBeta: number;
  optimalSafetyFactor: number;
  avgSt: number;
  avgST: number;
  recommendedInitialStock: number;
  iterationsUsed: number;
  convergenceAchieved: boolean;
  mcAvgInventory: number | null;
  mcAvgStockoutDays: number | null;
  timeline?: TimelineDay[];
  metrics: TimelineMetrics | null;
}

export type SimulationMode = 'optimize' | 'whatif';
