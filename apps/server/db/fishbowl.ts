import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";

let fishbowlPool: Pool | null = null;

/**
 * Initialize Fishbowl MySQL connection pool
 * This is a READ-ONLY connection - sij-manager never writes to Fishbowl
 */
export function initFishbowlConnection(): Pool {
  if (!fishbowlPool) {
    const host = process.env.FISHBOWL_HOST;
    const port = parseInt(process.env.FISHBOWL_PORT || "4320");
    const database = process.env.FISHBOWL_DATABASE;
    const user = process.env.FISHBOWL_USER;
    const password = process.env.FISHBOWL_PASSWORD;

    if (!host || !database || !user || !password) {
      throw new Error(
        "Fishbowl connection requires FISHBOWL_HOST, FISHBOWL_DATABASE, FISHBOWL_USER, and FISHBOWL_PASSWORD environment variables"
      );
    }

    fishbowlPool = createPool({
      host,
      port,
      database,
      user,
      password,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      // Enable connection keep-alive
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    console.log(`[Fishbowl] Connected to ${host}:${port}/${database}`);
  }
  return fishbowlPool;
}

/**
 * Get the Fishbowl connection pool (lazy initialization)
 */
export function getFishbowl(): Pool {
  if (!fishbowlPool) {
    return initFishbowlConnection();
  }
  return fishbowlPool;
}

/**
 * Check if Fishbowl connection is configured
 */
export function isFishbowlConfigured(): boolean {
  return !!(
    process.env.FISHBOWL_HOST &&
    process.env.FISHBOWL_DATABASE &&
    process.env.FISHBOWL_USER &&
    process.env.FISHBOWL_PASSWORD
  );
}

/**
 * Test Fishbowl connection
 */
export async function testFishbowlConnection(): Promise<{
  connected: boolean;
  error?: string;
  database?: string;
}> {
  try {
    const pool = getFishbowl();
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() as db");
    return {
      connected: true,
      database: rows[0]?.db as string,
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Close Fishbowl connection pool
 */
export async function closeFishbowlConnection(): Promise<void> {
  if (fishbowlPool) {
    await fishbowlPool.end();
    fishbowlPool = null;
    console.log("[Fishbowl] Connection closed");
  }
}

export { fishbowlPool };
