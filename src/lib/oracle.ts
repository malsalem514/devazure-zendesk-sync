import oracledb from 'oracledb';
import type { AppConfig } from '../types.js';

let poolPromise: Promise<oracledb.Pool> | null = null;

async function createPool(config: AppConfig['oracle']): Promise<oracledb.Pool> {
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.autoCommit = true;

  const pool = await oracledb.createPool({
    user: config.user,
    password: config.password,
    connectString: config.connectString,
    poolMin: config.poolMin,
    poolMax: config.poolMax,
    poolIncrement: 1,
  });
  console.log('[oracle] connection pool created');
  return pool;
}

export function getPool(config?: AppConfig['oracle']): Promise<oracledb.Pool> {
  if (!poolPromise) {
    if (!config) {
      throw new Error('Oracle pool not initialized — pass config on first call');
    }
    poolPromise = createPool(config).catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

export async function getConnection(config?: AppConfig['oracle']): Promise<oracledb.Connection> {
  const pool = await getPool(config);
  return pool.getConnection();
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const conn = await getConnection();
  try {
    const result = await conn.execute<T>(sql, params);
    return (result.rows || []) as T[];
  } finally {
    await conn.close();
  }
}

export async function execute(
  sql: string,
  params: Record<string, unknown> = {},
): Promise<oracledb.Result<unknown>> {
  const conn = await getConnection();
  try {
    return await conn.execute(sql, params);
  } finally {
    await conn.close();
  }
}

export async function executeMany(
  sql: string,
  binds: Record<string, unknown>[],
  options: oracledb.ExecuteManyOptions = {},
): Promise<oracledb.Result<unknown>> {
  const conn = await getConnection();
  try {
    return await conn.executeMany(sql, binds, options);
  } finally {
    await conn.close();
  }
}

export async function safeExecuteDDL(conn: oracledb.Connection, sql: string): Promise<void> {
  try {
    await conn.execute(sql);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'errorNum' in error) {
      const errNum = (error as { errorNum: number }).errorNum;
      // 955 = table/name exists, 957 = dup column, 1408 = index exists, 1430 = column exists, 2261 = unique constraint exists
      if (errNum === 955 || errNum === 957 || errNum === 1408 || errNum === 1430 || errNum === 2261) return;
    }
    throw error;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query<{ OK: number }>('SELECT 1 AS OK FROM DUAL');
    return result[0]?.OK === 1;
  } catch (error) {
    console.error('[oracle] health check failed:', error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close(0);
    poolPromise = null;
    console.log('[oracle] connection pool closed');
  }
}
