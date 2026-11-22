const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// why-aps.html and platform.html are generated copies of index.html. If this fails, index.html was
// changed without regenerating them: run `node build-landing-pages.mjs`.
test('generated landing pages match index.html', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../build-landing-pages.mjs'), '--check'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
});
