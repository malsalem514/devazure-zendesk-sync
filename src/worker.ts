import oracledb from 'oracledb';
import { getConnection, execute, query } from './lib/oracle.js';
import type { AppConfig } from './types.js';

export type JobHandler = (jobType: string, payload: unknown, config: AppConfig) => Promise<void>;

export const JOB_TYPES = {
  createAdoFromZendesk: 'create_ado_from_zendesk',
  updateAdoFromZendesk: 'update_ado_from_zendesk',
  syncAdoStateToZendesk: 'sync_ado_state_to_zendesk',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

interface PendingJob {
  ID: number;
  JOB_TYPE: string;
  PAYLOAD: string;
  ATTEMPT_COUNT: number;
  MAX_ATTEMPTS: number;
}

export interface FailedJobSummary {
  ID: number;
  JOB_TYPE: string;
  STATUS: string;
  ATTEMPT_COUNT: number;
  MAX_ATTEMPTS: number;
  ERROR_MESSAGE: string | null;
  CREATED_AT: Date;
  FINISHED_AT: Date | null;
}

const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

function extractHttpStatus(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number') return status;
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number') return statusCode;
  }
  return null;
}

async function sendAdminAlert(config: AppConfig, payload: Record<string, unknown>): Promise<void> {
  if (!config.adminAlertWebhookUrl) {
    return;
  }
  try {
    await fetch(config.adminAlertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'zendesk-ado-sync', ...payload }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    console.error('[worker] admin alert failed:', err);
  }
}

/**
 * Claim and execute one pending job using SELECT FOR UPDATE SKIP LOCKED.
 * Returns true if a job was claimed and executed, false if queue was empty.
 */
