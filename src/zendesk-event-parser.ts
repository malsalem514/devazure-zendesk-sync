import type { ZendeskCommentAttachment, ZendeskTicketDetail, ZendeskTicketEvent } from './types.js';

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

function asOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return null;
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseAttachments(value: unknown): ZendeskCommentAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const id = asOptionalString(record['id']);
    const fileName = asOptionalString(record['file_name'] ?? record['filename'] ?? record['name']);
    const contentUrl = asOptionalString(record['content_url'] ?? record['url']);
    if (!id || !fileName || !contentUrl) {
      return [];
    }
    return [{
      id,
      fileName,
      contentUrl,
      contentType: asOptionalString(record['content_type'] ?? record['contentType']),
      size: asOptionalNumber(record['size']),
    }];
  });
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
    ticketFormId: asOptionalNumber(detail['ticket_form_id'] ?? detail['ticketFormId'] ?? detail['form_id']),
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
    product: asOptionalString(detail['product']),
    orgName: asOptionalString(detail['org_name']),
    caseType: asOptionalString(detail['case_type']),
    crf: asOptionalString(detail['crf']),
    xref: asOptionalString(detail['xref']),
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
    commentPublic: comment
      ? asOptionalBoolean(comment['public'] ?? comment['is_public'])
      : null,
    commentAttachments: comment
      ? parseAttachments(comment['attachments'])
      : [],
  };
}
