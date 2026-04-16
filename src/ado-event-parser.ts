/**
 * Parser for Azure DevOps service-hook payloads.
 *
 * Handles `workitem.updated` and `workitem.created` event types — the two
 * events we subscribe to for reverse sync. Payload shapes:
 * https://learn.microsoft.com/en-us/azure/devops/service-hooks/events
 */

export interface AdoWebhookEvent {
  id: string;
  eventType: string;
  workItemId: number;
  revision: number | null;
  projectId: string | null;
  createdDate: string | null;
}

interface AdoWebhookBody {
  id?: unknown;
  eventType?: unknown;
  createdDate?: unknown;
  resource?: {
    id?: unknown;
    workItemId?: unknown;
    rev?: unknown;
    revision?: unknown;
    fields?: Record<string, unknown>;
  };
  resourceContainers?: {
    project?: { id?: unknown };
  };
}

export function parseAdoEvent(rawBody: string): AdoWebhookEvent {
  let parsed: AdoWebhookBody;
  try {
    parsed = JSON.parse(rawBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`ADO webhook: invalid JSON body (${msg})`);
  }

  const eventType = typeof parsed.eventType === 'string' ? parsed.eventType : null;
  if (!eventType || !eventType.startsWith('workitem.')) {
    throw new Error(`ADO webhook: unsupported eventType ${String(parsed.eventType)}`);
  }

  const id = typeof parsed.id === 'string' ? parsed.id : null;
  if (!id) {
    throw new Error('ADO webhook: missing id');
  }

  const resource = parsed.resource ?? {};
  // `workitem.updated` uses resource.workItemId (resource.id is the revision row).
  // `workitem.created` uses resource.id.
  const candidateIds = [resource.workItemId, resource.id];
  let workItemId: number | null = null;
  for (const c of candidateIds) {
    if (typeof c === 'number' && Number.isFinite(c)) {
      workItemId = c;
      break;
    }
    if (typeof c === 'string' && /^\d+$/.test(c)) {
      workItemId = Number(c);
      break;
    }
  }
  if (workItemId == null) {
    throw new Error('ADO webhook: could not locate work item ID in payload');
  }

  const rev =
    typeof resource.rev === 'number'
      ? resource.rev
      : typeof resource.revision === 'number'
        ? resource.revision
        : null;

  const projectId =
    typeof parsed.resourceContainers?.project?.id === 'string'
      ? parsed.resourceContainers.project.id
      : null;

  const createdDate = typeof parsed.createdDate === 'string' ? parsed.createdDate : null;

  return {
    id,
    eventType,
    workItemId,
    revision: rev,
    projectId,
    createdDate,
  };
}
