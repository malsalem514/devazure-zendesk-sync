import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AppConfig } from './types.js';
import { DevAzureClient } from './devazure-client.js';
import { buildSyncPlan } from './sync-planner.js';
import { parseZendeskTicketEvent } from './zendesk-event-parser.js';
import { verifyZendeskSignature } from './zendesk-signature.js';

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

export function createWebhookServer(config: AppConfig): Server {
  const devAzureClient = new DevAzureClient(config.devAzure);
  const expectedBearerToken = config.inboundBearerToken
    ? Buffer.from(`Bearer ${config.inboundBearerToken}`, 'utf8')
    : null;

  return createServer(async (request, response) => {
    try {
      const path = getPath(request);

      if (request.method === 'GET' && path === '/health') {
        json(response, 200, {
          ok: true,
          dryRun: config.dryRun,
          webhookPath: config.webhookPath,
        });
        return;
      }

      console.log(`[devazure-zendesk-sync] ${request.method} ${path}`);

      if (request.method !== 'POST' || path !== config.webhookPath) {
        json(response, 404, { ok: false, message: 'Not found' });
        return;
      }

      requireBearerToken(request, expectedBearerToken);

      const rawBody = await readRequestBody(request);
      verifyWebhookRequest(request, rawBody, config);

      const event = parseZendeskTicketEvent(rawBody);
      const existingWorkItem = config.dryRun
        ? null
        : await devAzureClient.findWorkItemByZendeskTicketId(event.detail.id);
      const plan = buildSyncPlan(event, config, existingWorkItem);

      if (plan.action === 'noop') {
        console.log(`[devazure-zendesk-sync] noop ticket=${plan.ticketId}: ${plan.reason}`);
        json(response, 202, {
          ok: true,
          action: plan.action,
          reason: plan.reason,
          ticketId: plan.ticketId,
        });
        return;
      }

      if (config.dryRun) {
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

      const result = plan.action === 'create'
        ? await devAzureClient.createWorkItem(plan.workItemType, plan.operations)
        : await devAzureClient.updateWorkItem(existingWorkItem!.id, plan.operations);

      console.log(`[devazure-zendesk-sync] ${plan.action} ticket=${plan.ticketId} workItem=${result.id}`);
      json(response, 200, {
        ok: true,
        action: plan.action,
        ticketId: plan.ticketId,
        workItemId: result.id,
        workItemUrl: result.url,
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
