import { createHash } from 'node:crypto';
import { DevAzureClient } from './devazure-client.js';
import { execute, query } from './lib/oracle.js';

/**
 * ADO Status derivation, Status Detail formatting, and iteration metadata cache.
 *
 * Rules:
 *  - Status derivation:   docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md §9
 *  - Status Detail tmpls: docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md §8
 */

export const ADO_STATUS_TAGS = {
  inDevBacklog: 'ado_status_in_dev_backlog',
  scheduledInSprint: 'ado_status_scheduled_in_sprint',
  devInProgress: 'ado_status_dev_in_progress',
  onHold: 'ado_status_on_hold',
  supportReady: 'ado_status_support_ready',
} as const;

export type AdoStatusTag = (typeof ADO_STATUS_TAGS)[keyof typeof ADO_STATUS_TAGS];

export const ADO_SYNC_HEALTH_TAGS = {
  ok: 'ado_sync_health_ok',
  warning: 'ado_sync_health_warning',
  error: 'ado_sync_health_error',
} as const;

// ADO work item states mapped to derivation categories (§9 table).
const COMPLETION_STATES = new Set(['Resolved', 'Completed', 'Closed', 'Done', 'Removed']);
const ON_HOLD_STATES = new Set(['On Hold', 'Hold', 'Blocked']);
const ACTIVE_STATES = new Set([
  'Active',
  'Committed',
  'In Development',
  'In Testing',
  'Waiting on Development',
  'Waiting on Testing',
]);

export function deriveAdoStatus(params: {
  workItemState: string | null;
  hasDatedSprint: boolean;
}): AdoStatusTag {
  const state = (params.workItemState ?? '').trim();
  if (state && COMPLETION_STATES.has(state)) return ADO_STATUS_TAGS.supportReady;
  if (state && ON_HOLD_STATES.has(state)) return ADO_STATUS_TAGS.onHold;
  if (state && ACTIVE_STATES.has(state)) return ADO_STATUS_TAGS.devInProgress;
  if (params.hasDatedSprint) return ADO_STATUS_TAGS.devInProgress;
  return ADO_STATUS_TAGS.inDevBacklog;
}

export function formatStatusDetail(params: {
  status: AdoStatusTag;
  workItemState: string | null;
  sprintName: string | null;
  sprintStart: string | null;
  sprintEnd: string | null;
}): string {
  const { status, workItemState, sprintName, sprintStart, sprintEnd } = params;
  const hasRange = Boolean(sprintName && sprintStart && sprintEnd);
  const range = hasRange ? ` (${formatMonthDay(sprintStart!)} - ${formatMonthDay(sprintEnd!)})` : '';
  const state = (workItemState ?? '').trim();

  if (status === ADO_STATUS_TAGS.supportReady) {
    return hasRange ? `Resolved in ${sprintName}${range}` : 'Support ready';
  }
  if (status === ADO_STATUS_TAGS.devInProgress) {
    if (state === 'In Testing' || state === 'Waiting on Testing') {
      return hasRange ? `In testing in ${sprintName}${range}` : 'In testing';
    }
    if (state === 'Waiting on Development') {
      return hasRange ? `Waiting on development in ${sprintName}${range}` : 'Waiting on development';
    }
    return hasRange ? `In development in ${sprintName}${range}` : 'In development';
  }
  if (status === ADO_STATUS_TAGS.onHold) {
    return hasRange ? `On hold in ${sprintName}${range}` : 'On hold in ADO';
  }
  if (status === ADO_STATUS_TAGS.scheduledInSprint) {
    return hasRange ? `Scheduled in ${sprintName}${range}` : 'Scheduled in sprint';
  }
  return 'In backlog';
}

function formatMonthDay(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Canonicalized, order-stable SHA-256 over the fields that matter for a no-op check.
 * Feed this into SYNC_LINK.LAST_ADO_FINGERPRINT to skip redundant Zendesk writes (design pillar 2).
 */
export function computeAdoFingerprint(snapshot: {
  workItemState: string | null;
  status: AdoStatusTag;
  statusDetail: string;
  sprintName: string | null;
  sprintStart: string | null;
  sprintEnd: string | null;
  eta: string | null;
  workItemUrl: string;
}): string {
  const keys = Object.keys(snapshot).sort() as Array<keyof typeof snapshot>;
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = snapshot[k];
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}

export interface IterationMetadata {
  displayName: string;
  startDate: string | null;
  finishDate: string | null;
}

export function hasDatedRange(iteration: IterationMetadata | null | undefined): boolean {
  return Boolean(iteration?.startDate && iteration?.finishDate);
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface IterationCacheRow {
  DISPLAY_NAME: string;
  START_DATE: Date | null;
  FINISH_DATE: Date | null;
  REFRESHED_AT: Date;
}

/**
 * Resolve iteration metadata via the `ITERATION_CACHE` table, falling back to
 * the ADO classification-nodes API when the cache is stale or cold.
 */
export async function fetchIterationMetadata(
  client: DevAzureClient,
  project: string,
  iterationPath: string | null | undefined,
): Promise<IterationMetadata | null> {
  if (!iterationPath) return null;

  const cached = await query<IterationCacheRow>(
    `SELECT DISPLAY_NAME, START_DATE, FINISH_DATE, REFRESHED_AT
       FROM ITERATION_CACHE
      WHERE ADO_PROJECT = :project AND ITERATION_PATH = :path`,
    { project, path: iterationPath },
  );

  const row = cached[0];
  if (row && Date.now() - row.REFRESHED_AT.getTime() < CACHE_TTL_MS) {
    return rowToMetadata(row);
  }

  const fresh = await client.getIteration(iterationPath);
  if (!fresh) return null;

  await execute(
    `MERGE INTO ITERATION_CACHE tgt
       USING (SELECT :project AS ADO_PROJECT, :path AS ITERATION_PATH FROM DUAL) src
          ON (tgt.ADO_PROJECT = src.ADO_PROJECT AND tgt.ITERATION_PATH = src.ITERATION_PATH)
     WHEN MATCHED THEN
       UPDATE SET DISPLAY_NAME = :name, START_DATE = :startDate, FINISH_DATE = :finishDate, REFRESHED_AT = SYSTIMESTAMP
     WHEN NOT MATCHED THEN
       INSERT (ADO_PROJECT, ITERATION_PATH, DISPLAY_NAME, START_DATE, FINISH_DATE, REFRESHED_AT)
       VALUES (:project, :path, :name, :startDate, :finishDate, SYSTIMESTAMP)`,
    {
      project,
      path: iterationPath,
      name: fresh.displayName,
      startDate: fresh.startDate ? new Date(fresh.startDate) : null,
      finishDate: fresh.finishDate ? new Date(fresh.finishDate) : null,
    },
  );

  return fresh;
}

function rowToMetadata(row: IterationCacheRow): IterationMetadata {
  return {
    displayName: row.DISPLAY_NAME,
    startDate: row.START_DATE ? row.START_DATE.toISOString() : null,
    finishDate: row.FINISH_DATE ? row.FINISH_DATE.toISOString() : null,
  };
}
