import type { AppConfig, ExistingWorkItem, JsonPatchOperation, SyncPlan, ZendeskTicketEvent } from './types.js';
import { resolveRoute, resolveWorkItemType } from './routing.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ZENDESK_PRIORITY_MAP: Record<string, number> = {
  urgent: 1,
  high: 1,
  normal: 2,
  low: 3,
};

function mapPriority(priority: string | null): number | null {
  if (!priority) {
    return null;
  }

  return ZENDESK_PRIORITY_MAP[priority.toLowerCase()] ?? null;
}

function shouldSkipEvent(event: ZendeskTicketEvent): string | null {
  const comment = event.commentBody?.trim() ?? '';
  if (comment.startsWith('[Synced by integration]') || comment.startsWith('[Synced by sidebar]')) {
    return 'Ignoring integration-authored Zendesk note';
  }

  const ignoredSuffixes = [
    'marked_as_spam',
    'soft_deleted',
    'permanently_deleted',
    'merged',
  ];

  const match = ignoredSuffixes.find((suffix) => event.type.endsWith(suffix));
  return match ? `Ignoring destructive Zendesk event: ${match}` : null;
}

function zendeskTicketUrl(baseUrl: string | undefined, ticketId: string): string | null {
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/agent/tickets/${ticketId}` : null;
}

function buildDescription(event: ZendeskTicketEvent, config: AppConfig): string {
  const ticketUrl = zendeskTicketUrl(config.zendesk.baseUrl, event.detail.id);

  const metadataRows = [
    ['Zendesk ticket', `#${event.detail.id}`],
    ['Event type', event.type],
    ['Status', event.detail.status ?? 'unknown'],
    ['Priority', event.detail.priority ?? 'unknown'],
    ['Requester', event.detail.requesterId ?? 'unknown'],
    ['Assignee', event.detail.assigneeId ?? 'unassigned'],
    ['Group', event.detail.groupId ?? 'unknown'],
    ['Brand', event.detail.brandId ?? 'unknown'],
    ['Updated at', event.detail.updatedAt ?? event.time ?? 'unknown'],
    ['Source URL', ticketUrl ?? 'not configured'],
  ]
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join('');

  const blocks = [
    `<p>Synced from Zendesk ticket <strong>#${escapeHtml(event.detail.id)}</strong>.</p>`,
    `<ul>${metadataRows}</ul>`,
  ];

  if (event.detail.description) {
    blocks.push(
      `<h3>Description</h3><p>${escapeHtml(event.detail.description).replaceAll('\n', '<br />')}</p>`,
    );
  }

  if (event.commentBody) {
    blocks.push(
      `<h3>Latest Comment</h3><p>${escapeHtml(event.commentBody).replaceAll('\n', '<br />')}</p>`,
    );
  }

  return blocks.join('');
}

function buildTags(event: ZendeskTicketEvent): string[] {
  const baseTags = [
    'zendesk',
    'zendesk-ticket',
    `zendesk:id:${event.detail.id}`,
  ];

  if (event.detail.status) {
    baseTags.push(`zendesk:status:${slug(event.detail.status)}`);
  }

  if (event.detail.priority) {
    baseTags.push(`zendesk:priority:${slug(event.detail.priority)}`);
  }

  for (const tag of event.detail.tags) {
    const normalized = slug(tag);
    if (normalized) {
      baseTags.push(`zendesk:tag:${normalized}`);
    }
  }

  return Array.from(new Set(baseTags));
}

