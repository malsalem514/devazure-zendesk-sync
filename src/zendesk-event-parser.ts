import type { ZendeskTicketDetail, ZendeskTicketEvent } from './types.js';

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }

  return value as Record<string, unknown>;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asOptionalString(item))
    .filter((item): item is string => item != null);
}

function parseDetail(rawDetail: unknown): ZendeskTicketDetail {
  const detail = asRecord(rawDetail, 'detail');
  const ticketId = asOptionalString(detail['id']);

  if (!ticketId) {
    throw new Error('Zendesk ticket event is missing detail.id');
  }

  const via = detail['via'] == null ? null : asRecord(detail['via'], 'detail.via');

  return {
    id: ticketId,
    subject: asOptionalString(detail['subject']),
    description: asOptionalString(detail['description']),
    status: asOptionalString(detail['status']),
    priority: asOptionalString(detail['priority']),
    type: asOptionalString(detail['type']),
    tags: asStringArray(detail['tags']),
    updatedAt: asOptionalString(detail['updated_at']),
    createdAt: asOptionalString(detail['created_at']),
    requesterId: asOptionalString(detail['requester_id']),
    assigneeId: asOptionalString(detail['assignee_id']),
    organizationId: asOptionalString(detail['organization_id']),
    groupId: asOptionalString(detail['group_id']),
    brandId: asOptionalString(detail['brand_id']),
    viaChannel: via ? asOptionalString(via['channel']) : null,
  };
}

export function parseZendeskTicketEvent(rawBody: string): ZendeskTicketEvent {
  const parsed = JSON.parse(rawBody) as unknown;
  const event = asRecord(parsed, 'webhook payload');
  const eventMeta = event['event'] == null ? null : asRecord(event['event'], 'event');
  const comment = eventMeta?.['comment'] == null
    ? null
    : asRecord(eventMeta['comment'], 'event.comment');

  const type = asOptionalString(event['type']);
  const id = asOptionalString(event['id']);

  if (!type || !id) {
    throw new Error('Zendesk webhook payload is missing id or type');
  }

  return {
    id,
    type,
    subject: asOptionalString(event['subject']),
    time: asOptionalString(event['time']),
    zendeskEventVersion: asOptionalString(event['zendesk_event_version']),
    detail: parseDetail(event['detail']),
    commentId: comment ? asOptionalString(comment['id']) : null,
    commentBody: comment ? asOptionalString(comment['body']) : null,
  };
}
