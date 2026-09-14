const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../forecaster.html'), 'utf8');
const helpers = source.slice(source.indexOf('const DEFAULT_FREQUENCY_PROFILES ='), source.indexOf('const FORECAST_MONTH_NAMES ='));
const {recommendValidationSplit: plan, DEFAULT_FREQUENCY_PROFILES: profiles} = new Function(helpers + '\nreturn {recommendValidationSplit, DEFAULT_FREQUENCY_PROFILES};')();
const models = ['ses', 'des', 'tes', 'prophet', 'arima', 'autoces', 'autotheta'];
const recommend = (total, options = {}) => plan({total, horizon: 6, models, profile: profiles.monthly, ...options});

test('five complete six-step evaluations use ten test periods, retaining the remaining history', () => {
    assert.deepEqual(recommend(36), {train:26, test:10, minimumTrain:24, evaluations:5});
});
test('short history preserves eligible models before increasing evaluation count', () => {
    assert.deepEqual(recommend(32), {train:24, test:8, minimumTrain:24, evaluations:3});
    assert.deepEqual(recommend(30), {train:24, test:6, minimumTrain:24, evaluations:1});
    assert.deepEqual(recommend(32, {models:['ses']}), {train:22, test:10, minimumTrain:4, evaluations:5});
});
test('already ineligible models do not block evaluation of other selected models', () => {
    assert.deepEqual(recommend(24), {train:16, test:8, minimumTrain:16, evaluations:3});
    assert.deepEqual(recommend(72, {profile:profiles.hourly}), {train:62, test:10, minimumTrain:48, evaluations:5});
});
test('frequency-specific seasonal and Prophet training floors are respected', () => {
    for (const [frequency, minimum] of [['hourly',336],['daily',14],['business_daily',10],['weekly',104],['monthly',24],['quarterly',8],['yearly',8]]) {
        const result = recommend(minimum + 8, {profile:profiles[frequency], models:['tes','prophet']});
        assert.deepEqual(result, {train:minimum, test:8, minimumTrain:minimum, evaluations:3});
    }
    assert.equal(recommend(12, {profile:profiles.yearly, models:['tes']}).minimumTrain, 4);
});
test('forecast and capability limits bound the recommendation', () => {
    assert.deepEqual(recommend(36, {horizon:8}), {train:24, test:12, minimumTrain:24, evaluations:5});
    assert.deepEqual(recommend(36, {maxEvaluations:3}), {train:28, test:8, minimumTrain:24, evaluations:3});
    const result = recommend(120, {horizon:60});
    assert.equal(result.test, 60);
    assert.equal(result.evaluations, 1);
});
test('daily sixty-period forecasts retain four extra validation origins', () => {
    assert.equal(profiles.daily.max_test_horizon, 184);
    assert.equal(profiles.business_daily.max_test_horizon, 184);
    assert.equal(profiles.daily.max_forecast_horizon, 180);
    assert.equal(profiles.business_daily.max_forecast_horizon, 180);
    assert.deepEqual(recommend(730, {horizon:60, profile:profiles.daily}), {
        train:666, test:64, minimumTrain:16, evaluations:5,
    });
    assert.deepEqual(recommend(730, {horizon:60, profile:profiles.business_daily}), {
        train:666, test:64, minimumTrain:16, evaluations:5,
    });
});
test('daily 180-period forecasts use the full 184-period validation cap', () => {
    assert.deepEqual(recommend(730, {horizon:180, profile:profiles.daily}), {
        train:546, test:184, minimumTrain:16, evaluations:5,
    });
    assert.deepEqual(recommend(730, {horizon:180, profile:profiles.business_daily}), {
        train:546, test:184, minimumTrain:16, evaluations:5,
    });
    assert.equal(recommend(730, {horizon:181, profile:profiles.daily}), null);
});
test('incomplete input or impossible full-horizon validation has no recommendation', () => {
    for (const options of [{horizon:0}, {horizon:6.5}, {horizon:61}, {profile:undefined}]) assert.equal(recommend(36, options), null);
    assert.equal(recommend(9), null);
    assert.equal(recommend(241), null);
});
