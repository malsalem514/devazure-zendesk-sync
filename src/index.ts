import { loadConfig } from './config.js';
import { createWebhookServer } from './server.js';

const config = loadConfig();
const server = createWebhookServer(config);

server.listen(config.port, () => {
  console.log(
    `[devazure-zendesk-sync] listening on http://localhost:${config.port}${config.webhookPath} (dryRun=${config.dryRun})`,
  );
});

function shutdown(): void {
  console.log('[devazure-zendesk-sync] shutting down…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
