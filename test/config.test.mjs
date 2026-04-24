import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../dist/config.js';

function baseEnv(overrides = {}) {
  return {
    ZENDESK_SKIP_SIGNATURE_VERIFICATION: 'true',
    DEVAZURE_ORG_URL: 'https://dev.azure.com/example',
    DEVAZURE_PROJECT: 'VisionSuite',
    DEVAZURE_PAT: 'pat',
    ORACLE_DB_HOST: 'db',
    ORACLE_DB_SERVICE: 'svc',
    ORACLE_DB_USERNAME: 'user',
    ORACLE_DB_PASSWORD: 'pass',
    ...overrides,
  };
}

test('loadConfig: defaults sidebar app scope to the pilot form', () => {
  const config = loadConfig(baseEnv());
  assert.deepEqual(config.zendesk.appAllowedFormIds, [50882600373907]);
});

test('loadConfig: parses explicit sidebar app form allow-list', () => {
  const config = loadConfig(baseEnv({ ZENDESK_APP_ALLOWED_FORM_IDS: '1, 2,3' }));
  assert.deepEqual(config.zendesk.appAllowedFormIds, [1, 2, 3]);
});

test('loadConfig: explicit wildcard allows all sidebar app forms', () => {
  const config = loadConfig(baseEnv({ ZENDESK_APP_ALLOWED_FORM_IDS: '*' }));
  assert.deepEqual(config.zendesk.appAllowedFormIds, []);
});
