const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../dashboard.html'), 'utf8');
const i18nSource = fs.readFileSync(path.join(__dirname, '../operartis-dashboard-i18n.js'), 'utf8');
const helpers = source.slice(source.indexOf('        function normalizeStatus('), source.indexOf('        function jobSourceLabel('));
const { statusCountEntries, statusLabel } = new Function('dt', helpers + '; return {statusCountEntries, statusLabel};')(key => key === 'admin_status.canceled' ? 'Canceled' : key);

test('cancellation spellings combine without changing other counts or source data', () => {
    const values = { completed: 884, failed: 12, cancelled: 3, canceled: 11 };
    const entries = statusCountEntries(values);
    assert.deepEqual(entries, [['completed', 884], ['failed', 12], ['canceled', 14]]);
    assert.equal(entries.reduce((sum, [, count]) => sum + count, 0), 910);
    assert.equal(values.cancelled, 3);
    assert.equal(values.canceled, 11);
});

test('either spelling alone and casing variants use one translated label', () => {
    for (const key of ['canceled', 'cancelled', ' CANCELLED ']) {
        assert.deepEqual(statusCountEntries({ [key]: 3 }), [['canceled', 3]]);
        assert.equal(statusLabel(key), 'Canceled');
    }
    assert.deepEqual(statusCountEntries(), []);
    assert.deepEqual(statusCountEntries({ custom_status: 2 }), [['custom_status', 2]]);
});

test('personal API key table never exposes an organization owner column', () => {
    const personalPanel = source.slice(
        source.indexOf('<div id="security-api-panel"'),
        source.indexOf('<section id="section-settings"'),
    );
    assert.ok(personalPanel.includes('<tbody id="api-keys-body"></tbody>'));
    assert.equal(personalPanel.includes('api-key-owner-col'), false);
    assert.ok(source.includes("state.apiKeys = Array.isArray(apiKeys) ? apiKeys : [];"));
});

test('admin user profiles render and revoke only that user API keys', () => {
    assert.ok(source.includes('<tbody id="admin-user-api-keys-body"></tbody>'));
    assert.ok(source.includes("dataset: {\n                            action: 'revoke-admin-api-key'"));
    assert.ok(source.includes("`/auth/admin/users/${encodeURIComponent(userId)}/api-keys/${encodeURIComponent(keyId)}`"));
});

test('personal and admin API key descriptions are translated', () => {
    let language = 'en';
    const context = { window: { getOperartisLang: () => language } };
    vm.runInNewContext(i18nSource, context);
    for (language of ['en', 'vi', 'de']) {
        for (const key of ['sections.security.api_keys_sub', 'admin_api_keys.title', 'admin_api_keys.description', 'admin_api_keys.loading', 'admin_api_keys.error']) {
            const translated = context.window.OperartisDashboardI18n.t(key);
            assert.equal(typeof translated, 'string');
            assert.notEqual(translated, key);
        }
    }
});
