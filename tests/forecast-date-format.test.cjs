const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../forecaster.html'), 'utf8');
const helper = source.slice(source.indexOf('const formatForecastDate ='), source.indexOf('const formatChartAxis ='));
const format = new Function(helper + '; return formatForecastDate;')();
test('Vietnamese and German dates are localized; English keeps ISO calendar order', () => {
    assert.equal(format('2026-02-03', 'vi-VN'), '03/02/2026');
    assert.equal(format('2026-02-03', 'de-DE'), '03.02.2026');
    assert.equal(format('2026-02-03', 'en-US'), '2026-02-03');
    assert.equal(format('2024-02-29', 'vi-VN'), '29/02/2024');
});
test('hourly timestamps retain their time, precision and timezone without date shifts', () => {
    assert.equal(format('2026-01-01T00:00:00Z', 'vi-VN'), '01/01/2026 00:00:00Z');
    assert.equal(format('2025-12-31T23:30:00.125-05:00', 'de-DE'), '31.12.2025 23:30:00.125-05:00');
    assert.equal(format('2026-01-01 01:00', 'en-US'), '2026-01-01 01:00');
});
test('missing labels and non-ISO values are not guessed or reinterpreted', () => {
    assert.equal(format(null, 'vi-VN'), '');
    assert.equal(format('', 'de-DE'), '');
    assert.equal(format('01/02/2026', 'en-US'), '01/02/2026');
    assert.equal(format('2026', 'vi-VN'), '2026');
});
const {parseCalendarDateInput:parse,formatSourcePreviewCell:cell,formatCalendarMessage:message}=new Function(helper+';return {parseCalendarDateInput,formatSourcePreviewCell,formatCalendarMessage};')();
test('calendar entry converts language-specific dates into canonical ISO without rollover',()=>{
 assert.equal(parse('03/02/2026','vi-VN'),'2026-02-03');
 assert.equal(parse('03.02.2026','de-DE'),'2026-02-03');
 for(const locale of ['en-US','vi-VN','de-DE']){
  assert.equal(parse('2024-02-29',locale),'2024-02-29');
  assert.equal(parse('2026-02-29',locale),null);
  assert.equal(parse('2026-04-31',locale),null);
  assert.equal(parse('',locale),'');
 }
 assert.equal(parse('02/03/2026','en-US'),null);
 assert.equal(parse('31.12.2026','vi-VN'),null);
 assert.equal(parse('29/02/1900','vi-VN'),null);
 assert.equal(parse('29/02/2000','vi-VN'),'2000-02-29');
});
test('preview date cells and conflict dates localize without changing IDs or quantities',()=>{
 const source={format:'vertical',headers:['Item ID','Date','Quantity'],mapping:{date:'Date'}};
 assert.equal(cell('2026-02-03',1,source,'de-DE'),'03.02.2026');
 assert.equal(cell('2026-02-03',0,source,'de-DE'),'2026-02-03');
 assert.equal(cell(123,2,source,'vi-VN'),'123');
 assert.equal(message('Closed dates: 2026-02-03, 2026-02-04','vi-VN'),'Closed dates: 03/02/2026, 04/02/2026');
});

test('compact calendar entry follows the displayed date order and produces ISO values', () => {
    assert.equal(parse('20260101', 'en-US'), '2026-01-01');
    assert.equal(parse('20261203', 'en-US'), '2026-12-03');
    assert.equal(parse(' 20240229 ', 'en-US'), '2024-02-29');
    for (const locale of ['vi-VN', 'de-DE']) {
        assert.equal(parse('01012026', locale), '2026-01-01');
        assert.equal(parse('03122026', locale), '2026-12-03');
        assert.equal(parse('29022024', locale), '2024-02-29');
        assert.equal(parse('29022000', locale), '2000-02-29');
    }
});

test('compact calendar entry rejects impossible dates, partial input and excess digits', () => {
    for (const value of ['20260229', '19000229', '20260431', '20260001', '20261301', '20260100', '2026010', '202601011', '2026a101']) {
        assert.equal(parse(value, 'en-US'), null, value);
    }
    for (const locale of ['vi-VN', 'de-DE']) {
        for (const value of ['29022026', '29021900', '31042026', '01002026', '01132026', '00012026', '0101202', '010120261']) {
            assert.equal(parse(value, locale), null, `${locale}: ${value}`);
        }
    }
});

const headerParser = source.slice(source.indexOf('const FORECAST_MONTH_NAMES ='), source.indexOf('const inferFrequencyFromHeaders ='));
const formatHeader = new Function(headerParser + helper + ';return formatForecastHeader;')();
test('horizontal named and ISO month headers use localized month precision', () => {
    for (const [locale, expected] of [['vi-VN','01/2021'], ['de-DE','01.2021'], ['en-US','2021-01']]) {
        for (const header of ['Jan-21','January 2021','jan/2021','2021-01']) {
            assert.equal(formatHeader(header,locale),expected);
        }
    }
    assert.equal(formatHeader('Dec-23','vi-VN'),'12/2023');
    assert.equal(formatHeader('Dec-69','en-US'),'2069-12');
    assert.equal(formatHeader('Jan-70','en-US'),'1970-01');
});
test('horizontal daily/hourly dates retain precision while non-date headers remain unchanged', () => {
    assert.equal(formatHeader('2024-02-29','de-DE'),'29.02.2024');
    assert.equal(formatHeader('2026-01-01T00:15:30+07:00','vi-VN'),'01/01/2026 00:15:30+07:00');
    for (const header of ['Item ID','2021','2021-13','Custom-21','Product Jan-21']) {
        assert.equal(formatHeader(header,'vi-VN'),header);
    }
});

const partial = new Function(helper + ';return partialCalendarDateInput;')();
test('progressive date mask preserves unfilled slots in each language', () => {
    for (const [locale, digits, pattern] of [['en-US','20260101','YYYY-MM-DD'],['vi-VN','01012026','NN/TT/NNNN'],['de-DE','01012026','TT.MM.JJJJ']]) {
        for (let length=1;length<=8;length++) {
            const entered=partial(digits.slice(0,length),locale);
            assert.equal(entered.replace(/\D/g,''),digits.slice(0,length));
            assert.equal((entered+pattern.slice(entered.length)).length,10);
        }
    }
    assert.equal(partial('2','en-US')+'YYYY-MM-DD'.slice(1),'2YYY-MM-DD');
    assert.equal(partial('20260','en-US'),'2026-0');
    assert.equal(partial('2026-01-0','en-US'),'2026-01-0');
    assert.equal(partial('invalid','en-US'),'invalid');
    assert.equal(partial('202601011','en-US'),'202601011');
});

const datePattern = new Function(helper + ';return calendarDatePattern;')();
test('date format letters and partially filled masks use the selected language', () => {
    assert.equal(datePattern('en-US'), 'YYYY-MM-DD');
    assert.equal(datePattern('vi-VN'), 'NN/TT/NNNN');
    assert.equal(datePattern('de-DE'), 'TT.MM.JJJJ');
    for (const [locale, expected] of [['vi-VN', '01/0T/NNNN'], ['de-DE', '01.0M.JJJJ']]) {
        const entered = partial('010', locale);
        assert.equal(entered + datePattern(locale).slice(entered.length), expected);
        assert.equal(parse(partial('01012026', locale), locale), '2026-01-01');
    }
});
