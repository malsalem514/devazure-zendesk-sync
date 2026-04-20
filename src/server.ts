import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AppConfig } from './types.js';
import { parseAdoEvent } from './ado-event-parser.js';
import { DevAzureClient } from './devazure-client.js';
import { buildBasicAuthHeaderValue } from './lib/basic-auth.js';
import { healthCheck as oracleHealthCheck } from './lib/oracle.js';
import { buildSyncPlan } from './sync-planner.js';
import { parseZendeskTicketEvent } from './zendesk-event-parser.js';
import { verifyZendeskSignature } from './zendesk-signature.js';
import { JOB_TYPES, persistEventAndEnqueueJob } from './worker.js';

class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

function json(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}

function getPath(request: IncomingMessage): string {
  const host = request.headers.host || 'localhost';
  return new URL(request.url || '/', `http://${host}`).pathname;
}

const MAX_BODY_BYTES = 1_048_576;

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_BODY_BYTES) {
      request.destroy();
      throw new HttpError('Request body too large', 413);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function requireBearerToken(request: IncomingMessage, expectedToken: Buffer | null): void {
  if (!expectedToken) {
    return;
  }

  const received = Buffer.from(request.headers.authorization ?? '', 'utf8');

  if (received.length !== expectedToken.length || !timingSafeEqual(received, expectedToken)) {
    throw new HttpError('Missing or invalid bearer token', 401);
  }
}

function verifyWebhookRequest(
  request: IncomingMessage,
  rawBody: string,
  config: AppConfig,
): void {
  if (config.zendesk.skipSignatureVerification) {
    return;
  }

  const secret = config.zendesk.webhookSecret;
  if (!secret) {
    throw new HttpError('Zendesk webhook secret is not configured', 500);
  }

  const signature = request.headers['x-zendesk-webhook-signature'];
  const timestamp = request.headers['x-zendesk-webhook-signature-timestamp'];
  const valid = verifyZendeskSignature(
    secret,
    typeof signature === 'string' ? signature : undefined,
    typeof timestamp === 'string' ? timestamp : undefined,
    rawBody,
  );

  if (!valid) {
    throw new HttpError('Zendesk webhook signature verification failed', 401);
  }
}

function requireBasicAuth(request: IncomingMessage, expected: Buffer | null): void {
  if (!expected) {
    // Deliberately require explicit configuration — no silent bypass like Zendesk's skip flag.
    throw new HttpError('ADO webhook auth not configured', 500);
  }
  const received = Buffer.from(request.headers.authorization ?? '', 'utf8');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new HttpError('Missing or invalid ADO webhook credentials', 401);
  }
}

