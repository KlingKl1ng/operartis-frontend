import { describe, expect, it } from 'vitest';
import { estimateValidationErrors, MIN_PAIRS_FOR_SPREAD, type ValidationPair } from './validation';

/** One origin's forecasts of the following days, given as the errors actual − forecast. */
const path = (sku: string, origin: string, errors: number[], forecast = 100): ValidationPair[] => (
  errors.map((error, index) => ({ sku, origin, lead: index + 1, actual: forecast + error, forecast }))
);

/** Errors that carry `persistence` of the day before, from a fixed sequence of noise. */
function persistentErrors(persistence: number, length: number, seed: number): number[] {
  let state = seed;
  const uniform = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return (state + 0.5) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
  const errors = [normal()];
  for (let day = 1; day < length; day++) errors.push(persistence * errors[day - 1] + Math.sqrt(1 - persistence ** 2) * normal());
  return errors;
}

describe('past forecast errors of a forecast report', () => {
  it('gives the spread of a product as the root mean square of its errors', () => {
    const errors = [3, -4, 3, -4, 3, -4, 3, -4, 3, -4, 3, -4];
    const result = estimateValidationErrors(path('A', '2026-01-01', errors))!;
    expect(result.spread.A).toBeCloseTo(Math.sqrt((9 + 16) / 2), 10);
    expect(result).toMatchObject({ products: 1, pairs: 12 });
  });

  it('keeps Resid_Std for a product with too few pairs', () => {
    const few = path('A', '2026-01-01', Array(MIN_PAIRS_FOR_SPREAD - 1).fill(2));
    expect(estimateValidationErrors(few)!.spread).toEqual({});
    expect(estimateValidationErrors([...few, ...path('A', '2026-01-05', [2])])!.spread).toEqual({ A: 2 });
  });

  it('reads a forecast that is off in one direction as fully persistent, and a flip-flop as not persistent', () => {
    const tooLow = estimateValidationErrors(path('A', '2026-01-01', Array(30).fill(5)))!;
    expect(tooLow.persistence).toBe(0.95); // the highest value the engine takes
    const flipFlop = estimateValidationErrors(path('A', '2026-01-01', Array.from({ length: 30 }, (_, day) => (day % 2 ? -5 : 5))))!;
    expect(flipFlop.persistence).toBe(0);
  });

  it('recovers the persistence the errors were made with', () => {
    for (const persistence of [0, 0.3, 0.6]) {
      const pairs = Array.from({ length: 40 }, (_, product) => (
        [1, 2, 3, 4, 5].flatMap((origin) => path(`P${product}`, `origin-${origin}`, persistentErrors(persistence, 30, product * 10 + origin)))
      )).flat();
      expect(estimateValidationErrors(pairs)!.persistence).toBeCloseTo(persistence, 1);
    }
  });

  it('pools the products in units of their own spread, so a large product does not decide alone', () => {
    const small = [1, 2, 3].flatMap((origin) => path('SMALL', `o${origin}`, persistentErrors(0.7, 30, origin)));
    const large = [1, 2, 3].flatMap((origin) => path('LARGE', `o${origin}`, persistentErrors(0, 30, 50 + origin).map((error) => error * 1000)));
    const own = (pairs: ValidationPair[]) => estimateValidationErrors(pairs)!.persistence!;
    const pooled = own([...small, ...large]);
    expect(pooled).toBeGreaterThan(own(large) + 0.15);
    expect(pooled).toBeLessThan(own(small) - 0.15);
  });

  it('only links consecutive days of the same origin', () => {
    // Two origins of 12 days each: 22 day-to-day steps, not 23.
    const steps = [...path('A', 'o1', Array(12).fill(1)), ...path('A', 'o2', Array(12).fill(-1))];
    expect(estimateValidationErrors(steps)!.persistence).toBe(0.95);
    // A gap in the leads breaks the chain: 10 single days give no step at all.
    const gaps = Array.from({ length: 10 }, (_, index) => ({ sku: 'A', origin: 'o1', lead: index * 2 + 1, actual: 12, forecast: 10 }));
    expect(estimateValidationErrors(gaps)!.persistence).toBeNull();
  });

  it('says nothing about persistence from a handful of pairs, and nothing at all without usable pairs', () => {
    expect(estimateValidationErrors(path('A', 'o1', [1, 2, 1, 2, 1, 2]))!.persistence).toBeNull();
    expect(estimateValidationErrors([])).toBeNull();
    expect(estimateValidationErrors([{ sku: 'A', origin: 'o1', lead: 1, actual: Number.NaN, forecast: 3 }])).toBeNull();
    // A perfect forecast has no error to describe.
    expect(estimateValidationErrors(path('A', 'o1', Array(30).fill(0)))).toMatchObject({ persistence: null, spread: {} });
  });
});
