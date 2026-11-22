const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {}, Date };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../operartis-format.js'), 'utf8'), context);
const format = context.window.OperartisFormat.forLanguage;

test('number grouping, precision and negative values follow the selected language', () => {
    for (const [language, expected] of [['en', '1,999.999'], ['vi', '1.999,999'], ['de', '1.999,999']]) {
        assert.equal(format(language).number(1999.999), expected);
        assert.equal(format(language).number(-1999.999), '-' + expected);
        assert.equal(format(language).fixed(28.4, 1), language === 'en' ? '28.4' : '28,4');
        assert.equal(format(language).fixed(0, 2), language === 'en' ? '0.00' : '0,00');
    }
    assert.equal(format('unknown').number(1999.999), '1,999.999');
    assert.equal(format('vi').number(null), '—');
});

test('calendar dates retain the original day and time in every language', () => {
    for (const [language, expected] of [['en', '2026-01-01'], ['vi', '01/01/2026'], ['de', '01.01.2026']]) {
        assert.equal(format(language).date('2026-01-01'), expected);
        assert.equal(format(language).date('2026-01-01T00:15:12.123+07:00'), expected + ' 00:15:12.123+07:00');
    }
    assert.equal(format('vi').date('2024-02-29'), '29/02/2024');
    assert.equal(format('de').date('Day 1'), 'Day 1');
    assert.equal(format('en').date(null), '');
});

test('shared formatting agrees with forecaster display rules', () => {
    const source = fs.readFileSync(path.join(__dirname, '../forecaster.html'), 'utf8');
    const helpers = source.slice(source.indexOf('const numberLocaleForLanguage ='), source.indexOf('const rowContestMetric ='));
    const reference = vm.runInNewContext(helpers + '; ({ fmtNumber, formatForecastDate, numberLocaleForLanguage })');
    for (const language of ['en', 'vi', 'de']) {
        const locale = reference.numberLocaleForLanguage(language);
        assert.equal(format(language).number(1999.999), reference.fmtNumber(1999.999, 0, 3, locale));
        assert.equal(format(language).date('2026-01-01T14:30:00Z'), reference.formatForecastDate('2026-01-01T14:30:00Z', locale));
    }
});

test('account timestamps use localized clocks, without raw fractions or Z suffixes', () => {
    const timestamp = '2026-09-10T11:42:07.148858Z';
    const options = { timeZone: 'Europe/Berlin' };
    assert.equal(format('vi').dateTime(timestamp, options), '10/09/2026 13:42:07');
    assert.equal(format('de').dateTime(timestamp, options), '10.09.2026 13:42:07');
    assert.equal(format('en').dateTime(timestamp, options), '2026-09-10 13:42:07');
    assert.equal(format('vi').dateTime(timestamp.replace('Z', ''), options), '10/09/2026 13:42:07');
});

test('timezones handle day boundaries and DST without shifting date-only labels', () => {
    assert.equal(format('vi').dateTime('2026-09-10T23:42:07Z', { timeZone: 'Asia/Ho_Chi_Minh' }), '11/09/2026 06:42:07');
    assert.equal(format('de').dateTime('2026-01-10T11:42:07Z', { timeZone: 'Europe/Berlin' }), '10.01.2026 12:42:07');
    assert.equal(format('de').dateTime('2026-09-10T00:00:00Z', { timeZone: 'UTC' }), '10.09.2026 00:00:00');
    assert.equal(format('en').dateTime('2026-09-10T00:00:00Z', { timeZone: 'UTC' }), '2026-09-10 00:00:00');
    assert.equal(format('vi').dateTime('2026-09-10', { timeZone: 'America/Los_Angeles' }), '10/09/2026');
    assert.equal(format('vi').dateTime('unknown'), 'unknown');
    assert.equal(format('vi').dateTime(null), '');
    assert.equal(format('vi').dateTime('2026-09-10T11:42:07Z', { timeZone: 'invalid-zone' }), format('vi').dateTime('2026-09-10T11:42:07Z'));
});
