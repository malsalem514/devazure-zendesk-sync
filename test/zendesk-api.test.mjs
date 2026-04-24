import test from 'node:test';
import assert from 'node:assert/strict';
import { validateZendeskAttachmentUrl } from '../dist/lib/zendesk-api.js';

const config = {
  zendesk: {
    baseUrl: 'https://jestaissupport.zendesk.com',
  },
};

test('validateZendeskAttachmentUrl: allows tenant Zendesk attachment URLs with auth', () => {
  const target = validateZendeskAttachmentUrl(
    config,
    'https://jestaissupport.zendesk.com/attachments/token/abc?name=screen.png',
  );

  assert.equal(target.url.hostname, 'jestaissupport.zendesk.com');
  assert.equal(target.sendAuth, true);
});

test('validateZendeskAttachmentUrl: allows Zendesk content CDN URLs without auth', () => {
  const target = validateZendeskAttachmentUrl(
    config,
    'https://p998.zdusercontent.com/api/v2/attachment_content/abc?token=def',
  );

  assert.equal(target.url.hostname, 'p998.zdusercontent.com');
  assert.equal(target.sendAuth, false);
});

test('validateZendeskAttachmentUrl: blocks non-Zendesk and non-HTTPS URLs', () => {
  assert.throws(
    () => validateZendeskAttachmentUrl(config, 'http://jestaissupport.zendesk.com/attachments/token/abc'),
    /non-HTTPS/,
  );
  assert.throws(
    () => validateZendeskAttachmentUrl(config, 'https://example.com/attachments/token/abc'),
    /outside approved hosts/,
  );
});
