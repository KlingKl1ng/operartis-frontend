const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../forecaster.html'), 'utf8');
const helpers = html.slice(html.indexOf('const forecastItemCalendar ='), html.indexOf('const ForecastValuesTable ='));
const {forecastItemCalendar, forecastCalendarStatus} = new Function(helpers + ';return {forecastItemCalendar, forecastCalendarStatus};')();
const translations = new Function(html.slice(html.indexOf('const TRANSLATIONS ='), html.indexOf('const MenuIcon =')) + ';return TRANSLATIONS;')();
const t = (key, lang = 'en') => key.split('.').reduce((value, part) => value[part], translations[lang]);
const policy = (exceptions = []) => ({calendar_item_id: 'A', operating_calendar: {
    enabled: true, start: '2026-01-01', end: '2026-12-31', weekdays: [0, 1, 2, 3, 4], ids: [], exceptions,
}});
const exception = (start, status, ids = [], label = '', end = start) => ({start, end, status, ids, label});
const status = (date, prep = policy(), lang = 'en', value = 0) => forecastCalendarStatus({date, future_forecast: value}, prep, 'Display A', key => t(key, lang));

test('calendar column applies only to enabled calendars covering this item', () => {
    assert.equal(forecastItemCalendar(undefined, 'A'), null);
    const prep = policy();
    prep.operating_calendar.enabled = false;
    assert.equal(forecastItemCalendar(prep, 'A'), null);
    prep.operating_calendar.enabled = true;
    prep.operating_calendar.ids = ['B'];
    assert.equal(forecastItemCalendar(prep, 'A'), null);
    prep.operating_calendar.ids = ['A'];
    assert.equal(forecastItemCalendar(prep, 'Different display ID'), prep.operating_calendar);
});

test('regular opening status comes from weekday rules, never the forecast amount', () => {
    assert.equal(status('2026-04-01'), 'Open');
    assert.equal(status('2026-04-05', policy(), 'en', 190), 'Closed · weekly schedule');
});

test('exceptions explain closures, extra opening days and named reasons', () => {
    const prep = policy([
        exception('2026-04-02', 'closed'),
        exception('2026-04-04', 'open'),
        exception('2026-04-06', 'closed', [], 'Maintenance'),
        exception('2026-04-07', 'open'),
    ]);
    assert.equal(status('2026-04-02', prep), 'Closed · calendar exception');
    assert.equal(status('2026-04-04', prep), 'Open · extra opening day');
    assert.equal(status('2026-04-05', prep), 'Closed · weekly schedule');
    assert.equal(status('2026-04-06', prep), 'Closed · Maintenance');
    assert.equal(status('2026-04-07', prep), 'Open · calendar exception');
});

test('item-specific exceptions override global rules in either order, with inclusive ranges', () => {
    const rows = [exception('2026-04-01', 'closed', [], '', '2026-04-05'), exception('2026-04-02', 'open', ['A'], '', '2026-04-04')];
    for (const order of [rows, [...rows].reverse()]) {
        const prep = policy(order);
        assert.equal(status('2026-04-01', prep), 'Closed · calendar exception');
        assert.equal(status('2026-04-02', prep), 'Open · calendar exception');
        assert.equal(status('2026-04-04', prep), 'Open · extra opening day');
        assert.equal(status('2026-04-05', prep), 'Closed · calendar exception');
        prep.calendar_item_id = 'B';
        assert.equal(status('2026-04-02', prep), 'Closed · calendar exception');
    }
});

test('unknown or uncovered dates are not misrepresented as calendar openings', () => {
    for (const date of ['2025-12-31', '2027-01-01', '2026-02-30', 'invalid', '']) {
        assert.equal(status(date), 'Not available');
    }
    assert.equal(status('2026-01-01'), 'Open');
    assert.equal(status('2026-12-31'), 'Open');
});

test('system labels translate while user-authored exception reasons remain intact', () => {
    assert.equal(status('2026-04-05', policy(), 'vi'), 'Đóng cửa · lịch hằng tuần');
    assert.equal(status('2026-04-05', policy(), 'de'), 'Geschlossen · Wochenplan');
    const prep = policy([exception('2026-04-02', 'closed', [], 'Nghỉ lễ <special>')]);
    assert.equal(status('2026-04-02', prep, 'vi'), 'Đóng cửa · Nghỉ lễ <special>');
    assert.equal(status('2026-04-02', prep, 'de'), 'Geschlossen · Nghỉ lễ <special>');
    for (const lang of ['en', 'vi', 'de']) {
        for (const key of Object.keys(translations.en.charts).filter(key => key.startsWith('calendar_'))) {
            assert.ok(t(`charts.${key}`, lang));
        }
    }
});
