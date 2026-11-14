// Read an uploaded spreadsheet: a first look to find the header row, then the
// forecast and optional parameters per product once the columns are mapped.
import * as XLSX from 'xlsx';
import { addDays, byDate, isNumericDate, localIsoDate, parseHeaderDate, parsePrefixedDate, parseStartDate } from './dates';
import type { FileMetadata, FileSkuParams, ForecastPoint, Mapping, ParsedFile } from '../domain/types';

type Row = Record<string, unknown>;

/** A number from a cell; text may use commas as thousands separators. NaN when it is not a number. */
function cellNumber(value: unknown): number {
  return typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
}

const numberOrZero = (value: unknown) => cellNumber(value) || 0;

/** Footer and notice rows that are not products (copyright lines, totals, page numbers). */
const NOT_A_SKU = [
  /^©/,
  /copyright/i,
  /all rights reserved/i,
  /operartis analytics/i,
  /^\d{4}\s+operartis/i,
  /^generated\s+(by|on|at)/i,
  /^report\s+generated/i,
  /^page\s+\d+/i,
  /^total[:\s]/i,
  /^sum[:\s]/i,
  /^average[:\s]/i,
];

export function isValidSku(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const text = String(value).toLowerCase().trim();
  return !NOT_A_SKU.some((pattern) => pattern.test(text));
}

function firstSheet(data: ArrayBuffer, cellDates: boolean): XLSX.WorkSheet {
  const workbook = XLSX.read(data, { type: 'array', cellDates });
  // Limits on sheets and rows; skipped outside the browser (tests).
  if (typeof window !== 'undefined') window.OperartisSecurity?.validateWorkbook(workbook);
  return workbook.Sheets[workbook.SheetNames[0]];
}

/**
 * First look at a file: its column headers, and for an Operartis forecast
 * report the row the headers are on and the forecast horizon stated in it.
 */
export function inspectFile(data: ArrayBuffer): { headers: string[]; metadata: FileMetadata } {
  const sheet = firstSheet(data, false);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });

  let isOperartisForecast = false;
  let forecastHorizon = 0;
  for (let index = 0; index < Math.min(10, rows.length); index++) {
    const text = Array.from(rows[index] || [], (cell) => (cell == null ? '' : String(cell))).join(' ').toLowerCase();
    if (text.includes('operartis') && text.includes('forecast')) isOperartisForecast = true;
    if (text.includes('forecast horizon')) {
      const match = /(\d+)\s*periods?/i.exec(text);
      if (match) forecastHorizon = parseInt(match[1], 10);
    }
  }

  let headerRowIndex = 0;
  if (isOperartisForecast) {
    for (let index = 0; index < Math.min(20, rows.length); index++) {
      const cells = Array.from(rows[index] || [], (cell) => String(cell).toLowerCase());
      if (cells.includes('sku') && cells.includes('resid_std')) {
        headerRowIndex = index;
        break;
      }
    }
  }

  const reportLayout = isOperartisForecast && headerRowIndex > 0;
  const headerRow = reportLayout ? rows[headerRowIndex] : rows[0];
  const headers = Array.from(headerRow || [], (cell) => (cell == null ? '' : String(cell))).filter((header) => header !== '');
  return { headers, metadata: reportLayout ? { isOperartisForecast: true, headerRowIndex, forecastHorizon } : {} };
}

/** Optional per-product parameters from the mapped columns of one row. */
function fileParams(row: Row, mapping: Mapping): FileSkuParams {
  // A real zero in a number cell counts; "0" as text or an unreadable cell means "not given".
  const read = (column: string): number | null => {
    if (!column) return null;
    const value = row[column];
    return typeof value === 'number' ? value : cellNumber(value) || null;
  };
  const serviceLevel = read(mapping.target_service_level);
  return {
    initialStock: read(mapping.initial_stock),
    leadTime: read(mapping.lead_time_mean),
    leadTimeStd: read(mapping.lead_time_std) ?? 0,
    reviewPeriod: read(mapping.review_period),
    moqValue: read(mapping.min_order_qty) ?? 0,
    // 95 and 0.95 both mean 95 %.
    serviceLevel: serviceLevel != null ? (serviceLevel > 1 ? serviceLevel / 100 : serviceLevel) : null,
  };
}

/** Rows of an Operartis forecast report, whose header row is not the first row. */
function reportRows(sheet: XLSX.WorkSheet, mapping: Mapping): Row[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  let headerRowIndex = mapping.header_row_index || 0;
  if (headerRowIndex === 0) {
    for (let index = 0; index < Math.min(20, rows.length); index++) {
      const cells = Array.from(rows[index] || [], (cell) => String(cell || '').toLowerCase());
      if (cells.includes('sku') && cells.some((cell) => cell === 'resid_std' || cell === 'residstd')) {
        headerRowIndex = index;
        break;
      }
    }
  }
  const headerByColumn = new Map<number, string>();
  Array.from(rows[headerRowIndex] || []).forEach((cell, column) => {
    const header = cell == null ? '' : cell instanceof Date ? localIsoDate(cell) : String(cell);
    if (header) headerByColumn.set(column, header);
  });

  const data: Row[] = [];
  for (let index = headerRowIndex + 1; index < rows.length; index++) {
    const cells = rows[index];
    if (!cells || Array.from(cells).every((cell) => cell === null || cell === undefined || cell === '')) continue;
    const row: Row = {};
    headerByColumn.forEach((header, column) => {
      const value = cells[column];
      if (value !== undefined && value !== null) row[header] = value;
    });
    if (isValidSku(row[mapping.sku_id])) data.push(row);
  }
  return data;
}

/**
 * Read the forecast per product. `today` is the first forecast day of a
 * P50_D1… file that has no start-date column.
 */
