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

test('loadConfig: parses ADO status to Zendesk custom status map', () => {
  const config = loadConfig(baseEnv({
    ZENDESK_ADO_STATUS_CUSTOM_STATUS_MAP: JSON.stringify({
      ado_status_dev_in_progress: 39707448444179,
      ado_status_support_ready: '43270434394131',
    }),
  }));
  assert.deepEqual(config.zendesk.adoStatusCustomStatusMap, {
    ado_status_dev_in_progress: 39707448444179,
    ado_status_support_ready: 43270434394131,
  });
});

test('loadConfig: parses optional Zendesk app notify app id', () => {
  const config = loadConfig(baseEnv({ ZENDESK_APP_NOTIFY_APP_ID: '1240317' }));
  assert.equal(config.zendesk.appNotifyAppId, 1240317);
});
