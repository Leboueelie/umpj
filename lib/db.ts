import { Pool, type PoolConfig } from "pg";

const globalForDb = globalThis as unknown as { pool?: Pool };

const config: PoolConfig & { family?: number } = {
  connectionString: process.env.DATABASE_URL,
  family: 4,
};

export const pool = globalForDb.pool ?? new Pool(config);

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
