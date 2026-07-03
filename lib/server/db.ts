import { Pool, types } from 'pg';

// DATE (oid 1082) отдаём строкой 'YYYY-MM-DD' — как отдавал Supabase.
// timestamptz остаётся Date: Response.json сериализует его в ISO-строку.
types.setTypeParser(1082, (v) => v);

// В dev с HMR модуль перевычисляется — переиспользуем пул через globalThis.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.pgPool = pool;
