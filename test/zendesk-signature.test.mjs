import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createZendeskSignature,
  verifyZendeskSignature,
} from '../dist/zendesk-signature.js';

test('verifyZendeskSignature accepts a valid signature', () => {
  const secret = 'dGhpc19zZWNyZXRfaXNfZm9yX3Rlc3Rpbmdfb25seQ==';
  const timestamp = '2025-01-08T07:32:05Z';
  const rawBody = JSON.stringify({
    id: 'evt-1',
    type: 'zen:event-type:ticket.comment_added',
  });
  const signature = createZendeskSignature(secret, timestamp, rawBody);

  assert.equal(
    verifyZendeskSignature(secret, signature, timestamp, rawBody),
    true,
  );
});

test('verifyZendeskSignature rejects an invalid signature', () => {
  assert.equal(
    verifyZendeskSignature('secret', 'invalid-signature', '2025-01-08T07:32:05Z', '{}'),
    false,
  );
});
