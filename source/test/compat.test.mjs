import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadCompat() {
  const code = readFileSync(new URL('../src/compat.js', import.meta.url), 'utf8');
  return runInNewContext(code + '\nrequestGpuAdapter', {
    Promise,
    setTimeout,
    clearTimeout,
  });
}

test('requestGpuAdapter falls back to a usable default adapter', async () => {
  const requestGpuAdapter = loadCompat();
  const adapter = { name: 'default-adapter' };
  const calls = [];
  const gpu = {
    requestAdapter(options) {
      calls.push(options);
      return Promise.resolve(calls.length === 1 ? null : adapter);
    },
  };
  assert.equal(await requestGpuAdapter(gpu), adapter);
  assert.equal(calls.length, 2);
});

test('requestGpuAdapter can use a forced fallback adapter', async () => {
  const requestGpuAdapter = loadCompat();
  const adapter = { name: 'software-adapter' };
  let calls = 0;
  const gpu = {
    requestAdapter(options) {
      calls++;
      return Promise.resolve(options.forceFallbackAdapter ? adapter : null);
    },
  };
  assert.equal(await requestGpuAdapter(gpu), adapter);
  assert.equal(calls, 4);
});

test('requestGpuAdapter rejects unavailable GPU APIs', async () => {
  const requestGpuAdapter = loadCompat();
  assert.equal(await requestGpuAdapter(null), null);
});
