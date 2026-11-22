// Builds the small spreadsheets the parsing tests read, one per input layout.
// Run from the frontend folder:  node inventory-app/scripts/build-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const out = (name) => fileURLToPath(new URL(`../src/parsing/fixtures/${name}`, import.meta.url));
const save = (name, sheet, sheetName = 'Sheet1') => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  writeFileSync(out(name), XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  console.log('wrote', name);
};
const dateCell = (y, m, d) => ({ t: 'n', v: Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000), z: 'yyyy-mm-dd' });
const day = (n) => `2026-01-${String(15 + n).padStart(2, '0')}`;

// ---- vertical: one row per product and date ----
{
  const rows = [['SKU_ID', 'Date', 'P50', 'P90', 'Initial_Stock', 'Lead_Time_Mean', 'Lead_Time_Std', 'Review_Period', 'Min_Order_Qty', 'Target_Service_Level']];
  for (let i = 1; i <= 8; i++) {
    // Product A: real date cells, service level written as a percentage.
    rows.push(['FAST-A', dateCell(2026, 1, 15 + i), i === 3 ? { t: 'n', v: 1234.5, z: '#,##0.0' } : 90 + i * 2.5, i === 5 ? null : 120 + i * 3.25, 500, 14, 3, 7, 0, 95]);
  }
  for (let i = 8; i >= 1; i--) {
    // Product B: dates as text and out of order; one period with no demand at all.
    rows.push(['SLOW-B', day(i), i === 4 ? 0 : 18 + i * 0.4, i === 4 ? 0 : 26 + i * 0.6, 120, 21, 0, 14, 25, 0.9]);
  }
  for (let i = 1; i <= 8; i++) rows.push(['NEW-C', day(i), 40 + i, 66 + i * 1.5, 150, 7, 1, 1, 10, 0.99]);
  rows.push(['Total:', null, 9999, 9999]);
  save('vertical.xlsx', XLSX.utils.aoa_to_sheet(rows), 'Inventory_Data');
}

// ---- horizontal: one row per product, P50_D1… / P90_D1… ----
{
  const header = ['SKU_ID', 'Start_Date'];
  for (let i = 1; i <= 8; i++) header.push(`P50_D${i}`);
  for (let i = 1; i <= 8; i++) header.push(`P90_D${i}`);
  header.push('Initial_Stock', 'Lead_Time_Mean', 'Review_Period', 'Min_Order_Qty', 'Target_Service_Level');
  const product = (sku, base, spread, tail) => [sku, dateCell(2026, 2, 26), ...Array.from({ length: 8 }, (_, i) => base + i * 1.5), ...Array.from({ length: 8 }, (_, i) => (i === 6 ? null : base + spread + i * 2)), ...tail];
  save('horizontal.xlsx', XLSX.utils.aoa_to_sheet([
    header,
    product('FAST-A', 100, 28, [500, 14, 7, 0, 0.95]),
    product('SLOW-B', 19, 6, [120, 21, 14, 25, 90]),
    product('NEW-C', 42, 20, [150, 7, 1, 10, 0.99]),
  ]), 'Inventory_Data');
}

// ---- forecaster_prefixed: P50_dd.mm.yyyy / P90_dd.mm.yyyy across a month end ----
{
  const dates = ['29.01.2026', '30.01.2026', '31.01.2026', '01.02.2026', '02.02.2026', '03.02.2026', '04.02.2026', '05.02.2026'];
  const header = ['SKU', ...dates.flatMap((d) => [`P50_${d}`, `P90_${d}`]), 'Initial_Stock', 'Lead_Time'];
  const product = (sku, base, tail) => [sku, ...dates.flatMap((_, i) => [base + i * 3.1, base * 1.25 + i * 4.2]), ...tail];
  save('prefixed.xlsx', XLSX.utils.aoa_to_sheet([header, product('FAST-0001', 140, [600, 10]), product('SLOW-0010', 21, [80, 30])]), 'Forecast');
}

// ---- forecaster: plain date headers, P50 only ----
{
  const dates = ['16.01.2026', '17.01.2026', '18.01.2026', '19.01.2026', '20.01.2026', '21.01.2026', '22.01.2026', '23.01.2026'];
  save('forecaster.xlsx', XLSX.utils.aoa_to_sheet([
    ['Item_ID', ...dates],
    ['GOINANI5070', 169, 86, 68, 229, 0, 153, 133, 110],
    ['GOINANI4060', 351, 150, 196, 290, 262, 313, 252, 491],
    ['© 2026 Operartis Analytics. All rights reserved.'],
  ]), 'Sheet1');
}

// ---- operartis_residual: a forecast report with title rows above the table ----
{
  const dates = Array.from({ length: 10 }, (_, i) => `2024-01-${String(28 + i > 31 ? 28 + i - 31 : 28 + i).padStart(2, '0')}`.replace(/^2024-01-(0[1-6])$/, '2024-02-$1'));
  const rows = [
    [null, 'OPERARTIS FORECAST REPORT'],
    [null, 'Optimizing Today, Growing Tomorrow.'],
    [],
    ['Report By:', 'Operartis Analytics'],
    ['Report Date:', '2026-01-19 05:11'],
    ['Input File:', 'Daily Template Test'],
    ['Validation Method:', 'SS'],
    ['Forecast Horizon:', '6 periods'],
    [], [], [],
    ['SKU', 'Resid_Std', 'Initial_Stock', ...dates],
    ['GOINANI4060', 31.5435, 300, 20, 144, 39, 41, 42, 43, 44, 45, 46, 47],
    ['GOINANI5070', 8.0969, 0, 2, 2, 9, 9, 9, 10, 10, 10, 0, 11],
    [],
    ['© 2026 Operartis Analytics. All rights reserved.'],
  ];
  save('residual.xlsx', XLSX.utils.aoa_to_sheet(rows, { origin: 'A2' }), 'Forecast Report');
}
