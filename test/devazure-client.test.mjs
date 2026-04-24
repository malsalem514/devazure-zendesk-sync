import test from 'node:test';
import assert from 'node:assert/strict';
import { DevAzureClient, DevAzureHttpError } from '../dist/devazure-client.js';

function createConfig() {
  return {
    orgUrl: 'https://dev.azure.com/example',
    project: 'VisionSuite',
    pat: 'pat',
    workItemType: 'Bug',
    apiVersion: '7.1',
    webhookPath: '/webhooks/ado',
  };
}

test('DevAzureClient: retries a short Retry-After throttle once', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) {
      return new Response('busy', {
        status: 429,
        headers: { 'Retry-After': '0' },
      });
    }

    return Response.json({
      id: 79741,
      rev: 5,
      url: 'https://dev.azure.com/example/_apis/wit/workItems/79741',
      fields: {
        'System.Tags': 'zendesk; zendesk:id:39045',
      },
    });
  };

  try {
    const client = new DevAzureClient(createConfig());
    const snapshot = await client.getWorkItem(79741);
    assert.equal(snapshot?.id, '79741');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DevAzureClient: does not hold the iframe on long throttles', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('wait', {
    status: 429,
    headers: { 'Retry-After': '60' },
  });

  try {
    const client = new DevAzureClient(createConfig());
    await assert.rejects(
      () => client.getWorkItem(79741),
      (err) => err instanceof DevAzureHttpError && err.status === 429,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DevAzureClient: uses ADO comments API for discussion comments', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({
      workItemId: 79741,
      commentId: 50,
      version: 1,
      text: 'Support comment from Zendesk',
      createdBy: { displayName: 'Jesta Integration' },
      createdDate: '2026-04-23T22:00:00.000Z',
      modifiedDate: '2026-04-23T22:00:00.000Z',
      isDeleted: false,
      url: 'https://dev.azure.com/example/VisionSuite/_apis/wit/workItems/79741/comments/50',
    });
  };

  try {
    const client = new DevAzureClient(createConfig());
    const comment = await client.addWorkItemComment(79741, 'Support comment from Zendesk');
    assert.equal(comment.id, 50);
    assert.equal(comment.createdBy, 'Jesta Integration');
    assert.match(calls[0].url, /\/wit\/workItems\/79741\/comments\?/);
    assert.match(calls[0].url, /api-version=7\.1-preview\.4/);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.body, JSON.stringify({ text: 'Support comment from Zendesk' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DevAzureClient: fetches a capped recent comments list', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json({
      comments: [
        {
          workItemId: 79741,
          commentId: 51,
          version: 1,
          text: 'Newest comment',
          createdBy: { displayName: 'Jesta Integration' },
          createdDate: '2026-04-23T23:00:00.000Z',
          modifiedDate: '2026-04-23T23:00:00.000Z',
          isDeleted: false,
        },
        {
          workItemId: 79741,
          commentId: 50,
          version: 1,
          text: 'Deleted comment',
          isDeleted: true,
        },
      ],
    });
  };

  try {
    const client = new DevAzureClient(createConfig());
    const comments = await client.getWorkItemComments(79741, 25);
    assert.equal(comments.length, 1);
    assert.equal(comments[0].text, 'Newest comment');
    assert.match(calls[0], /\$top=10/);
    assert.match(calls[0], /includeDeleted=false/);
    assert.match(calls[0], /api-version=7\.1-preview\.4/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
