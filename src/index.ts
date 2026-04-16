import cron from 'node-cron';
import { loadConfig } from './config.js';
import { getPool, closePool } from './lib/oracle.js';
import { dispatchJob } from './job-handlers.js';
import { initializeSchema } from './schema.js';
import { createWebhookServer } from './server.js';
import { pollOnce, recoverStaleJobs } from './worker.js';

const config = loadConfig();

// Initialize Oracle pool and schema before starting the HTTP server
await getPool(config.oracle);
await initializeSchema();

const server = createWebhookServer(config);

server.listen(config.port, () => {
  console.log(
    `[devazure-zendesk-sync] listening on http://localhost:${config.port}${config.webhookPath} (dryRun=${config.dryRun})`,
  );
});

// Worker: poll for pending jobs every 10 seconds (skip in dry-run mode)
let workerRunning = false;
const workerTask = config.dryRun
  ? null
  : cron.schedule('*/10 * * * * *', async () => {
      if (workerRunning) return;
      workerRunning = true;
      try {
        let processed = 0;
        while (processed < 50 && await pollOnce(config, dispatchJob)) {
          processed++;
        }
      } finally {
        workerRunning = false;
      }
    });

// Reconciliation: recover stale jobs every 5 minutes
const reconcileTask = config.dryRun
  ? null
  : cron.schedule('*/5 * * * *', async () => {
      await recoverStaleJobs();
    });

if (!config.dryRun) {
  console.log('[worker] job polling started (every 10s)');
  console.log('[reconciler] stale job recovery started (every 5m)');
}

async function shutdown(): Promise<void> {
  console.log('[devazure-zendesk-sync] shutting down…');
  workerTask?.stop();
  reconcileTask?.stop();
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
