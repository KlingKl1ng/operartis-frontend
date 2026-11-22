// Past forecast errors from the "Validation Forecasts" sheet of an Operartis
// forecast report: for some past days (origins) the forecaster's forecast of
// the following days, next to what was actually sold.
//
// Two figures are estimated from them:
// - per product, the spread of the daily forecast error on days the model had
//   not seen. The report's Resid_Std is the fit error on the training days,
//   which is usually smaller.
// - for the whole file, the persistence: the share of one day's error that
//   carries over into the next day (see _persistent_errors in the engine).
//
// The errors are not centred: a forecast that is too low on every day of a
// horizon is an error that persists, which is exactly what the two figures
// have to describe.

/** One forecast of one day, made on the day `origin`, `lead` days ahead. */
export interface ValidationPair {
  sku: string;
  origin: string;
  lead: number;
  actual: number;
  forecast: number;
}

export interface ValidationErrors {
  /** Persistence pooled over all products, 0 to 0.95, two decimals; null with too few pairs to estimate it. */
  persistence: number | null;
  /** Out-of-sample spread of the daily error, for the products with enough pairs. */
  spread: Record<string, number>;
  /** Products that have validation pairs. */
  products: number;
  pairs: number;
}

/** Fewer pairs than this say too little about one product's spread; its Resid_Std stays. */
export const MIN_PAIRS_FOR_SPREAD = 10;
/** Fewer day-to-day steps than this, over all products, say too little about the persistence. */
export const MIN_STEPS_FOR_PERSISTENCE = 20;
export const MAX_PERSISTENCE = 0.95;

const rootMeanSquare = (values: number[]) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);

export function estimateValidationErrors(pairs: ValidationPair[]): ValidationErrors | null {
  // product → origin → lead → error
  const byProduct = new Map<string, Map<string, Map<number, number>>>();
  let usable = 0;
  pairs.forEach(({ sku, origin, lead, actual, forecast }) => {
    if (!sku || !Number.isFinite(lead) || !Number.isFinite(actual) || !Number.isFinite(forecast)) return;
    if (!byProduct.has(sku)) byProduct.set(sku, new Map());
    const origins = byProduct.get(sku)!;
    if (!origins.has(origin)) origins.set(origin, new Map());
    origins.get(origin)!.set(lead, actual - forecast);
    usable += 1;
  });
  if (usable === 0) return null;

  const spread: Record<string, number> = {};
  let together = 0; // sum of error × next day's error, each product in units of its own spread
  let size = 0;     // sum of the two squared errors' average
  let steps = 0;
  byProduct.forEach((origins, sku) => {
    const errors = [...origins.values()].flatMap((path) => [...path.values()]);
    const scale = rootMeanSquare(errors);
    if (!(scale > 0)) return; // a perfect forecast has no error to describe
    if (errors.length >= MIN_PAIRS_FOR_SPREAD) spread[sku] = scale;
    origins.forEach((path) => {
      path.forEach((error, lead) => {
        const next = path.get(lead + 1);
        if (next === undefined) return;
        together += (error / scale) * (next / scale);
        size += ((error / scale) ** 2 + (next / scale) ** 2) / 2;
        steps += 1;
      });
    });
  });

  const estimate = steps >= MIN_STEPS_FOR_PERSISTENCE && size > 0 ? together / size : null;
  return {
    persistence: estimate == null ? null : Math.round(Math.min(Math.max(estimate, 0), MAX_PERSISTENCE) * 100) / 100,
    spread,
    products: byProduct.size,
    pairs: usable,
  };
}
