// Each input layout is read end to end (headers → proposed mapping → forecast
// per product → the batch request the engine receives) and compared with a
// stored result. The stored results were checked against the requests the old
// inventory.html sent for the same files; they differ from it only in dates,
// which the old page moved one day earlier in time zones east of UTC.
//
// After an intended change to parsing, refresh them with
//   UPDATE_INVENTORY_GOLDEN=1 pnpm test:inventory
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, resolveSkuParams } from '../domain/params';
import { batchRequest } from '../domain/requests';
import type { Mapping } from '../domain/types';
import { autoMapping } from './mapping';
import { inspectFile, parseFile } from './workbook';

const fixturePath = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function load(path: string): ArrayBuffer {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Everything the page derives from a file before the first run, with default sidebar values. */
export function readEndToEnd(path: string, adjust: (mapping: Mapping) => Mapping = (mapping) => mapping) {
  const data = load(path);
  const { headers, metadata } = inspectFile(data);
  const proposed = autoMapping(headers, metadata);
  const mapping = adjust(proposed.mapping);
  const parsed = parseFile(data, mapping, { today: new Date(2026, 2, 1) });
  // As on the page right after loading: file values over the defaults, nothing changed by hand.
  const sources = { defaults: DEFAULT_PARAMS, overrides: {}, file: parsed.skuParams };
  const request = batchRequest(
    parsed.skus.map((sku) => ({ sku, forecast: parsed.grouped[sku], params: resolveSkuParams(sku, sources) })),
    basename(path),
  );
  return { headers, metadata, mapping, locks: proposed.locks, skus: parsed.skus, request };
}

const FIXTURES: Array<{ file: string; format: Mapping['format'] }> = [
  { file: 'vertical.xlsx', format: 'vertical' },
  { file: 'horizontal.xlsx', format: 'horizontal' },
  { file: 'prefixed.xlsx', format: 'forecaster_prefixed' },
  { file: 'forecaster.xlsx', format: 'forecaster' },
  { file: 'residual.xlsx', format: 'operartis_residual' },
  { file: 'residual-validated.xlsx', format: 'operartis_residual' },
];

describe('reading an uploaded file end to end', () => {
  for (const { file, format } of FIXTURES) {
    it(`${file} is read as ${format} and gives the stored request`, () => {
      const result = JSON.parse(JSON.stringify(readEndToEnd(fixturePath(file))));
      expect(result.mapping.format).toBe(format);
      const goldenPath = fixturePath(file.replace('.xlsx', '.golden.json'));
      if (process.env.UPDATE_INVENTORY_GOLDEN || !existsSync(goldenPath)) {
        writeFileSync(goldenPath, `${JSON.stringify(result, null, 1)}\n`);
      }
      expect(result).toEqual(JSON.parse(readFileSync(goldenPath, 'utf8')));
    });
  }
});

describe('a forecast report with validation sheets', () => {
  // residual-validated.xlsx was written by the forecaster for six products with
  // demand whose deviations linger for some days (five origins of 30 days each).
  const read = (file: string) => {
    const data = load(fixturePath(file));
    const { headers, metadata } = inspectFile(data);
    return parseFile(data, autoMapping(headers, metadata).mapping);
  };

  it('takes the persistence and the spread from the past forecast errors', () => {
    const parsed = read('residual-validated.xlsx');
    expect(parsed.skus).toHaveLength(6);
    expect(parsed.validation).toEqual({ persistence: 0.6, spreadProducts: 6 });
    // SKU-01: Resid_Std is 4.5616, the error on unseen days 5.31.
    const [first] = parsed.grouped['SKU-01'];
    expect(first.resid_std).toBeCloseTo(5.31, 2);
    expect(first.p90).toBeCloseTo(first.p50 + 1.28 * first.resid_std!, 6);
    expect(parsed.grouped['SKU-01']).toHaveLength(30);
  });

  it('keeps Resid_Std and reports nothing for a report without those sheets', () => {
    const parsed = read('residual.xlsx');
    expect(parsed.validation).toBeUndefined();
    expect(parsed.grouped.GOINANI4060[0].resid_std).toBe(31.5435);
  });
});

// One-off comparison with other files (for example real templates): set
// PARITY_FILES to a comma-separated list of paths and PARITY_OUT to a folder.
if (process.env.PARITY_FILES && process.env.PARITY_OUT) {
  describe('parity dump', () => {
    it('writes what the new code reads from each file', () => {
      mkdirSync(process.env.PARITY_OUT!, { recursive: true });
      for (const path of process.env.PARITY_FILES!.split(',')) {
        writeFileSync(`${process.env.PARITY_OUT}/${basename(path)}.new.json`, JSON.stringify(readEndToEnd(path), null, 1));
      }
    });
  });
}
