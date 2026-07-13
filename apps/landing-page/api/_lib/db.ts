import pg from 'pg';

const dbUrl = process.env.DATABASE_URL ?? '';
const pool = new pg.Pool({
  connectionString: dbUrl,
  max: 5,
  ssl: dbUrl.includes('sslmode') ? { rejectUnauthorized: false } : false,
});

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
