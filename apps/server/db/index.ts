import { initDatabase } from "./schema";
import { seedDatabase } from "./seed";

// Initialize and seed database
const db = initDatabase("sij.db");
seedDatabase(db);

// Migration: Move existing worker assignments to task_worker_assignments table
function migrateWorkerAssignments() {
  // Check if there are any schedule_entries with worker_id but no corresponding task_worker_assignments
  const needsMigration = db.query(`
    SELECT se.id, se.worker_id, se.actual_start_time, se.actual_end_time, se.actual_output, se.status, se.notes
    FROM schedule_entries se
    WHERE se.worker_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM task_worker_assignments twa
      WHERE twa.schedule_entry_id = se.id AND twa.worker_id = se.worker_id
    )
  `).all() as {
    id: number;
    worker_id: number;
    actual_start_time: string | null;
    actual_end_time: string | null;
    actual_output: number;
    status: string;
    notes: string | null;
  }[];

  if (needsMigration.length > 0) {
    console.log(`Migrating ${needsMigration.length} worker assignments to new table...`);

    for (const entry of needsMigration) {
      try {
        db.run(
          `INSERT INTO task_worker_assignments
           (schedule_entry_id, worker_id, actual_start_time, actual_end_time, actual_output, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            entry.id,
            entry.worker_id,
            entry.actual_start_time,
            entry.actual_end_time,
            entry.actual_output,
            entry.status,
            entry.notes,
          ]
        );
      } catch (e: any) {
        // Ignore unique constraint violations (already migrated)
        if (!e.message?.includes("UNIQUE constraint")) {
          console.error(`Failed to migrate entry ${entry.id}:`, e.message);
        }
      }
    }

    console.log("Worker assignment migration complete.");
  }
}

// Run migration
migrateWorkerAssignments();

export { db };
export * from "./schema";
