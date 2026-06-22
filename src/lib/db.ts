import { Pool } from "pg";
import { getEnv } from "@/lib/env";

let pool: Pool | null = null;

/** Returns a singleton pg Pool connected via DB_URL. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getEnv("DB_URL") });
  }
  return pool;
}

/**
 * Convenience: run a parameterised SQL query against the shared pool.
 *
 * Usage:
 *   const rows = await query("SELECT * FROM users WHERE id = $1", [userId]);
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}
