// Calls to the inventory engine and the shapes it answers with.
import { createApi, ApiError, sleep } from '../../../app-shared/api';
import type { BatchRequest, SimulationRequest } from '../domain/requests';
import type { OptimizationResult, OrderInfo, SimResult, TimelineDay, TimelineMetrics } from '../domain/types';

const api = createApi('/inventory');

interface ApiTimelineEntry {
  day: number;
  date: string;
  p50: number;
  p90: number;
  s_t: number;
  S_t: number;
  inv_before_arrival: number;
  arrived_qty: number;
  inv_after_arrival: number;
  actual_demand: number;
  fulfilled: number;
  inv_before_demand: number;
  inv_after_demand: number;
  shortage: number;
  backlog: number;
  stockout_event: boolean;
  order_placed: OrderInfo | null;
  pipeline_orders: OrderInfo[];
  inventory_position: number;
  in_transit: number;
  undershoot: number;
  is_review_day: boolean;
}

interface ApiMetrics {
  alpha: number;
  beta: number;
  avg_inventory: number;
  total_stockouts: number;
  total_days?: number;
  alpha_steady?: number | null;
  beta_steady?: number | null;
  warmup_days?: number | null;
  warmup_stockout_days?: number | null;
  steady_state_days?: number | null;
}

interface ApiOptimization {
  job_id?: string | null;
  sku_id: string;
  target_alpha: number;
  achieved_alpha: number;
  achieved_beta: number;
  optimal_safety_factor: number;
  avg_s_t: number;
  avg_S_t: number;
  recommended_initial_stock: number;
  iterations_used: number;
  convergence_achieved: boolean;
  mc_avg_inventory?: number | null;
  mc_avg_stockout_days?: number | null;
  timeline?: ApiTimelineEntry[] | null;
  metrics?: ApiMetrics | null;
}

export function mapTimeline(entries: ApiTimelineEntry[]): TimelineDay[] {
  return entries.map((entry) => ({
    day: entry.day,
    date: entry.date,
    p50: entry.p50,
    p90: entry.p90,
    s_t: entry.s_t,
    S_t: entry.S_t,
    invBeforeArrival: entry.inv_before_arrival,
    arrivedQty: entry.arrived_qty,
    invAfterArrival: entry.inv_after_arrival,
    actualDemand: entry.actual_demand,
    fulfilled: entry.fulfilled,
    invBeforeDemand: entry.inv_before_demand,
    invAfterDemand: entry.inv_after_demand,
    shortage: entry.shortage,
    backlog: entry.backlog,
    stockoutEvent: entry.stockout_event,
    orderPlaced: entry.order_placed,
    pipelineOrders: entry.pipeline_orders,
    inventoryPosition: entry.inventory_position,
    inTransit: entry.in_transit,
    undershoot: entry.undershoot,
    isReviewDay: entry.is_review_day,
  }));
}

export function mapMetrics(metrics: ApiMetrics | null | undefined): TimelineMetrics | null {
  if (!metrics) return null;
  return {
    alpha: metrics.alpha,
    beta: metrics.beta,
    avgInventory: metrics.avg_inventory,
    totalStockouts: metrics.total_stockouts,
    totalDays: metrics.total_days,
    alpha_steady: metrics.alpha_steady,
    beta_steady: metrics.beta_steady,
    warmup_days: metrics.warmup_days,
    warmup_stockout_days: metrics.warmup_stockout_days,
    steady_state_days: metrics.steady_state_days,
  };
}

export function mapOptimization(result: ApiOptimization): OptimizationResult {
  return {
    jobId: result.job_id,
    skuId: result.sku_id,
    targetAlpha: result.target_alpha,
    achievedAlpha: result.achieved_alpha,
    achievedBeta: result.achieved_beta,
    optimalSafetyFactor: result.optimal_safety_factor,
    avgSt: result.avg_s_t,
    avgST: result.avg_S_t,
    recommendedInitialStock: result.recommended_initial_stock,
    iterationsUsed: result.iterations_used,
    convergenceAchieved: result.convergence_achieved,
    mcAvgInventory: result.mc_avg_inventory ?? null,
    mcAvgStockoutDays: result.mc_avg_stockout_days ?? null,
    timeline: result.timeline ? mapTimeline(result.timeline) : undefined,
    metrics: mapMetrics(result.metrics),
  };
}