export function parseFile(data: ArrayBuffer, mapping: Mapping, options: { today?: Date } = {}): ParsedFile {
  const sheet = firstSheet(data, true);
  const rows: Row[] = mapping.format === 'operartis_residual'
    ? reportRows(sheet, mapping)
    // Cells are read as displayed text, so a number shown with two decimals is read with two decimals.
    : XLSX.utils.sheet_to_json<Row>(sheet, { raw: false, dateNF: 'yyyy-mm-dd' });

  const grouped: Record<string, ForecastPoint[]> = {};
  const skuParams: Record<string, FileSkuParams> = {};

  const eachProductRow = (visit: (row: Row, skuId: string) => void) => {
    rows.forEach((row, index) => {
      const rawSku = row[mapping.sku_id];
      if (!isValidSku(rawSku)) return;
      const skuId = String(rawSku || `SKU_${index + 1}`);
      grouped[skuId] = [];
      visit(row, skuId);
      skuParams[skuId] = fileParams(row, mapping);
    });
  };

  if (mapping.format === 'horizontal') {
    const p50Columns = mapping.p50_columns || [];
    const p90Columns = mapping.p90_columns || [];
    const startCell = rows[0] && mapping.start_date ? rows[0][mapping.start_date] : null;
    const start = startCell ? parseStartDate(startCell) : localIsoDate(options.today || new Date());
    eachProductRow((row, skuId) => {
      p50Columns.forEach((p50Column, dayIndex) => {
        const p90Column = p90Columns[dayIndex];
        const p90Cell = p90Column ? row[p90Column] : null;
        const p50 = numberOrZero(row[p50Column]);
        const p90 = p90Cell ? numberOrZero(p90Cell) : p50 * 1.3;
        if (p50 > 0 || p90 > 0) grouped[skuId].push({ date: addDays(start, dayIndex), p50, p90 });
      });
    });
  } else if (mapping.format === 'forecaster_prefixed') {
    const p50Columns = mapping.p50_columns || [];
    const p90Columns = mapping.p90_columns || [];
    eachProductRow((row, skuId) => {
      p50Columns.forEach((p50Column, index) => {
        const date = parsePrefixedDate(p50Column);
        if (!date) return;
        const p90Column = p90Columns[index];
        const p90Cell = p90Column ? row[p90Column] : null;
        const p50 = numberOrZero(row[p50Column]);
        const p90 = p90Cell ? numberOrZero(p90Cell) : p50 * 1.3;
        if (p50 > 0 || p90 > 0) grouped[skuId].push({ date, p50, p90 });
      });
      grouped[skuId].sort(byDate);
    });
  } else if (mapping.format === 'operartis_residual') {
    const dataHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
    const dateColumns = dataHeaders.filter((header) => isNumericDate(header) || parseHeaderDate(header) !== null);
    // The forecast is the last N date columns; the columns before them are sales history.
    const forecastColumns = dateColumns.slice(-(mapping.forecast_horizon || dateColumns.length));
    eachProductRow((row, skuId) => {
      const residStd = numberOrZero(row[mapping.resid_std || '']);
      forecastColumns.forEach((column, index) => {
        const date = parseHeaderDate(column);
        if (!date) return;
        const p50 = numberOrZero(row[column]);
        const horizonIndex = index + 1;
        // Uncertainty grows with the square root of the horizon; P90 assumes a normal spread.
        const sigma = residStd * Math.sqrt(horizonIndex);
        const p90 = p50 + 1.28 * sigma;
        if (p50 >= 0) grouped[skuId].push({ date, p50, p90: Math.max(p50, p90), resid_std: residStd, horizon_index: horizonIndex });
      });
      grouped[skuId].sort(byDate);
    });
  } else if (mapping.format === 'forecaster') {
    const factor = mapping.p90_variance_factor || 1.3;
    eachProductRow((row, skuId) => {
      (mapping.date_columns || []).forEach((column) => {
        const date = parseHeaderDate(column);
        if (!date) return;
        const p50 = numberOrZero(row[column]);
        if (p50 > 0) grouped[skuId].push({ date, p50, p90: p50 * factor });
      });
      grouped[skuId].sort(byDate);
    });
  } else {
    const hasSku = Boolean(mapping.sku_id);
    rows.forEach((row) => {
      const rawSku = hasSku ? row[mapping.sku_id] : 'ALL_DATA';
      if (hasSku && !isValidSku(rawSku)) return;
      const skuId = hasSku ? String(rawSku || 'DEFAULT') : 'ALL_DATA';
      if (!grouped[skuId]) grouped[skuId] = [];
      const p50 = numberOrZero(row[mapping.p50 || '']);
      const p90 = numberOrZero(row[mapping.p90 || '']);
      const dateCell = row[mapping.date || ''];
      let date: string;
      if (dateCell instanceof Date) date = localIsoDate(dateCell);
      else if (typeof dateCell === 'number') date = new Date((dateCell - 25569) * 86400 * 1000).toISOString().split('T')[0];
      else date = dateCell as string;
      if (p50 > 0 || p90 > 0) grouped[skuId].push({ date, p50, p90: p90 || p50 * 1.3 });
    });
    Object.values(grouped).forEach((points) => points.sort(byDate));
    // Parameters come from the first row of each product.
    if (mapping.initial_stock || mapping.lead_time_mean || mapping.review_period) {
      rows.forEach((row) => {
        const skuId = hasSku ? String(row[mapping.sku_id] || 'DEFAULT') : 'ALL_DATA';
        if (!skuParams[skuId]) skuParams[skuId] = fileParams(row, mapping);
      });
    }
  }

  const skus = Object.keys(grouped).filter((sku) => grouped[sku].length > 0);
  return { grouped, skus, skuParams };
}
