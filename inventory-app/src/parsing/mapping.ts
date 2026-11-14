// Recognise the layout of an uploaded file and propose which column feeds which field.
import { isDateLike, isPrefixedP50, isPrefixedP90 } from './dates';
import { PARAM_COLUMN_KEYS, type FileMetadata, type FormatType, type LockState, type Mapping, type ParamColumnKey } from '../domain/types';

/**
 * Five layouts are recognised, checked in this order:
 * - operartis_residual: a forecast report from the Operartis forecaster (SKU, Resid_Std, date columns)
 * - forecaster_prefixed: one row per product with P50_dd.mm.yyyy / P90_dd.mm.yyyy columns
 * - horizontal: one row per product with P50_D1… / P90_D1… columns
 * - forecaster: one row per product with plain date columns (P90 is derived from P50)
 * - vertical: one row per product and date with P50 and P90 columns
 */
export function detectFormat(headers: string[]): FormatType {
  const lower = headers.map((header) => header.toLowerCase());
  const hasResidStd = lower.some((header) => header === 'resid_std' || header === 'residstd' || header === 'resid std');
  const hasSku = lower.some((header) => header === 'sku' || header === 'sku_id');
  const dateColumns = headers.filter(isDateLike);
  if (hasResidStd && hasSku && dateColumns.length >= 3) return 'operartis_residual';

  if (headers.filter(isPrefixedP50).length >= 5 && headers.filter(isPrefixedP90).length >= 5) return 'forecaster_prefixed';

  const dayP50 = lower.filter((header) => /p50_d\d+/.test(header)).length > 5;
  const dayP90 = lower.filter((header) => /p90_d\d+/.test(header)).length > 5;
  if (dayP50 && dayP90) return 'horizontal';

  if (dateColumns.length >= 5) return 'forecaster';
  return 'vertical';
}

const simplify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '_');

/** First header that contains any of the patterns, ignoring case and punctuation. */
function columnFinder(headers: string[]) {
  const simplified = headers.map(simplify);
  return (patterns: string[]): string => {
    const index = simplified.findIndex((header) => patterns.some((pattern) => header.includes(simplify(pattern))));
    return index >= 0 ? headers[index] : '';
  };
}

const locksFor = (columns: Record<ParamColumnKey, string>): LockState =>
  Object.fromEntries(PARAM_COLUMN_KEYS.map((key) => [key, Boolean(columns[key])])) as LockState;

/** The mapping proposed for a file, and which parameters it would take from the file. */
export function autoMapping(headers: string[], metadata: FileMetadata = {}): { mapping: Mapping; locks: LockState } {
  const format = detectFormat(headers);
  const find = columnFinder(headers);

  if (format === 'operartis_residual') {
    const dateColumns = headers.filter(isDateLike);
    const otherColumns = headers.filter((header) => !isDateLike(header));
    const forecastHorizon = metadata.forecastHorizon || dateColumns.length;
    const columns = {
      initial_stock: find(['initial_stock']),
      lead_time_mean: find(['lead_time_mean', 'lead_time']),
      lead_time_std: find(['lead_time_std']),
      review_period: find(['review_period']),
      min_order_qty: find(['min_order_qty', 'moq']),
      target_service_level: find(['target_service_level', 'service_level']),
    };
    return {
      mapping: {
        format,
        sku_id: find(['sku', 'sku_id']) || otherColumns[0] || headers[0],
        resid_std: headers.find((header) => ['resid_std', 'residstd', 'resid std'].includes(header.toLowerCase())) || '',
        date_columns: dateColumns,
        forecast_columns: dateColumns.slice(-forecastHorizon),
        forecast_horizon: forecastHorizon,
        header_row_index: metadata.headerRowIndex || 0,
        ...columns,
      },
      locks: locksFor(columns),
    };
  }

  if (format === 'horizontal') {
    const columns = {
      initial_stock: find(['initial_stock']),
      lead_time_mean: find(['lead_time_mean']),
      lead_time_std: find(['lead_time_std']),
      review_period: find(['review_period']),
      min_order_qty: find(['min_order_qty']),
      target_service_level: find(['target_service_level']),
    };
    return {
      mapping: {
        format,
        sku_id: find(['sku_id', 'sku']) || headers[0],
        p50_columns: headers.filter((header) => /p50_d\d+/.test(header.toLowerCase())),
        p90_columns: headers.filter((header) => /p90_d\d+/.test(header.toLowerCase())),
        start_date: find(['start_date']),
        ...columns,
      },
      locks: locksFor(columns),
    };
  }

  if (format === 'forecaster_prefixed') {
    const otherColumns = headers.filter((header) => !isPrefixedP50(header) && !isPrefixedP90(header));
    const columns = {
      initial_stock: find(['initial_stock']),
      lead_time_mean: find(['lead_time_mean', 'lead_time']),
      lead_time_std: find(['lead_time_std']),
      review_period: find(['review_period']),
      min_order_qty: find(['min_order_qty', 'moq']),
      target_service_level: find(['target_service_level', 'service_level']),
    };
    return {
      mapping: {
        format,
        sku_id: find(['sku', 'id', 'item', 'product', 'article']) || otherColumns[0] || headers[0],
        // Sorted as text, exactly as before: P50 and P90 columns pair up by position.
        p50_columns: headers.filter(isPrefixedP50).sort(),
        p90_columns: headers.filter(isPrefixedP90).sort(),
        ...columns,
      },
      locks: locksFor(columns),
    };
  }

  if (format === 'forecaster') {
    const dateColumns = headers.filter(isDateLike);
    const otherColumns = headers.filter((header) => !isDateLike(header));
    const columns = {
      initial_stock: find(['initial_stock']),
      lead_time_mean: find(['lead_time_mean', 'lead_time']),
      lead_time_std: find(['lead_time_std']),
      review_period: find(['review_period']),
      min_order_qty: find(['min_order_qty', 'moq']),
      target_service_level: find(['target_service_level', 'service_level']),
    };
    return {
      mapping: {
        format,
        sku_id: find(['sku', 'id', 'item', 'product', 'article']) || otherColumns[0] || headers[0],
        date_columns: dateColumns,
        p90_variance_factor: 1.3,
        ...columns,
      },
      locks: locksFor(columns),
    };
  }

  const columns = {
    initial_stock: find(['initial_stock', 'initial stock', 'starting_inventory']),
    lead_time_mean: find(['lead_time_mean', 'lead_time', 'leadtime']),
    lead_time_std: find(['lead_time_std', 'leadtime_std']),
    review_period: find(['review_period', 'review']),
    min_order_qty: find(['min_order_qty', 'moq', 'minimum_order']),
    target_service_level: find(['target_service_level', 'service_level', 'target_alpha']),
  };
  return {
    mapping: {
      format,
      date: find(['date', 'period', 'time', 'ds']) || headers[0],
      p50: find(['p50', 'median', 'forecast', 'demand']),
      p90: find(['p90', 'upper', 'high']),
      sku_id: find(['sku', 'id', 'item', 'product']),
      ...columns,
    },
    locks: locksFor(columns),
  };
}

/** Is enough mapped to read the file? */
export function mappingComplete(mapping: Mapping): boolean {
  switch (mapping.format) {
    case 'horizontal':
    case 'forecaster_prefixed':
      return Boolean(mapping.p50_columns?.length && mapping.p90_columns?.length);
    case 'forecaster':
      return Boolean(mapping.date_columns?.length);
    case 'operartis_residual':
      return Boolean(mapping.date_columns?.length && mapping.resid_std);
    default:
      return Boolean(mapping.date && mapping.p50 && mapping.p90);
  }
}
