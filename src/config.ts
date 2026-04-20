import type { AppConfig } from './types.js';

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer. Received: ${value}`);
  }

  return parsed;
}

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];
  if (value == null || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const skipSignatureVerification = parseBoolean(
    env['ZENDESK_SKIP_SIGNATURE_VERIFICATION'],
    false,
  );

  return {
    port: parsePositiveInt(env['PORT'], 8787),
    webhookPath: env['WEBHOOK_PATH']?.trim() || '/webhooks/zendesk',
    dryRun: parseBoolean(env['SYNC_DRY_RUN'], true),
    inboundBearerToken: env['INBOUND_BEARER_TOKEN']?.trim() || undefined,
    zendesk: {
      webhookSecret: skipSignatureVerification
        ? env['ZENDESK_WEBHOOK_SECRET']?.trim() || undefined
        : requireEnv('ZENDESK_WEBHOOK_SECRET', env),
      baseUrl: env['ZENDESK_BASE_URL']?.trim() || undefined,
      skipSignatureVerification,
      apiUsername: env['ZENDESK_API_USERNAME']?.trim() || undefined,
      apiToken: env['ZENDESK_API_TOKEN']?.trim() || undefined,
      appSharedSecret: env['ZENDESK_APP_SHARED_SECRET']?.trim() || undefined,
    },
    devAzure: {
      orgUrl: requireEnv('DEVAZURE_ORG_URL', env),
      project: requireEnv('DEVAZURE_PROJECT', env),
      pat: requireEnv('DEVAZURE_PAT', env),
      workItemType: env['DEVAZURE_WORK_ITEM_TYPE']?.trim() || 'Bug',
      areaPath: env['DEVAZURE_AREA_PATH']?.trim() || undefined,
      iterationPath: env['DEVAZURE_ITERATION_PATH']?.trim() || undefined,
      assignedTo: env['DEVAZURE_ASSIGNED_TO']?.trim() || undefined,
      apiVersion: env['DEVAZURE_API_VERSION']?.trim() || '7.1',
      webhookPath: env['DEVAZURE_WEBHOOK_PATH']?.trim() || '/webhooks/ado',
      webhookUsername: env['DEVAZURE_WEBHOOK_USERNAME']?.trim() || undefined,
      webhookPassword: env['DEVAZURE_WEBHOOK_PASSWORD']?.trim() || undefined,
    },
    oracle: {
      user: requireEnv('ORACLE_DB_USERNAME', env),
      password: requireEnv('ORACLE_DB_PASSWORD', env),
      connectString: `${requireEnv('ORACLE_DB_HOST', env)}/${requireEnv('ORACLE_DB_SERVICE', env)}`,
      poolMin: parsePositiveInt(env['ORACLE_POOL_MIN'], 2),
      poolMax: parsePositiveInt(env['ORACLE_POOL_MAX'], 10),
    },
  };
}
