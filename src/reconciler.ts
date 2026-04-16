import { query } from './lib/oracle.js';
import { JOB_TYPES, persistEventAndEnqueueJob } from './worker.js';

/**
 * Polling safety net for missed ADO webhooks. Every cron tick, enqueue a
 * `sync_ado_state_to_zendesk` job for each active link that's gone a while
 * without a refresh. Dedup is enforced by a bucket-stamped event key, so
 * repeated reconciler passes within the same window collapse via the
 * existing SYNC_EVENT unique constraint.
 *
 * This is the fallback path if ADO service hook registration is blocked by
 * permissions (see docs/proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md §6.5).
 */

const RECONCILE_STALE_MINUTES = 15;
const BUCKET_MINUTES = 15;

export async function reconcileActiveLinks(): Promise<{ scanned: number; enqueued: number }> {
  const rows = await query<{
    ID: number;
    ADO_WORK_ITEM_ID: number;
    ZENDESK_TICKET_ID: string;
  }>(
    `SELECT ID, ADO_WORK_ITEM_ID, ZENDESK_TICKET_ID
       FROM SYNC_LINK
      WHERE IS_ACTIVE = 1
        AND (LAST_SYNCED_AT IS NULL
             OR LAST_SYNCED_AT < SYSTIMESTAMP - NUMTODSINTERVAL(:stale, 'MINUTE'))`,
    { stale: RECONCILE_STALE_MINUTES },
  );

  if (rows.length === 0) return { scanned: 0, enqueued: 0 };

  const bucket = bucketStamp();
  let enqueued = 0;

  for (const row of rows) {
    const dedupKey = `ado:reconciler:${row.ADO_WORK_ITEM_ID}:${bucket}`;
    const result = await persistEventAndEnqueueJob(
      {
        sourceSystem: 'ado',
        eventType: 'reconciler.poll',
        sourceEventId: dedupKey,
        dedupKey,
        payload: JSON.stringify({ workItemId: row.ADO_WORK_ITEM_ID, linkId: row.ID, source: 'reconciler' }),
      },
      {
        jobType: JOB_TYPES.syncAdoStateToZendesk,
        payload: { workItemId: row.ADO_WORK_ITEM_ID, source: 'reconciler' },
        relatedLinkId: row.ID,
      },
    );
    if (result != null) enqueued++;
  }

  if (enqueued > 0) {
    console.log(`[reconciler] enqueued ${enqueued}/${rows.length} reconcile jobs (bucket=${bucket})`);
  }
  return { scanned: rows.length, enqueued };
}

function bucketStamp(): string {
  const now = new Date();
  const bucketMs = BUCKET_MINUTES * 60 * 1000;
  const floored = new Date(Math.floor(now.getTime() / bucketMs) * bucketMs);
  return floored.toISOString();
}
