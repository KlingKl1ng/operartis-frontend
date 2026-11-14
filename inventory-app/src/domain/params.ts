// Parameter defaults, limits, and which value wins for a product.
import type { FileSkuParams, LeadTimeConfig, LockState, Params } from './types';

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
  moqValue: 0,
};

export const REVIEW_PERIODS = [1, 7, 14, 30] as const;
/** Service-level slider, in percent. */
export const SERVICE_LEVEL = { min: 80, max: 99.5, step: 0.5, presets: [84, 90, 95, 97.5, 99] } as const;
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

export interface ParamSources {
  /** The values for all products, as set on the overview. */
  defaults: Params;
  /** What the user changed for single products; only the changed fields. */
  overrides: Record<string, Partial<Params>>;
  file: Record<string, FileSkuParams>;
}

/**
 * The parameters a product runs with. In order of priority:
 * 1. what the user set for that product,
 * 2. the values in the uploaded file,
 * 3. the values for all products.
 */
export function resolveSkuParams(sku: string, sources: ParamSources): Params {
  return { ...withFileParams(sources.defaults, sources.file[sku]), ...sources.overrides[sku] };
}

/** Whether the user's own values for a product change what it runs with. */
export function hasOwnValues(sku: string, sources: ParamSources): boolean {
  const own = sources.overrides[sku];
  if (!own) return false;
  const base = withFileParams(sources.defaults, sources.file[sku]);
  return JSON.stringify({ ...base, ...own }) !== JSON.stringify(base);
}

/** The parameters the uploaded file gives for at least one product. They differ per product. */
export function fileGivenFields(file: Record<string, FileSkuParams>) {
  const rows = Object.values(file);
  return {
    initialStock: rows.some((row) => row.initialStock != null),
    leadTime: rows.some((row) => row.leadTime != null && row.leadTime !== 0),
    reviewPeriod: rows.some((row) => row.reviewPeriod != null),
    moq: rows.some((row) => row.moqValue != null),
    serviceLevel: rows.some((row) => row.serviceLevel != null),
  };
}

/**
 * The file parameters the user chose to lock when mapping the columns. They
 * cannot be edited until the user unlocks them for a product.
 */
export function lockedFields(hasProducts: boolean, locks: LockState) {
  return {
    initialStock: hasProducts && Boolean(locks.initial_stock),
    leadTime: hasProducts && Boolean(locks.lead_time_mean),
    reviewPeriod: hasProducts && Boolean(locks.review_period),
    moq: hasProducts && Boolean(locks.min_order_qty),
    serviceLevel: hasProducts && Boolean(locks.target_service_level),
  };
}

/** Probabilities of a lead-time value list must add up to 1 (within 0.01). */
export function leadTimeProbabilitySum(config: LeadTimeConfig): number {
  return config.values.reduce((sum, item) => sum + (Number(item.probability) || 0), 0);
}

export function leadTimeValuesValid(config: LeadTimeConfig): boolean {
  return config.type !== 'value' || Math.abs(leadTimeProbabilitySum(config) - 1) < 0.01;
}
