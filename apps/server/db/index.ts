import { initDatabase, ensureSchema } from "./schema";

// Initialize database client (uses TURSO_DATABASE_URL env var, or falls back to local file)
const db = initDatabase();

// Check if running in demo mode (file-based database vs Turso cloud)
export function isDemoMode(): boolean {
  const dbUrl = process.env.TURSO_DATABASE_URL || "file:sij.db";
  return dbUrl.startsWith("file:");
}

// Async initialization
async function initialize() {
  await ensureSchema(db);
}

// Run initialization
await initialize();

export { db };
export * from "./schema";
export {
  getFishbowl,
  initFishbowlConnection,
  isFishbowlConfigured,
  testFishbowlConnection,
  closeFishbowlConnection,
} from "./fishbowl";
