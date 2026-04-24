import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInitialTicketComment,
  getLatestTicketComment,
  notifyAdoUpdateAvailable,
  validateZendeskAttachmentUrl,
} from '../dist/lib/zendesk-api.js';

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

test('getInitialTicketComment: fetches oldest ticket comment for ADO description fallback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    comments: [
      {
        id: 10,
        plain_body: 'Initial customer issue',
        public: true,
        created_at: '2026-04-23T20:00:00Z',
        attachments: [],
      },
      {
        id: 11,
        plain_body: 'Later update',
        public: true,
        created_at: '2026-04-23T21:00:00Z',
        attachments: [],
      },
    ],
  });

  try {
    const comment = await getInitialTicketComment(config, 39045);
    assert.equal(comment.id, '10');
    assert.equal(comment.body, 'Initial customer issue');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('notifyAdoUpdateAvailable: posts a targeted Zendesk app notification', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('null', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await notifyAdoUpdateAvailable(
      {
        zendesk: {
          ...config.zendesk,
          appNotifyAppId: 1240317,
        },
      },
      '123456',
      {
        ticketId: '39235',
        workItemId: 79941,
        workItemUrl: 'https://dev.azure.com/example/_workitems/edit/79941',
        reason: 'ado_status_changed',
        status: 'Dev In Progress',
        statusDetail: 'In development',
        commentsSynced: 1,
        occurredAt: '2026-04-24T18:00:00.000Z',
      },
    );

    assert.deepEqual(result, { sent: true });
    assert.match(calls[0].url, /\/api\/v2\/apps\/notify\.json$/);
    assert.match(calls[0].options.headers.Authorization, /^Basic /);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.app_id, 1240317);
    assert.equal(body.event, 'ado_update_available');
    assert.equal(body.agent_id, 123456);
    assert.equal(JSON.parse(body.body).ticketId, '39235');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('notifyAdoUpdateAvailable: skips safely without app id or target agent', async () => {
  assert.deepEqual(
    await notifyAdoUpdateAvailable(config, '123456', {
      ticketId: '39235',
      workItemId: 79941,
      workItemUrl: 'https://dev.azure.com/example/_workitems/edit/79941',
      reason: 'ado_status_changed',
      status: 'Dev In Progress',
      statusDetail: 'In development',
      commentsSynced: 0,
      occurredAt: '2026-04-24T18:00:00.000Z',
    }),
    { sent: false, reason: 'not_configured' },
  );

  assert.deepEqual(
    await notifyAdoUpdateAvailable(
      { zendesk: { ...config.zendesk, appNotifyAppId: 1240317 } },
      null,
      {
        ticketId: '39235',
        workItemId: 79941,
        workItemUrl: 'https://dev.azure.com/example/_workitems/edit/79941',
        reason: 'ado_comment_synced',
        status: null,
        statusDetail: null,
        commentsSynced: 1,
        occurredAt: '2026-04-24T18:00:00.000Z',
      },
    ),
    { sent: false, reason: 'missing_agent' },
  );
});
