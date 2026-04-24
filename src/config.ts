import type { AppConfig } from './types.js';

const DEFAULT_ZENDESK_APP_ALLOWED_FORM_IDS = [50882600373907];

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

function parsePositiveIntList(value: string | undefined, fallback: number[]): number[] {
  if (value == null || value.trim() === '') {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed === '*' || trimmed.toLowerCase() === 'all') {
    return [];
  }

  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Expected at least one positive integer or "*" for ZENDESK_APP_ALLOWED_FORM_IDS');
  }

  return parts.map((part) => parsePositiveInt(part, 1));
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }
  return parsePositiveInt(value, 1);
}

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative number. Received: ${value}`);
  }
  return parsed;
}

function parseStringMap(value: string | undefined, envName: string): Record<string, string> {
  if (value == null || value.trim() === '') {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${envName} must be a JSON object`);
  }

  const result: Record<string, string> = {};
  for (const [key, mapValue] of Object.entries(parsed)) {
    if (typeof mapValue !== 'string' || mapValue.trim() === '') {
      throw new Error(`${envName} values must be non-empty strings`);
    }
    result[key] = mapValue.trim();
  }
  return result;
}

function parsePositiveIntMap(value: string | undefined, envName: string): Record<string, number> {
  if (value == null || value.trim() === '') {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${envName} must be a JSON object`);
  }

  const result: Record<string, number> = {};
  for (const [key, mapValue] of Object.entries(parsed)) {
    const rawValue = typeof mapValue === 'number' ? String(mapValue) : String(mapValue ?? '');
    result[key] = parsePositiveInt(rawValue, 1);
  }
  return result;
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
    internalAdminToken: env['INTERNAL_ADMIN_TOKEN']?.trim() || undefined,
    adminAlertWebhookUrl: env['SYNC_ADMIN_ALERT_WEBHOOK_URL']?.trim() || undefined,
    commentSyncMaxAgeHours: parseNonNegativeNumber(env['COMMENT_SYNC_MAX_AGE_HOURS'], 24),
    maxAttachmentBytes: parsePositiveInt(env['SYNC_MAX_ATTACHMENT_BYTES'], 10 * 1024 * 1024),
    zendesk: {
      webhookSecret: skipSignatureVerification
        ? env['ZENDESK_WEBHOOK_SECRET']?.trim() || undefined
        : requireEnv('ZENDESK_WEBHOOK_SECRET', env),
      baseUrl: env['ZENDESK_BASE_URL']?.trim() || undefined,
      skipSignatureVerification,
      apiUsername: env['ZENDESK_API_USERNAME']?.trim() || undefined,
      apiToken: env['ZENDESK_API_TOKEN']?.trim() || undefined,
      appSharedSecret: env['ZENDESK_APP_SHARED_SECRET']?.trim() || undefined,
      appAllowedFormIds: parsePositiveIntList(
        env['ZENDESK_APP_ALLOWED_FORM_IDS'],
        DEFAULT_ZENDESK_APP_ALLOWED_FORM_IDS,
      ),
      devCompletedStatusId: parseOptionalPositiveInt(env['ZENDESK_DEV_COMPLETED_STATUS_ID']),
      adoStatusCustomStatusMap: parsePositiveIntMap(
        env['ZENDESK_ADO_STATUS_CUSTOM_STATUS_MAP'],
        'ZENDESK_ADO_STATUS_CUSTOM_STATUS_MAP',
      ),
    },
    devAzure: {
      orgUrl: requireEnv('DEVAZURE_ORG_URL', env),
      project: requireEnv('DEVAZURE_PROJECT', env),
      pat: requireEnv('DEVAZURE_PAT', env),
      workItemType: env['DEVAZURE_WORK_ITEM_TYPE']?.trim() || 'Bug',
      areaPath: env['DEVAZURE_AREA_PATH']?.trim() || undefined,
      iterationPath: env['DEVAZURE_ITERATION_PATH']?.trim() || undefined,
      assignedTo: env['DEVAZURE_ASSIGNED_TO']?.trim() || undefined,
      targetDateField: env['DEVAZURE_TARGET_DATE_FIELD']?.trim() || 'Microsoft.VSTS.Scheduling.TargetDate',
      zendeskAssigneeMap: parseStringMap(env['ZENDESK_ASSIGNEE_ADO_MAP'], 'ZENDESK_ASSIGNEE_ADO_MAP'),
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
