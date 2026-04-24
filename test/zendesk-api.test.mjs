import test from 'node:test';
import assert from 'node:assert/strict';
import { getLatestTicketComment, validateZendeskAttachmentUrl } from '../dist/lib/zendesk-api.js';

const config = {
  zendesk: {
    baseUrl: 'https://jestaissupport.zendesk.com',
    apiUsername: 'agent@example.com',
    apiToken: 'token',
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

test('getLatestTicketComment: fetches newest comment with visibility and attachments', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({
      comments: [
        {
          id: 10,
          plain_body: 'Older note',
          public: false,
          created_at: '2026-04-23T20:00:00Z',
          attachments: [],
        },
        {
          id: 11,
          plain_body: 'Latest customer detail',
          public: true,
          created_at: '2026-04-23T21:00:00Z',
          attachments: [{
            id: 9001,
            file_name: 'screen.png',
            content_url: 'https://jestaissupport.zendesk.com/attachments/token/abc?name=screen.png',
            content_type: 'image/png',
            size: 512,
          }],
        },
      ],
    });
  };

  try {
    const comment = await getLatestTicketComment(config, 39045);
    assert.equal(comment.id, '11');
    assert.equal(comment.body, 'Latest customer detail');
    assert.equal(comment.public, true);
    assert.equal(comment.attachments[0].fileName, 'screen.png');
    assert.match(calls[0].url, /\/api\/v2\/tickets\/39045\/comments\.json/);
    assert.match(calls[0].url, /sort_order=desc/);
    assert.match(calls[0].options.headers.Authorization, /^Basic /);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