export function createWebhookServer(config: AppConfig): Server {
  const devAzureClient = new DevAzureClient(config.devAzure);
  const expectedBearerToken = config.inboundBearerToken
    ? Buffer.from(`Bearer ${config.inboundBearerToken}`, 'utf8')
    : null;
  const expectedAdoAuth =
    config.devAzure.webhookUsername && config.devAzure.webhookPassword
      ? Buffer.from(
          buildBasicAuthHeaderValue(config.devAzure.webhookUsername, config.devAzure.webhookPassword),
          'utf8',
        )
      : null;

  return createServer(async (request, response) => {
    try {
      const path = getPath(request);

      if (request.method === 'GET' && path === '/healthz') {
        json(response, 200, { ok: true, dryRun: config.dryRun });
        return;
      }

      if (request.method === 'GET' && path === '/health') {
        json(response, 200, {
          ok: true,
          dryRun: config.dryRun,
          webhookPath: config.webhookPath,
        });
        return;
      }

      if (request.method === 'GET' && path === '/readyz') {
        const oracleOk = await oracleHealthCheck();
        const status = oracleOk ? 200 : 503;
        json(response, status, { ok: oracleOk, oracle: oracleOk });
        return;
      }

      console.log(`[devazure-zendesk-sync] ${request.method} ${path}`);

      if (request.method === 'POST' && path === config.devAzure.webhookPath) {
        requireBasicAuth(request, expectedAdoAuth);

        const rawBody = await readRequestBody(request);
        const event = parseAdoEvent(rawBody);
        const dedupKey = `ado:${event.eventType}:${event.workItemId}:${event.revision ?? event.id}`;

        if (config.dryRun) {
          console.log(
            `[devazure-zendesk-sync] dry-run ado event=${event.eventType} workItem=${event.workItemId} rev=${event.revision}`,
          );
          json(response, 202, {
            ok: true,
            action: 'dry-run',
            eventType: event.eventType,
            workItemId: event.workItemId,
            revision: event.revision,
          });
          return;
        }

        const result = await persistEventAndEnqueueJob(
          {
            sourceSystem: 'ado',
            eventType: event.eventType,
            sourceEventId: event.id,
            dedupKey,
            payload: rawBody,
          },
          {
            jobType: JOB_TYPES.syncAdoStateToZendesk,
            payload: { workItemId: event.workItemId, revision: event.revision },
          },
        );

        if (result == null) {
          json(response, 202, { ok: true, action: 'duplicate', workItemId: event.workItemId });
          return;
        }

        console.log(
          `[devazure-zendesk-sync] enqueued ${JOB_TYPES.syncAdoStateToZendesk} workItem=${event.workItemId} event=${result.eventId}`,
        );
        json(response, 202, {
          ok: true,
          action: 'enqueued',
          workItemId: event.workItemId,
          eventId: result.eventId,
        });
        return;
      }

      if (request.method !== 'POST' || path !== config.webhookPath) {
        json(response, 404, { ok: false, message: 'Not found' });
        return;
      }

      requireBearerToken(request, expectedBearerToken);

      const rawBody = await readRequestBody(request);
      verifyWebhookRequest(request, rawBody, config);

      // Parse just enough to get ticket ID and event type for dedup
      const event = parseZendeskTicketEvent(rawBody);
      const invocationId = request.headers['x-zendesk-webhook-invocation-id'];
      const dedupKey = typeof invocationId === 'string' && invocationId.trim()
        ? `zendesk:invocation:${invocationId.trim()}`
        : `zendesk:${event.type}:${event.detail.id}:${event.id}`;

      // Dry-run mode: show what would happen without persisting or enqueuing
      if (config.dryRun) {
        const existingWorkItem = await devAzureClient.findWorkItemByZendeskTicketId(event.detail.id);
        const plan = buildSyncPlan(event, config, existingWorkItem);
        console.log(`[devazure-zendesk-sync] dry-run ${plan.action} ticket=${plan.ticketId}`);
        json(response, 202, {
          ok: true,
          action: plan.action,
          dryRun: true,
          reason: plan.reason,
          ticketId: plan.ticketId,
          title: plan.title,
          tags: plan.tags,
          operations: plan.operations,
        });
        return;
      }

      // Durable processing: atomically persist event + enqueue job, return 202
      const result = await persistEventAndEnqueueJob(
        { sourceSystem: 'zendesk', eventType: event.type, sourceEventId: event.id, dedupKey, payload: rawBody },
        { jobType: JOB_TYPES.createAdoFromZendesk, payload: { rawBody, ticketId: event.detail.id } },
      );

      if (result == null) {
        json(response, 202, { ok: true, action: 'duplicate', ticketId: event.detail.id });
        return;
      }

      console.log(`[devazure-zendesk-sync] enqueued ${JOB_TYPES.createAdoFromZendesk} ticket=${event.detail.id} event=${result.eventId}`);
      json(response, 202, {
        ok: true,
        action: 'enqueued',
        ticketId: event.detail.id,
        eventId: result.eventId,
      });
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.statusCode : 500;
      if (!(error instanceof HttpError)) {
        console.error('[devazure-zendesk-sync] unexpected error:', error);
      }
      const message = error instanceof HttpError ? error.message : 'Internal server error';
      json(response, statusCode, { ok: false, message });
    }
  });
}