/** One simulated run, for the day-by-day chart. */
export async function simulateTimeline(body: SimulationRequest): Promise<SimResult> {
  const result = await api.post<{ job_id?: string | null; timeline: ApiTimelineEntry[]; metrics: ApiMetrics }>('/inventory/simulate-timeline', body);
  return { jobId: result.job_id, timeline: mapTimeline(result.timeline), metrics: mapMetrics(result.metrics) };
}

// ---------- Batches (optimize every product; runs in the server's queue) ----------

export interface BatchStatus {
  job_id: string;
  status: 'queued' | 'processing' | 'cancel_requested' | 'completed' | 'canceled' | 'failed';
  progress?: number;
  /** Place in the queue while waiting; 1 = next. */
  position?: number;
  total_skus?: number;
  completed_skus?: number;
  successful?: number;
  failed?: number;
  workers_used?: number | null;
  error?: string | null;
}

export interface BatchProgress {
  status: BatchStatus['status'];
  position: number;
  completed: number;
  total: number;
}

export interface BatchOutcome {
  jobId: string;
  totalSkus: number;
  successful: number;
  workersUsed: number | null;
  results: Record<string, OptimizationResult>;
  /** Products the engine could not optimize, with its reason. */
  failures: Record<string, string>;
}

type ApiBatchItem = (ApiOptimization & { success: true }) | { success: false; sku_id?: string; error?: string };

export const submitBatch = (body: BatchRequest) => api.post<BatchStatus>('/inventory/optimize-batch', body);
export const cancelBatch = (jobId: string) => api.post<{ status: string }>(`/inventory/batch-cancel/${encodeURIComponent(jobId)}`);

/**
 * Follow a queued batch until it ends. Returns its results, or null if it was
 * cancelled. The batch keeps running on the server, so up to five failed
 * status checks in a row are ridden out; a refusal (4xx) ends the wait at once.
 */
export async function waitForBatch(
  accepted: BatchStatus,
  onProgress: (progress: BatchProgress) => void,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<BatchOutcome | null> {
  const jobId = encodeURIComponent(accepted.job_id);
  let status = accepted;
  let polls = 0;
  let failedPolls = 0;
  for (;;) {
    onProgress({
      status: status.status,
      position: status.position || 0,
      completed: status.completed_skus || 0,
      total: status.total_skus || 0,
    });
    if (status.status === 'completed') break;
    if (status.status === 'canceled') return null;
    if (status.status === 'failed') throw new Error(status.error || 'Batch optimization failed');

    // Small batches finish in seconds: check quickly at first, then once a second.
    await wait(polls < 6 ? 400 : 1000);
    polls += 1;
    try {
      status = await api.get<BatchStatus>(`/inventory/batch-status/${jobId}`);
      failedPolls = 0;
    } catch (error) {
      const refused = error instanceof ApiError && error.status < 500;
      failedPolls += 1;
      if (refused || failedPolls > 5) throw error;
    }
  }

  const result = await api.get<{ job_id: string; total_skus: number; successful: number; workers_used?: number | null; results: Record<string, ApiBatchItem> }>(
    `/inventory/batch-result/${jobId}`,
  );
  const results: Record<string, OptimizationResult> = {};
  const failures: Record<string, string> = {};
  for (const [sku, item] of Object.entries(result.results)) {
    if (item.success) results[sku] = mapOptimization(item);
    else failures[sku] = item.error || 'Optimization failed';
  }
  return { jobId: result.job_id, totalSkus: result.total_skus, successful: result.successful, workersUsed: result.workers_used ?? null, results, failures };
}

/** Download the Excel report for the results on screen. */
export const exportReport = (body: unknown) => api.postForDownload('/inventory/export-report', body, 'Operartis_Inventory_Report.xlsx');
