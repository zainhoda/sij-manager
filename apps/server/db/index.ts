import { initDatabase, ensureSchema } from "./schema";

// Initialize database client (uses TURSO_DATABASE_URL env var, or falls back to local file)
const db = initDatabase();

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
