import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyZafJwt, signTestJwt, verifyAuthorizationHeader, ZafAuthError } from '../dist/lib/zaf-auth.js';
import { formatSidebarActor, sidebarActorFromClaims } from '../dist/lib/sidebar-actor.js';

const SECRET = 'test-shared-secret';

test('verifyZafJwt: round-trips a valid token', () => {
  const token = signTestJwt({ iss: 'https://jestaissupport.zendesk.com', sub: 'agent@example.com', exp: Math.floor(Date.now()/1000) + 60 }, SECRET);
  const claims = verifyZafJwt(token, SECRET);
  assert.equal(claims.sub, 'agent@example.com');
  assert.equal(claims.iss, 'https://jestaissupport.zendesk.com');
});

test('verifyZafJwt: rejects wrong secret', () => {
  const token = signTestJwt({ exp: Math.floor(Date.now()/1000) + 60 }, SECRET);
  assert.throws(() => verifyZafJwt(token, 'other-secret'), ZafAuthError);
});

test('verifyZafJwt: rejects expired token', () => {
  const token = signTestJwt({ exp: Math.floor(Date.now()/1000) - 120 }, SECRET);
  assert.throws(() => verifyZafJwt(token, SECRET), /expired/i);
});

test('verifyZafJwt: rejects nbf in the future', () => {
  const token = signTestJwt({ nbf: Math.floor(Date.now()/1000) + 3600 }, SECRET);
  assert.throws(() => verifyZafJwt(token, SECRET), /not yet valid/i);
});

test('verifyZafJwt: rejects wrong issuer when expectedIssuer is set', () => {
  const token = signTestJwt({ iss: 'https://other.zendesk.com', exp: Math.floor(Date.now()/1000) + 60 }, SECRET);
  assert.throws(() => verifyZafJwt(token, SECRET, { expectedIssuer: 'https://jestaissupport.zendesk.com' }), /issuer/i);
});

test('verifyZafJwt: rejects tampered payload', () => {
  const token = signTestJwt({ sub: 'agent@example.com', exp: Math.floor(Date.now()/1000) + 60 }, SECRET);
  const [h, _p, s] = token.split('.');
  const tampered = `${h}.${Buffer.from(JSON.stringify({ sub: 'evil@attacker.com', exp: Math.floor(Date.now()/1000) + 60 })).toString('base64url')}.${s}`;
  assert.throws(() => verifyZafJwt(tampered, SECRET), /signature/i);
});

test('verifyZafJwt: rejects unsupported alg', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'x' })).toString('base64url');
  assert.throws(() => verifyZafJwt(`${header}.${payload}.`, SECRET), /alg/i);
});

test('verifyAuthorizationHeader: extracts Bearer token', () => {
  const token = signTestJwt({ sub: 'agent', exp: Math.floor(Date.now()/1000) + 60 }, SECRET);
  const claims = verifyAuthorizationHeader(`Bearer ${token}`, SECRET);
  assert.equal(claims.sub, 'agent');
});

test('verifyAuthorizationHeader: rejects missing header', () => {
  assert.throws(() => verifyAuthorizationHeader(undefined, SECRET), /Missing Authorization/);
});

test('verifyAuthorizationHeader: rejects wrong scheme', () => {
  assert.throws(() => verifyAuthorizationHeader('Basic dXNlcjpwYXNz', SECRET), /Bearer/);
});

test('sidebarActorFromClaims: formats signed Zendesk actor claims for audit text', () => {
  const actor = sidebarActorFromClaims({
    sub: '123456',
    zendesk_user_id: '123456',
    zendesk_user_name: 'Maya Analyst',
    zendesk_user_email: 'maya.analyst@example.com',
    zendesk_user_role: 'agent',
  });

  assert.deepEqual(actor, {
    userId: '123456',
    name: 'Maya Analyst',
    email: 'maya.analyst@example.com',
    role: 'agent',
  });
  assert.equal(
    formatSidebarActor(actor),
    'Maya Analyst (maya.analyst@example.com, Zendesk user 123456, agent)',
  );
});
