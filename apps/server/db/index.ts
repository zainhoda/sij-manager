import { initDatabase } from "./schema";
import { seedDatabase } from "./seed";

// Initialize and seed database
const db = initDatabase("sij.db");
seedDatabase(db);

export { db };
export * from "./schema";