function buildOperations(
  event: ZendeskTicketEvent,
  config: AppConfig,
  title: string,
  description: string,
  tags: string[],
  workItemType: string,
  isCreate: boolean,
): JsonPatchOperation[] {
  const operations: JsonPatchOperation[] = [
    { op: 'add', path: '/fields/System.Title', value: title },
    { op: 'add', path: '/fields/System.Description', value: description },
    { op: 'add', path: '/fields/System.Tags', value: tags.join('; ') },
    {
      op: 'add',
      path: '/fields/System.History',
      value: `Synced from Zendesk event ${event.type} at ${event.time ?? new Date().toISOString()}`,
    },
  ];

  const priority = mapPriority(event.detail.priority);
  if (priority != null) {
    operations.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.Priority',
      value: priority,
    });
  }

  // Required ADO fields for creation
  if (isCreate) {
    operations.push({ op: 'add', path: '/fields/Custom.Bucket', value: 'Support' });
    operations.push({ op: 'add', path: '/fields/Custom.Unplanned', value: true });

    // Bug and User Story require ValueArea
    if (workItemType === 'Bug' || workItemType === 'User Story') {
      operations.push({ op: 'add', path: '/fields/Microsoft.VSTS.Common.ValueArea', value: 'Business' });
    }

    // Routing: resolve area path and product from Zendesk product family
    const route = resolveRoute(event.detail.product);
    operations.push({ op: 'add', path: '/fields/System.AreaPath', value: route.areaPath });
    if (route.customProduct) {
      operations.push({ op: 'add', path: '/fields/Custom.Product', value: route.customProduct });
    }
  }

  // Config-level overrides (take precedence over routing when set)
  if (config.devAzure.areaPath) {
    const existing = operations.findIndex((op) => op.path === '/fields/System.AreaPath');
    if (existing >= 0) {
      operations[existing] = { op: 'add', path: '/fields/System.AreaPath', value: config.devAzure.areaPath };
    } else {
      operations.push({ op: 'add', path: '/fields/System.AreaPath', value: config.devAzure.areaPath });
    }
  }

  if (config.devAzure.iterationPath) {
    operations.push({ op: 'add', path: '/fields/System.IterationPath', value: config.devAzure.iterationPath });
  }

  if (config.devAzure.assignedTo) {
    operations.push({ op: 'add', path: '/fields/System.AssignedTo', value: config.devAzure.assignedTo });
  }

  // Zendesk field mappings
  if (event.detail.orgName) {
    operations.push({ op: 'add', path: '/fields/Custom.Client', value: event.detail.orgName });
  }
  if (event.detail.crf) {
    operations.push({ op: 'add', path: '/fields/Custom.CRF', value: event.detail.crf });
  }

  // Hyperlink to Zendesk ticket (only on create)
  const hyperlinkUrl = isCreate
    ? zendeskTicketUrl(config.zendesk.baseUrl, event.detail.id)
    : null;

  if (hyperlinkUrl) {
    operations.push({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'Hyperlink',
        url: hyperlinkUrl,
        attributes: {
          comment: `Zendesk ticket #${event.detail.id}`,
        },
      },
    });
  }

  return operations;
}

export function buildSyncPlan(
  event: ZendeskTicketEvent,
  config: AppConfig,
  existingWorkItem: ExistingWorkItem | null,
): SyncPlan {
  const skipReason = shouldSkipEvent(event);
  const titleSubject = event.detail.subject ?? event.subject ?? 'Untitled Zendesk ticket';
  const title = `[Zendesk #${event.detail.id}] ${titleSubject}`;
  const workItemType = resolveWorkItemType(event.detail.caseType);

  if (skipReason) {
    return {
      action: 'noop',
      reason: skipReason,
      ticketId: event.detail.id,
      workItemType,
      title,
      operations: [],
      tags: [],
    };
  }

  const isCreate = existingWorkItem == null;
  const description = buildDescription(event, config);
  const tags = buildTags(event);
  const operations = buildOperations(
    event,
    config,
    title,
    description,
    tags,
    workItemType,
    isCreate,
  );

  if (existingWorkItem) {
    operations.unshift({ op: 'test', path: '/rev', value: existingWorkItem.rev });
  }

  return {
    action: isCreate ? 'create' : 'update',
    reason: existingWorkItem
      ? `Updating existing DevAzure work item ${existingWorkItem.id}`
      : 'Creating new DevAzure work item for Zendesk ticket',
    ticketId: event.detail.id,
    workItemType,
    title,
    operations,
    tags,
  };
}
