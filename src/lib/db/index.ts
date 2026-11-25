import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  if (!dbInstance) {
    // Standard Neon serverless configuration
    pool = new Pool({ connectionString: databaseUrl });
    dbInstance = drizzle(pool, { schema });
  }

  return dbInstance;
}

export type DbClient = ReturnType<typeof getDb>;

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      connected: false,
      error: "DATABASE_URL is not configured. Add Neon connection string to .env.local.",
    };
  }

  const start = Date.now();
  try {
    const testPool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    const client = await testPool.connect();
    try {
      await client.query("SELECT 1;");
      return {
        connected: true,
        latencyMs: Date.now() - start,
      };
    } finally {
      client.release();
      await testPool.end();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown database connection failure";
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}