export async function pollOnce(config: AppConfig, handler: JobHandler): Promise<boolean> {
  const conn = await getConnection();
  try {
    // Claim with explicit transaction — autoCommit must be OFF to hold the FOR UPDATE lock
    const result = await conn.execute<PendingJob>(
      `SELECT ID, JOB_TYPE, PAYLOAD, ATTEMPT_COUNT, MAX_ATTEMPTS
       FROM SYNC_JOB
       WHERE STATUS = 'PENDING' AND NEXT_PROCESS_AT <= SYSTIMESTAMP
       ORDER BY CREATED_AT ASC
       FOR UPDATE SKIP LOCKED`,
      {},
      { maxRows: 1, outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false },
    );

    const rows = (result.rows ?? []) as PendingJob[];
    if (rows.length === 0) {
      return false; // finally block handles conn.close()
    }

    const job = rows[0];

    // Transition to PROCESSING and commit — releases the FOR UPDATE lock
    await conn.execute(
      `UPDATE SYNC_JOB SET STATUS = 'PROCESSING', WORKER_ID = :workerId, STARTED_AT = SYSTIMESTAMP
       WHERE ID = :id`,
      { workerId: WORKER_ID, id: job.ID },
      { autoCommit: false },
    );
    await conn.commit();

    // Release the claim connection before executing job logic
    await conn.close();

    const attemptStart = new Date();
    let attemptResult = 'success';
    let errorSummary: string | null = null;

    try {
      const payload = job.PAYLOAD ? JSON.parse(job.PAYLOAD) : {};
      await handler(job.JOB_TYPE, payload, config);

      await execute(
        `UPDATE SYNC_JOB SET STATUS = 'COMPLETED', FINISHED_AT = SYSTIMESTAMP WHERE ID = :id`,
        { id: job.ID },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorSummary = message.slice(0, 4000);
      attemptResult = 'failure';

      const nextAttempt = job.ATTEMPT_COUNT + 1;
      const httpStatus = extractHttpStatus(err);
      const nonRetryableAuthFailure = httpStatus === 401 || httpStatus === 403;
      if (nonRetryableAuthFailure || nextAttempt >= job.MAX_ATTEMPTS) {
        await execute(
          `UPDATE SYNC_JOB SET STATUS = 'DEAD', ATTEMPT_COUNT = :count, ERROR_MESSAGE = :err, FINISHED_AT = SYSTIMESTAMP
           WHERE ID = :id`,
          { count: nextAttempt, err: errorSummary, id: job.ID },
        );
        console.error(`[worker] job ${job.ID} (${job.JOB_TYPE}) moved to DEAD after ${nextAttempt} attempts: ${errorSummary}`);
        if (nonRetryableAuthFailure) {
          await sendAdminAlert(config, {
            severity: 'critical',
            reason: 'auth_failure',
            status: httpStatus,
            jobId: job.ID,
            jobType: job.JOB_TYPE,
            error: errorSummary,
          });
        }
      } else {
        const backoffSeconds = Math.min(Math.pow(2, nextAttempt) + Math.random(), 3600);
        await execute(
          `UPDATE SYNC_JOB SET STATUS = 'PENDING', ATTEMPT_COUNT = :count, ERROR_MESSAGE = :err,
             NEXT_PROCESS_AT = SYSTIMESTAMP + NUMTODSINTERVAL(:backoff, 'SECOND')
           WHERE ID = :id`,
          { count: nextAttempt, err: errorSummary, backoff: backoffSeconds, id: job.ID },
        );
        console.log(`[worker] job ${job.ID} (${job.JOB_TYPE}) retry #${nextAttempt} in ${Math.round(backoffSeconds)}s`);
      }
    }

    await execute(
      `INSERT INTO SYNC_ATTEMPT (JOB_ID, STARTED_AT, FINISHED_AT, RESULT, ERROR_SUMMARY)
       VALUES (:jobId, :startedAt, SYSTIMESTAMP, :result, :errorSummary)`,
      { jobId: job.ID, startedAt: attemptStart, result: attemptResult, errorSummary },
    );

    return true;
  } catch (err) {
    console.error('[worker] poll error:', err);
    return false;
  } finally {
    try { await conn.close(); } catch { /* already closed after claim, or error path */ }
  }
}

/**
 * Recover stale jobs stuck in PROCESSING for more than 5 minutes.
 */
export async function recoverStaleJobs(): Promise<number> {
  const result = await execute(
    `UPDATE SYNC_JOB SET STATUS = 'PENDING', WORKER_ID = NULL, STARTED_AT = NULL
     WHERE STATUS = 'PROCESSING' AND STARTED_AT < SYSTIMESTAMP - NUMTODSINTERVAL(300, 'SECOND')`,
  );
  const recovered = result.rowsAffected ?? 0;
  if (recovered > 0) {
    console.log(`[worker] recovered ${recovered} stale jobs`);
  }
  return recovered;
}

export async function listDeadJobs(limit = 20): Promise<FailedJobSummary[]> {
  const cappedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return query<FailedJobSummary>(
    `SELECT ID, JOB_TYPE, STATUS, ATTEMPT_COUNT, MAX_ATTEMPTS, ERROR_MESSAGE, CREATED_AT, FINISHED_AT
       FROM SYNC_JOB
      WHERE STATUS IN ('DEAD', 'FAILED')
      ORDER BY COALESCE(FINISHED_AT, CREATED_AT) DESC
      FETCH FIRST ${cappedLimit} ROWS ONLY`,
  );
}

export async function retryJob(jobId: number): Promise<boolean> {
  const result = await execute(
    `UPDATE SYNC_JOB
        SET STATUS = 'PENDING',
            ATTEMPT_COUNT = 0,
            NEXT_PROCESS_AT = SYSTIMESTAMP,
            STARTED_AT = NULL,
            FINISHED_AT = NULL,
            WORKER_ID = NULL,
            ERROR_MESSAGE = NULL
      WHERE ID = :jobId
        AND STATUS IN ('DEAD', 'FAILED')`,
    { jobId },
  );
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Atomically persist an inbound event and enqueue a job in one transaction.
 * Uses INSERT + unique constraint catch (ORA-00001) instead of SELECT-then-INSERT to avoid TOCTOU races.
 * Returns { eventId, jobId } or null if the event is a duplicate.
 */
export async function persistEventAndEnqueueJob(
  event: { sourceSystem: 'zendesk' | 'ado'; eventType: string; sourceEventId: string | null; dedupKey: string; payload: string },
  job: { jobType: string; payload: unknown; relatedLinkId?: number | null },
): Promise<{ eventId: number; jobId: number } | null> {
  const conn = await getConnection();
  try {
    // Insert event — catch unique constraint violation for dedup
    let eventId: number;
    try {
      const eventResult = await conn.execute(
        `INSERT INTO SYNC_EVENT (SOURCE_SYSTEM, SOURCE_EVENT_ID, EVENT_TYPE, DEDUP_KEY, PAYLOAD)
         VALUES (:source, :eventId, :eventType, :dedupKey, :payload)
         RETURNING ID INTO :id`,
        {
          source: event.sourceSystem,
          eventId: event.sourceEventId,
          eventType: event.eventType,
          dedupKey: event.dedupKey,
          payload: event.payload,
          id: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_NUMBER },
        },
        { autoCommit: false },
      );
      const outBinds = eventResult.outBinds as Record<string, unknown[]> | undefined;
      eventId = outBinds?.id?.[0] as number;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorNum' in err && (err as { errorNum: number }).errorNum === 1) {
        // ORA-00001: unique constraint violation — duplicate event
        await conn.close();
        return null;
      }
      throw err;
    }

    // Insert job in the same transaction
    const jobResult = await conn.execute(
      `INSERT INTO SYNC_JOB (JOB_TYPE, RELATED_EVENT_ID, RELATED_LINK_ID, PAYLOAD, DEDUP_KEY)
       VALUES (:jobType, :eventId, :relatedLinkId, :payload, :dedupKey)
       RETURNING ID INTO :id`,
      {
        jobType: job.jobType,
        eventId,
        relatedLinkId: job.relatedLinkId ?? null,
        payload: JSON.stringify(job.payload),
        dedupKey: event.dedupKey,
        id: { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_NUMBER },
      },
      { autoCommit: false },
    );
    const jobOutBinds = jobResult.outBinds as Record<string, unknown[]> | undefined;
    const jobId = jobOutBinds?.id?.[0] as number;

    await conn.commit();
    return { eventId, jobId };
  } catch (err) {
    try { await conn.execute('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    try { await conn.close(); } catch { /* ignore */ }
  }
}
