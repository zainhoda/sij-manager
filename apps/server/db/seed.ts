/**
 * Database seeding - simplified version for new schema
 * The old import pipeline was tied to the products/orders model
 *
 * New schema uses:
 * - fishbowl_bom_cache (synced from Fishbowl)
 * - bom_steps / bom_step_configurations
 * - demand_entries (replaces orders)
 * - production_history
 */
import type { Client } from "@libsql/client";
import { initDatabase, ensureSchema } from "./schema";

export async function seedDatabase(db: Client) {
  // Check if already seeded by looking for any work categories (created by schema)
  const existingCategories = await db.execute("SELECT id FROM work_categories LIMIT 1");
  if (existingCategories.rows.length > 0) {
    console.log("Database schema initialized with default work categories");
    return;
  }

  console.log("Database initialized. Use the admin UI or Fishbowl sync to populate data.");
}

// Run if called directly
if (import.meta.main) {
  const db = initDatabase();
  await ensureSchema(db);
  await seedDatabase(db);
  db.close();
}
