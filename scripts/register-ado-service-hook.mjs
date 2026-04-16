#!/usr/bin/env node
/**
 * Register ADO service hook subscriptions for work item events.
 *
 * Creates two subscriptions on the target project — `workitem.updated` and
 * `workitem.created` — both POSTing to the integration's `/webhooks/ado`
 * endpoint with Basic auth.
 *
 * Required env vars:
 *   DEVAZURE_ORG_URL            e.g. https://dev.azure.com/jestaisinc
 *   DEVAZURE_PROJECT            e.g. VisionSuite
 *   DEVAZURE_PAT                PAT with "Service Hooks (Read & Write)" scope
 *   ADO_WEBHOOK_PUBLIC_URL      public URL of /webhooks/ado (https)
 *   DEVAZURE_WEBHOOK_USERNAME   Basic-auth user — must match service env
 *   DEVAZURE_WEBHOOK_PASSWORD   Basic-auth password — must match service env
 *
 * If service hook creation fails with 403, the integration falls back to the
 * polling reconciler (see src/reconciler.ts). The failure is non-fatal.
 */

import { readFileSync } from 'node:fs';

loadDotenv();

const REQUIRED = [
  'DEVAZURE_ORG_URL',
  'DEVAZURE_PROJECT',
  'DEVAZURE_PAT',
  'ADO_WEBHOOK_PUBLIC_URL',
  'DEVAZURE_WEBHOOK_USERNAME',
  'DEVAZURE_WEBHOOK_PASSWORD',
];
for (const name of REQUIRED) {
  if (!process.env[name]) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const orgUrl = process.env.DEVAZURE_ORG_URL.replace(/\/$/, '');
const projectName = process.env.DEVAZURE_PROJECT;
const pat = process.env.DEVAZURE_PAT;
const publicUrl = process.env.ADO_WEBHOOK_PUBLIC_URL;
const hookUser = process.env.DEVAZURE_WEBHOOK_USERNAME;
const hookPassword = process.env.DEVAZURE_WEBHOOK_PASSWORD;

const authHeader = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;

async function request(method, path, body) {
  const url = `${orgUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function getProjectId() {
  const project = await request('GET', `/_apis/projects/${encodeURIComponent(projectName)}?api-version=7.1`);
  return project.id;
}

async function createSubscription(eventType, projectId) {
  const body = {
    publisherId: 'tfs',
    eventType,
    resourceVersion: '1.0',
    consumerId: 'webHooks',
    consumerActionId: 'httpRequest',
    publisherInputs: {
      projectId,
    },
    consumerInputs: {
      url: publicUrl,
      basicAuthUsername: hookUser,
      basicAuthPassword: hookPassword,
      resourceDetailsToSend: 'all',
      messagesToSend: 'none',
      detailedMessagesToSend: 'none',
    },
  };
  return request('POST', `/_apis/hooks/subscriptions?api-version=7.1`, body);
}

async function main() {
  console.log(`Looking up project "${projectName}"…`);
  const projectId = await getProjectId();
  console.log(`  id = ${projectId}`);

  for (const eventType of ['workitem.updated', 'workitem.created']) {
    try {
      console.log(`Creating subscription for ${eventType}…`);
      const sub = await createSubscription(eventType, projectId);
      console.log(`  ✓ ${eventType} → subscriptionId=${sub.id}`);
    } catch (err) {
      console.error(`  ✗ ${eventType} failed: ${err.message}`);
      if (/403/.test(err.message)) {
        console.error('    (insufficient permissions — rely on the polling reconciler instead)');
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

function loadDotenv() {
  try {
    const raw = readFileSync('.env', 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env not present — rely on real env only
  }
}
