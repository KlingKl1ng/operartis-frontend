const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../vendor/xlsx-0.18.5.full.min.js');
const source = fs.readFileSync(path.join(__dirname, '../forecaster.html'), 'utf8');
const helpers = source.slice(source.indexOf('const DEFAULT_FREQUENCY_PROFILES ='), source.indexOf('const parseForecastCapabilities ='));
const {inferFrequencyFromHeaders: infer, parseForecastHeaderDate: parse, readForecastWorksheet: read} = new Function('XLSX', helpers + '\nreturn {inferFrequencyFromHeaders, parseForecastHeaderDate, readForecastWorksheet};')(XLSX);
const daily = Array.from({length: 40}, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString());

test('regular supported calendars use all timestamps, including year-end and leap years', () => {
    assert.equal(infer(daily), 'daily');
    assert.equal(infer(['2020-01-30', '2021-01-30', '2022-01-30']), 'yearly');
    assert.equal(infer(daily.filter(d => ![0, 6].includes(new Date(d).getUTCDay()))), 'business_daily');
    assert.equal(infer(daily.filter((_, i) => i % 7 === 0)), 'weekly');
    assert.equal(infer(Array.from({length: 40}, (_, i) => new Date(Date.UTC(2025, 0, 1, i)).toISOString())), 'hourly');
    for (const [months, name] of [[1, 'monthly'], [3, 'quarterly'], [12, 'yearly']]) {
        for (const day of [1, 15]) {
            assert.equal(infer(Array.from({length: 16}, (_, i) => new Date(Date.UTC(2018, months * i, day)).toISOString())), name);
        }
        assert.equal(infer(Array.from({length: 16}, (_, i) => new Date(Date.UTC(2018, months * i + 1, 0)).toISOString())), name);
    }
});

test('irregular, missing, duplicate, reversed and unsupported intervals never become monthly', () => {
    for (const headers of [[], ['SKU', ...daily], daily.filter((_, i) => i !== 15), [...daily, daily[39]], [...daily].reverse(), ['2025-01-01', 'bad-date']]) {
        assert.equal(infer(headers), 'unsupported');
    }
    for (const hours of [1 / 60, 3, 48]) {
        assert.equal(infer(Array.from({length: 20}, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * hours * 3600000).toISOString())), 'unsupported');
    }
    assert.equal(infer(['2020-01-01', '2020-07-01', '2021-01-01']), 'unsupported');
    assert.equal(infer(['2020-01-01', '2022-01-01', '2024-01-01']), 'unsupported');
});

test('date parsing is independent of browser timezone and ambiguous locales', () => {
    for (const [header, expected] of [['2020', '2020-01-01'], ['2020-02', '2020-02-01'], ['January 2021', '2021-01-01'], ['Jan-21', '2021-01-01'], ['2020-02-29 12:30:00', '2020-02-29T12:30:00'], ['2025-01-01T12:30:00+02:00', '2025-01-01T10:30:00']]) {
        assert.equal(parse(header), Date.parse(expected + 'Z'));
    }
    for (const header of ['01/02/2025', '2025-02-30', '2025-01-01.1', '2025-01-01 25:00']) assert.ok(Number.isNaN(parse(header)));
});

for (const [hourly, format, expected] of [[false, 'dd/mm/yyyy', 'daily'], [true, 'yyyy-mm-dd', 'hourly'], [true, 'yyyy-mm-dd hh:mm:ss', 'hourly']]) {
    for (const date1904 of [false, true]) test(`raw Excel timestamps survive ${format}, epoch ${date1904 ? 1904 : 1900}`, () => {
        const start = Date.UTC(2025, 0, 1);
        const timestamps = Array.from({length: 16}, (_, i) => start + i * (hourly ? 3600000 : 86400000));
        const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
        const sheet = XLSX.utils.aoa_to_sheet([['SKU', ...timestamps.map(time => (time - epoch) / 86400000)], [123, ...timestamps.map(() => 10)]]);
        for (let c = 1; c <= timestamps.length; c++) sheet[XLSX.utils.encode_cell({r: 0, c})].z = format;
        sheet.A2.z = '000000';
        const workbook = XLSX.utils.book_new();
        workbook.Workbook = {WBProps: {date1904}};
        XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
        const imported = XLSX.read(XLSX.write(workbook, {type: 'buffer', bookType: 'xlsx'}), {type: 'buffer', cellDates: false, cellNF: true, raw: true});
        const result = read(imported);
        assert.deepEqual(result.headers.slice(1).map(parse), timestamps);
        assert.equal(infer(result.headers.slice(1)), expected);
        assert.equal(result.rows[0][0], '000123');
    });
}

test('CSV text dates and numeric annual headers are not coerced to Excel serial dates', () => {
    const csv = 'SKU,2020,2021,2022,2023\nA,1,2,3,4';
    const result = read(XLSX.read(csv, {type: 'string', cellDates: false, cellNF: true, raw: true}));
    assert.equal(infer(result.headers.slice(1)), 'yearly');
    const ambiguous = read(XLSX.read('SKU,01/02/2025,02/02/2025,03/02/2025\nA,1,2,3', {type: 'string', raw: true}));
    assert.equal(infer(ambiguous.headers.slice(1)), 'unsupported');
});


const resultHelper=source.slice(source.indexOf('const forecastResultFrequency ='),source.indexOf('const ForecastRunSummary ='));
const resultFrequency=new Function('XLSX',helpers+resultHelper+';return forecastResultFrequency;')(XLSX);
test('run summary retains missing historical dates when detecting frequency',()=>{
 const data={forecast_data:daily.map((date,i)=>({date,actual_history:i===5||i===20?null:100}))};
 data.forecast_data.push({date:'2025-03-01',future_forecast:120});
 const before=JSON.stringify(data);
 assert.equal(resultFrequency(data),'daily');
 assert.equal(JSON.stringify(data),before);
 const monthly={forecast_data:['2026-01-01','2026-02-01','2026-03-01'].map((date,i)=>({date,actual_history:i===1?null:100}))};
 assert.equal(resultFrequency(monthly),'monthly');
});
test('run summary uses the saved preparation frequency for the selected result',()=>{
 const data={preparation:{frequency:'daily'},forecast_data:[{date:'2026-01-01',actual_history:null}]};
 assert.equal(resultFrequency(data),'daily');
 assert.equal(resultFrequency({...data,preparation:{frequency:'business_daily'}}),'business_daily');
 assert.equal(resultFrequency({...data,preparation:{frequency:null}}),'unsupported');
 assert.equal(resultFrequency({...data,preparation:{frequency:'invalid'}}),'unsupported');
 assert.equal(resultFrequency({forecast_data:[{date:'2026-01-01',future_forecast:100}]}),'unsupported');
});
