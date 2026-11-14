import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, leadTimeValuesValid, lockedFields, resolveSkuParams, withFileParams } from './params';
import { batchRequest, exportRequest, optimizationRequest, simulationRequest } from './requests';
import type { FileSkuParams, Params, SimResult, TimelineDay } from './types';

const fromFile: FileSkuParams = { initialStock: 120, leadTime: 21, leadTimeStd: 0, reviewPeriod: 14, moqValue: 25, serviceLevel: 0.9 };
const forecast = [{ date: '2026-01-01', p50: 10, p90: 13 }];

describe('which parameters a product runs with', () => {
  it('lays file values over the sidebar and keeps the sidebar where the file is silent', () => {
    expect(withFileParams(DEFAULT_PARAMS, fromFile)).toMatchObject({ initialStock: 120, reviewPeriod: 14, serviceLevel: 0.9, moqValue: 25, safetyFactor: 1 });
    expect(withFileParams(DEFAULT_PARAMS, fromFile).leadTimeConfig).toMatchObject({ type: 'deterministic', deterministicValue: 21 });
    const silent: FileSkuParams = { initialStock: null, leadTime: null, leadTimeStd: 0, reviewPeriod: null, moqValue: 0, serviceLevel: null };
    expect(withFileParams(DEFAULT_PARAMS, silent)).toEqual(DEFAULT_PARAMS);
  });

  it('prefers what the user set for the product, then the file, then the sidebar', () => {
    const sidebar: Params = { ...DEFAULT_PARAMS, initialStock: 999 };
    const manual: Params = { ...DEFAULT_PARAMS, initialStock: 42 };
    const sources = { sidebar, manual: { A: manual }, file: { A: fromFile, B: fromFile } };
    expect(resolveSkuParams('A', sources).initialStock).toBe(42);
    expect(resolveSkuParams('B', sources).initialStock).toBe(120);
    expect(resolveSkuParams('C', sources).initialStock).toBe(999);
  });

  it('locks file parameters only in Optimize mode with a file loaded', () => {
    const locks = { initial_stock: true, lead_time_mean: true };
    expect(lockedFields('optimize', true, locks)).toEqual({ initialStock: true, leadTime: true, reviewPeriod: false, moq: false, serviceLevel: false });
    expect(lockedFields('whatif', true, locks).initialStock).toBe(false);
    expect(lockedFields('optimize', false, locks).initialStock).toBe(false);
  });

  it('accepts a lead-time value list only when its probabilities add up to 1', () => {
    const list = (probabilities: number[]) => ({ ...DEFAULT_PARAMS.leadTimeConfig, type: 'value' as const, values: probabilities.map((probability, index) => ({ value: 7 + index, probability })) });
    expect(leadTimeValuesValid(list([0.5, 0.5]))).toBe(true);
    expect(leadTimeValuesValid(list([0.5, 0.4]))).toBe(false);
    expect(leadTimeValuesValid({ ...list([0.2]), type: 'poisson' })).toBe(true);
  });
});

describe('requests to the engine', () => {
  it('sends the safety factor with a simulation and the minimum order only when set', () => {
    const body = simulationRequest('A', forecast, { ...DEFAULT_PARAMS, safetyFactor: 1.5 }, 'file.xlsx');
    expect(body).toMatchObject({ sku_id: 'A', input_filename: 'file.xlsx', initial_stock: 500, lead_time_days: 14, lead_time_std: 0, review_period: 7, target_service_level: 0.95, safety_factor: 1.5 });
    expect(body).not.toHaveProperty('min_order_qty');
    expect(body.forecast_data).toEqual([{ date: '2026-01-01', p50: 10, p90: 13, resid_std: null, horizon_index: null }]);
    expect(simulationRequest('A', forecast, { ...DEFAULT_PARAMS, moqValue: 40 }, null).min_order_qty).toBe(40);
  });

  it('sends the optimizer settings and no safety factor with an optimization', () => {
    const body = optimizationRequest('A', forecast, DEFAULT_PARAMS, null);
    expect(body).toMatchObject({ tolerance: 0.01, max_iterations: 15, num_simulation_runs: 500 });
    expect(body).not.toHaveProperty('safety_factor');
  });

  it('sends a value list only for that lead-time type', () => {
    const config = { ...DEFAULT_PARAMS.leadTimeConfig, type: 'value' as const, values: [{ value: 7, probability: 0.4 }, { value: 9, probability: 0.6 }] };
    expect(optimizationRequest('A', forecast, { ...DEFAULT_PARAMS, leadTimeConfig: config }, null).lead_time_config.values).toEqual(config.values);
    expect(optimizationRequest('A', forecast, DEFAULT_PARAMS, null).lead_time_config.values).toBeNull();
  });

  it('builds a batch with one entry per product and an explicit empty minimum order', () => {
    const body = batchRequest([{ sku: 'A', forecast, params: DEFAULT_PARAMS }, { sku: 'B', forecast, params: { ...DEFAULT_PARAMS, moqValue: 5 } }], null);
    expect(body.input_filename).toBe('Inventory_Data');
    expect(body.sku_params.map((item) => [item.sku_id, item.min_order_qty])).toEqual([['A', null], ['B', 5]]);
  });

  it('exports only products with results, using the parameters each one ran with', () => {
    const day = { day: 0, date: '2026-01-01', p50: 10, p90: 13, s_t: 30, S_t: 50, actualDemand: 9, invAfterDemand: 41, inTransit: 0, inventoryPosition: 41, orderPlaced: null, arrivedQty: 0, stockoutEvent: false, backlog: 0 } as TimelineDay;
    const sim: SimResult = { timeline: [day, { ...day, day: 1, s_t: 40, S_t: 70 }], metrics: { alpha: 0.9, beta: 0.95, avgInventory: 40, totalStockouts: 1 } };
    const body = exportRequest({
      skus: ['A', 'B'],
      paramsFor: (sku) => (sku === 'A' ? { ...DEFAULT_PARAMS, initialStock: 77 } : DEFAULT_PARAMS),
      forecasts: { A: [{ ...forecast[0], resid_std: 2, horizon_index: 1 }], B: forecast },
      simResults: { A: sim },
      mcResults: {},
      optimizationResults: {},
      sourceJobId: 'job-1',
      filename: null,
      mode: 'optimize',
      language: 'de',
    });
    expect(body).toMatchObject({ source_job_id: 'job-1', input_filename: 'Inventory_Data', simulation_mode: 'optimize', num_monte_carlo_runs: 500, language: 'de' });
    expect(body.sku_results.map((item) => item.sku_id)).toEqual(['A']);
    expect(body.sku_results[0]).toMatchObject({ initial_stock: 77, achieved_alpha: 0.9, avg_s_t: 35, avg_S_t: 60, total_days: 2 });
    expect(body.sku_results[0].forecast_data).toEqual([{ date: '2026-01-01', p50: 10, resid_std: 2, horizon_index: 1 }]);
  });
});
