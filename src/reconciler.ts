import oracledb from 'oracledb';
import { getConnection, query } from './lib/oracle.js';

/**
 * Reconciler — the polling safety net for missed ADO webhooks.
 *
 * Every cron tick, enqueue a `sync_ado_state_to_zendesk` job for each active
 * link that's gone a while without a refresh. Dedup is enforced by a quarter-
 * hour-bucketed key, so repeated reconciler passes within the same window
 * collapse to one job via the existing SYNC_EVENT unique constraint.
 *
 * This is the fallback path if ADO service hook registration is blocked by
 * permissions (see docs/proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md §6.5).
 */

// Active links whose LAST_SYNCED_AT is stale by this much get re-queued.
const RECONCILE_STALE_MINUTES = 15;
// Enqueue bucket — one job per workItemId per 15-minute window.
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
    if (await enqueueReconcileJob(dedupKey, row.ADO_WORK_ITEM_ID, row.ID)) {
      enqueued++;
    }
  }

  if (enqueued > 0) {
    console.log(`[reconciler] enqueued ${enqueued}/${rows.length} reconcile jobs (bucket=${bucket})`);
  }
  return { scanned: rows.length, enqueued };
}

/**
 * Insert a dedicated `SYNC_EVENT` row + `SYNC_JOB` row for a reconciliation
 * poll. Returns `false` if the event's dedup key already exists (ORA-00001),
 * which means a concurrent reconciler or real webhook already queued it.
 */
async function enqueueReconcileJob(
  dedupKey: string,
  workItemId: number,
  linkId: number,
): Promise<boolean> {
  const conn = await getConnection();
  try {
    let eventId: number;
    try {
      const eventResult = await conn.execute(
        `INSERT INTO SYNC_EVENT (SOURCE_SYSTEM, SOURCE_EVENT_ID, EVENT_TYPE, DEDUP_KEY, PAYLOAD)
         VALUES ('ado', :key, 'reconciler.poll', :key, :payload)
         RETURNING ID INTO :id`,
        {
          key: dedupKey,
          payload: JSON.stringify({ workItemId, linkId, source: 'reconciler' }),
          id: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_NUMBER },
        },
        { autoCommit: false },
      );
      const outBinds = eventResult.outBinds as Record<string, unknown[]> | undefined;
      eventId = outBinds?.id?.[0] as number;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorNum' in err && (err as { errorNum: number }).errorNum === 1) {
        return false; // duplicate — already enqueued this bucket
      }
      throw err;
    }

    await conn.execute(
      `INSERT INTO SYNC_JOB (JOB_TYPE, RELATED_EVENT_ID, RELATED_LINK_ID, PAYLOAD, DEDUP_KEY)
       VALUES ('sync_ado_state_to_zendesk', :eventId, :linkId, :payload, :key)`,
      {
        eventId,
        linkId,
        payload: JSON.stringify({ workItemId, source: 'reconciler' }),
        key: dedupKey,
      },
      { autoCommit: false },
    );

    await conn.commit();
    return true;
  } catch (err) {
    try { await conn.execute('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    try { await conn.close(); } catch { /* ignore */ }
  }
}

function bucketStamp(): string {
  const now = new Date();
  const bucketMs = BUCKET_MINUTES * 60 * 1000;
  const floored = new Date(Math.floor(now.getTime() / bucketMs) * bucketMs);
  return floored.toISOString();
}
