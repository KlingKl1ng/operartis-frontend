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
