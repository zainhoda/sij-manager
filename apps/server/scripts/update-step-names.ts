/**
 * Update BOM step names from Fishbowl work instructions
 */

import { Database } from "bun:sqlite";

const BOM_IDS = [2746, 2748, 2749, 2750, 2752, 2753, 2754, 2757, 2758, 2761];

async function main() {
  const dbPath = "apps/server/sij.db";
  const db = new Database(dbPath);

  let updated = 0;

  for (const bomId of BOM_IDS) {
    console.log(`Fetching instructions for BOM ${bomId}...`);

    const response = await fetch(`http://localhost:3000/api/fishbowl/boms/${bomId}/instructions`);
    const data = await response.json() as { instructions: Array<{ sortOrder: number; description: string }> };

    if (!data.instructions || data.instructions.length === 0) {
      console.log(`  No instructions found for BOM ${bomId}`);
      continue;
    }

    console.log(`  Found ${data.instructions.length} instructions`);

    for (const instruction of data.instructions) {
      const result = db.run(
        `UPDATE bom_steps SET name = ? WHERE fishbowl_bom_id = ? AND sequence = ?`,
        [instruction.description, bomId, instruction.sortOrder]
      );

      if (result.changes > 0) {
        updated++;
      }
    }
  }

  console.log(`\nUpdated ${updated} step names`);

  // Also update production_history step_name to match
  console.log("\nUpdating production_history step names...");
  const historyResult = db.run(`
    UPDATE production_history
    SET step_name = (
      SELECT bs.name FROM bom_steps bs
      WHERE bs.id = production_history.bom_step_id
    )
    WHERE EXISTS (
      SELECT 1 FROM bom_steps bs WHERE bs.id = production_history.bom_step_id
    )
  `);
  console.log(`Updated ${historyResult.changes} production_history rows`);

  // Verify
  console.log("\nSample updated steps:");
  const samples = db.query(`
    SELECT fishbowl_bom_num, sequence, name
    FROM bom_steps
    WHERE fishbowl_bom_id = 2746
    ORDER BY sequence
    LIMIT 10
  `).all();

  for (const s of samples as any[]) {
    console.log(`  ${s.fishbowl_bom_num} #${s.sequence}: ${s.name}`);
  }

  db.close();
}

main().catch(console.error);
