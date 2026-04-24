#!/usr/bin/env node
/**
 * Register (or re-use) a Zendesk webhook that subscribes to ticket events
 * and points at our integration's `/webhooks/zendesk` endpoint.
 *
 * Zendesk generates the signing secret server-side on create — it cannot be
 * supplied by the admin. This script is therefore idempotent:
 *   - If a webhook named ZENDESK_WEBHOOK_NAME already exists, print its id
 *     and verify the signing secret can be fetched.
 *   - Otherwise create the webhook and verify the signing secret can be fetched.
 *   - The signing secret is redacted by default. Pass --print-secret only in
 *     a private terminal when you need to copy it into ZENDESK_WEBHOOK_SECRET.
 *
 * Usage:
 *   node --env-file-if-exists=.env scripts/register-zendesk-webhook.mjs [--print-secret]
 *
 * Required env:
 *   ZENDESK_BASE_URL          https://jestaissupport.zendesk.com
 *   ZENDESK_API_USERNAME      admin email
 *   ZENDESK_API_TOKEN         API token
 *   ZENDESK_WEBHOOK_URL       public URL, e.g. https://zendesk-sync.jestais.com/webhooks/zendesk
 *
 * Optional env:
 *   ZENDESK_WEBHOOK_NAME      defaults to "ADO Integration — ticket events"
 *   ZENDESK_WEBHOOK_EVENTS    comma-separated, defaults to created + comment_added
 *
 * If the webhook you want to hit accepts Basic auth (via Caddy or the
 * INBOUND_BEARER_TOKEN env on our side), set ZENDESK_WEBHOOK_BASIC_USER and
 * ZENDESK_WEBHOOK_BASIC_PASSWORD to include an Authorization header in the
 * webhook's outbound requests. Leave unset for signature-only verification.
 */

const baseUrl = process.env.ZENDESK_BASE_URL?.replace(/\/$/, '');
const email = process.env.ZENDESK_API_USERNAME;
const token = process.env.ZENDESK_API_TOKEN;
const webhookUrl = process.env.ZENDESK_WEBHOOK_URL;

if (!baseUrl || !email || !token) {
  die('Missing: ZENDESK_BASE_URL, ZENDESK_API_USERNAME, ZENDESK_API_TOKEN');
}
if (!webhookUrl) {
  die('Missing: ZENDESK_WEBHOOK_URL (public URL ending in /webhooks/zendesk)');
}

const webhookName = process.env.ZENDESK_WEBHOOK_NAME?.trim() || 'ADO Integration — ticket events';
const subscriptions = (process.env.ZENDESK_WEBHOOK_EVENTS ?? 'zen:event-type:ticket.created,zen:event-type:ticket.comment_added')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const basicUser = process.env.ZENDESK_WEBHOOK_BASIC_USER?.trim();
const basicPass = process.env.ZENDESK_WEBHOOK_BASIC_PASSWORD?.trim();
const printSecret =
  process.argv.includes('--print-secret') ||
  ['1', 'true', 'yes', 'on'].includes((process.env.ZENDESK_WEBHOOK_PRINT_SECRET ?? '').trim().toLowerCase());

const adminAuth = `Basic ${Buffer.from(`${email}/token:${token}`, 'utf8').toString('base64')}`;

async function zd(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: adminAuth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

async function findExisting() {
  // Webhooks list endpoint supports ?filter[name_contains]= — use it to keep
  // the result small. Pagination ignored: name collisions are rare and we
  // fall through to create if not found in the first page.
  const filter = encodeURIComponent(webhookName);
  const res = await zd('GET', `/api/v2/webhooks?filter[name_contains]=${filter}`);
  return (res.webhooks ?? []).find((w) => w.name === webhookName) ?? null;
}

async function fetchSigningSecret(id) {
  const res = await zd('GET', `/api/v2/webhooks/${id}/signing_secret`);
  // Response shape: { signing_secret: { secret, algorithm } }
  return res.signing_secret?.secret ?? null;
}

function redactedSecret(secret) {
  if (secret.length <= 8) return '<redacted>';
  return `${secret.slice(0, 4)}...${secret.slice(-4)} (redacted)`;
}

async function createWebhook() {
  const payload = {
    webhook: {
      name: webhookName,
      endpoint: webhookUrl,
      http_method: 'POST',
      request_format: 'json',
      status: 'active',
      subscriptions,
      ...(basicUser && basicPass
        ? {
            authentication: {
              type: 'basic_auth',
              add_position: 'header',
              data: { username: basicUser, password: basicPass },
            },
          }
        : {}),
    },
  };
  const res = await zd('POST', '/api/v2/webhooks', payload);
  return res.webhook;
}

async function updateWebhookSubscriptions(id) {
  const payload = {
    webhook: {
      subscriptions,
    },
  };
  const res = await zd('PUT', `/api/v2/webhooks/${id}`, payload);
  return res.webhook;
}

const existing = await findExisting();
let webhook;
let mode;

if (existing) {
  mode = 'existing';
  webhook = existing;
  console.log(`Webhook "${webhookName}" already exists — reusing.`);
  const currentSubscriptions = new Set(webhook.subscriptions ?? []);
  const subscriptionsMatch =
    subscriptions.length === currentSubscriptions.size &&
    subscriptions.every((subscription) => currentSubscriptions.has(subscription));
  if (!subscriptionsMatch) {
    console.log(`  updating subscriptions: ${subscriptions.join(', ')}`);
    webhook = await updateWebhookSubscriptions(webhook.id);
  }
} else {
  mode = 'created';
  console.log(`Creating webhook "${webhookName}" → ${webhookUrl}`);
  console.log(`  subscriptions: ${subscriptions.join(', ')}`);
  webhook = await createWebhook();
  console.log(`  ✓ created webhook id=${webhook.id}`);
}

const secret = await fetchSigningSecret(webhook.id);
if (!secret) {
  die(`Could not fetch signing secret for webhook ${webhook.id}`);
}

console.log('');
console.log('=== Webhook ready ===');
console.log(`  id:             ${webhook.id}`);
console.log(`  name:           ${webhook.name}`);
console.log(`  endpoint:       ${webhook.endpoint}`);
console.log(`  status:         ${webhook.status}`);
console.log(`  subscriptions:  ${(webhook.subscriptions ?? []).join(', ')}`);
console.log(`  signing secret: ${printSecret ? secret : redactedSecret(secret)}`);
console.log('');
if (!printSecret) {
  console.log('Signing secret fetched successfully but redacted. Re-run with --print-secret');
  console.log('from a private terminal if you need to copy it into ZENDESK_WEBHOOK_SECRET.');
} else if (mode === 'created') {
  console.log('Next step: set ZENDESK_WEBHOOK_SECRET in the service .env to the signing');
  console.log('secret above and restart the container.');
} else {
  console.log('If ZENDESK_WEBHOOK_SECRET in .env does not match the signing secret above,');
  console.log('update .env and restart — inbound verification will otherwise 401.');
}
