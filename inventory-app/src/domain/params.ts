// Parameter defaults, limits, and which value wins for a product.
import type { FileSkuParams, LeadTimeConfig, LockState, Params, SimulationMode } from './types';

export const DEFAULT_LEAD_TIME: LeadTimeConfig = {
  type: 'deterministic',
  deterministicValue: 14,
  values: [{ value: 14, probability: 1.0 }],
  poissonLambda: 14,
  binomialN: 20,
  binomialP: 0.7,
  uniformMin: 7,
  uniformMax: 21,
};

export const DEFAULT_PARAMS: Params = {
  initialStock: 500,
  leadTimeConfig: DEFAULT_LEAD_TIME,
  reviewPeriod: 7,
  serviceLevel: 0.95,
  safetyFactor: 1.0,
  moqValue: 0,
};

export const REVIEW_PERIODS = [1, 7, 14, 30] as const;
/** Service-level slider, in percent. */
export const SERVICE_LEVEL = { min: 80, max: 99.5, step: 0.5, presets: [84, 90, 95, 97.5, 99] } as const;
export const SAFETY_FACTOR = { min: 1, max: 4, step: 0.1, presets: [1, 1.5, 2, 3] } as const;
export const MONTE_CARLO_RUNS = 500;
export const OPTIMIZER = { tolerance: 0.01, max_iterations: 15, num_simulation_runs: MONTE_CARLO_RUNS } as const;

/** Sidebar values with a product's file values laid over them. */
export function withFileParams(base: Params, file: FileSkuParams | undefined): Params {
  if (!file) return base;
  return {
    ...base,
    initialStock: file.initialStock ?? base.initialStock,
    leadTimeConfig: file.leadTime != null && file.leadTime !== 0
      ? { ...base.leadTimeConfig, type: 'deterministic', deterministicValue: file.leadTime }
      : base.leadTimeConfig,
    reviewPeriod: file.reviewPeriod ?? base.reviewPeriod,
    serviceLevel: file.serviceLevel ?? base.serviceLevel,
    moqValue: file.moqValue ?? base.moqValue,
  };
}

/**
 * The parameters a product runs with. In order of priority:
 * 1. what the user set while that product was selected,
 * 2. the values in the uploaded file,
 * 3. the sidebar as it stands now.
 */
export function resolveSkuParams(
  sku: string,
  sources: { sidebar: Params; manual: Record<string, Params>; file: Record<string, FileSkuParams> },
): Params {
  return sources.manual[sku] ?? withFileParams(sources.sidebar, sources.file[sku]);
}

/** In Optimize mode with a file loaded, parameters taken from the file cannot be edited. */
export function lockedFields(mode: SimulationMode, hasProducts: boolean, locks: LockState) {
  const active = mode === 'optimize' && hasProducts;
  return {
    initialStock: active && Boolean(locks.initial_stock),
    leadTime: active && Boolean(locks.lead_time_mean),
    reviewPeriod: active && Boolean(locks.review_period),
    moq: active && Boolean(locks.min_order_qty),
    serviceLevel: active && Boolean(locks.target_service_level),
  };
}

/** Probabilities of a lead-time value list must add up to 1 (within 0.01). */
export function leadTimeProbabilitySum(config: LeadTimeConfig): number {
  return config.values.reduce((sum, item) => sum + (Number(item.probability) || 0), 0);
}

export function leadTimeValuesValid(config: LeadTimeConfig): boolean {
  return config.type !== 'value' || Math.abs(leadTimeProbabilitySum(config) - 1) < 0.01;
}
