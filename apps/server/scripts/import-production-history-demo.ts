/**
 * Demo import script for production-history-2026-01-23.csv
 * Imports production history data with placeholder foreign keys for dashboard demo
 */

import { Database } from "bun:sqlite";

const WORKER_NAME_MAP: Record<string, string> = {
  Cindy: "Cyndi",
  Fransico: "Fransisco",
  Maricela: "Maricella",
};

// Product number corrections (typos in CSV)
const PRODUCT_NUMBER_MAP: Record<string, string> = {
  "TT_AR_002_BLK": "TT_AR_0002_BLK",
  "TT_CC_002_GRY": "TT_CC_0002_GRY",
};

// Invalid step numbers to skip (steps that don't exist in Fishbowl)
const INVALID_STEPS: Record<string, Set<number>> = {
  "SPL3300PLWNB": new Set([29, 30, 31]),
  "TT_CC_0001_GRY": new Set([500, 501, 502, 503]),
};

function normalizeProductNumber(productNum: string): string {
  return PRODUCT_NUMBER_MAP[productNum] || productNum;
}

function isInvalidStep(productNum: string, stepNumber: number): boolean {
  const invalidSet = INVALID_STEPS[productNum];
  return invalidSet ? invalidSet.has(stepNumber) : false;
}

function normalizeWorkerName(name: string): string {
  return WORKER_NAME_MAP[name] || name;
}

function parseDate(dateStr: string): string {
  // Convert M/D/YY to YYYY-MM-DD
  const [month, day, year] = dateStr.split("/");
  const fullYear = 2000 + parseInt(year, 10);
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseTime(timeStr: string): number {
  // Convert "8:30 AM" to seconds since midnight
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours !== 12) {
    hours += 12;
  } else if (period === "AM" && hours === 12) {
    hours = 0;
  }

  return hours * 3600 + minutes * 60;
}

function calculateActualSeconds(startTime: string, endTime: string): number {
  const startSeconds = parseTime(startTime);
  const endSeconds = parseTime(endTime);

  // Handle overnight shifts (end time < start time)
  if (endSeconds < startSeconds) {
    return 24 * 3600 - startSeconds + endSeconds;
  }

  return endSeconds - startSeconds;
}

async function main() {
  const csvPath = "production-history-2026-01-23.csv";
  const dbPath = "apps/server/sij.db";

  console.log(`Reading CSV from ${csvPath}...`);
  const csvContent = await Bun.file(csvPath).text();
  const lines = csvContent.split("\n");

  // Skip header
  const dataLines = lines.slice(1).filter((line) => {
    const trimmed = line.trim();
    // Skip empty lines or lines with only commas
    if (!trimmed || trimmed === ",,,,,,,") return false;
    const parts = trimmed.split(",");
    // Skip if essential fields are empty
    return parts[0] && parts[3] && parts[4] && parts[5] && parts[6] && parts[7];
  });

  console.log(`Found ${dataLines.length} valid data rows`);

  // Open database
  const db = new Database(dbPath);

  // Build worker lookup
  const workers = db.query("SELECT id, name FROM workers").all() as {
    id: number;
    name: string;
  }[];
  const workerMap = new Map<string, number>();
  for (const w of workers) {
    workerMap.set(w.name, w.id);
  }
  console.log(`Loaded ${workers.length} workers from database`);

  // Build BOM lookup from fishbowl_bom_cache
  const boms = db.query("SELECT id, num FROM fishbowl_bom_cache").all() as {
    id: number;
    num: string;
  }[];
  const bomMap = new Map<string, number>();
  for (const b of boms) {
    bomMap.set(b.num, b.id);
  }
  console.log(`Loaded ${boms.length} BOMs from cache`);

  // Build BOM step lookup (fishbowl_bom_id, sequence) -> step_id
  const steps = db.query("SELECT id, fishbowl_bom_id, sequence, name FROM bom_steps").all() as {
    id: number;
    fishbowl_bom_id: number;
    sequence: number;
    name: string;
  }[];
  const stepMap = new Map<string, { id: number; name: string }>();
  for (const s of steps) {
    stepMap.set(`${s.fishbowl_bom_id}:${s.sequence}`, { id: s.id, name: s.name });
  }
  console.log(`Loaded ${steps.length} BOM steps from database`);

  // Disable foreign keys for this import
  db.exec("PRAGMA foreign_keys = OFF");

  // Placeholder: 60 seconds expected per unit
  const EXPECTED_SECONDS_PER_UNIT = 60;

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO production_history (
      fishbowl_bom_id,
      fishbowl_bom_num,
      bom_step_id,
      step_name,
      worker_id,
      worker_name,
      date,
      start_time,
      end_time,
      units_produced,
      actual_seconds,
      expected_seconds,
      efficiency_percent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const line of dataLines) {
    const parts = line.split(",");
    const [
      bomNum,
      productNum,
      stepNumber,
      workerName,
      workDate,
      startTime,
      endTime,
      unitsProduced,
    ] = parts;

    // Normalize product number (fix typos)
    const normalizedProductNum = normalizeProductNumber(productNum.trim());
    const stepNum = parseInt(stepNumber.trim(), 10);

    // Skip invalid steps
    if (isInvalidStep(normalizedProductNum, stepNum)) {
      errors.push(`Skipping invalid step ${stepNum} for ${normalizedProductNum}`);
      skipped++;
      continue;
    }

    const normalizedWorkerName = normalizeWorkerName(workerName.trim());
    const workerId = workerMap.get(normalizedWorkerName);

    if (!workerId) {
      errors.push(`Worker not found: "${workerName}" (normalized: "${normalizedWorkerName}")`);
      skipped++;
      continue;
    }

    // Look up BOM ID
    const fishbowlBomId = bomMap.get(normalizedProductNum);
    if (!fishbowlBomId) {
      errors.push(`BOM not found in cache: "${normalizedProductNum}"`);
      skipped++;
      continue;
    }

    // Look up BOM step
    const stepKey = `${fishbowlBomId}:${stepNum}`;
    const stepInfo = stepMap.get(stepKey);
    if (!stepInfo) {
      errors.push(`BOM step not found: BOM ${fishbowlBomId} step ${stepNum} (${normalizedProductNum})`);
      skipped++;
      continue;
    }

    try {
      const date = parseDate(workDate.trim());
      const actualSeconds = calculateActualSeconds(
        startTime.trim(),
        endTime.trim()
      );
      const units = parseInt(unitsProduced.trim(), 10);
      const expectedSeconds = units * EXPECTED_SECONDS_PER_UNIT;
      const efficiencyPercent = expectedSeconds > 0
        ? Math.round((expectedSeconds / actualSeconds) * 100)
        : null;

      insertStmt.run(
        fishbowlBomId,
        normalizedProductNum,
        stepInfo.id,
        stepInfo.name,
        workerId,
        normalizedWorkerName,
        date,
        startTime.trim(),
        endTime.trim(),
        units,
        actualSeconds,
        expectedSeconds,
        efficiencyPercent
      );

      imported++;
    } catch (err) {
      errors.push(`Error on line: ${line.substring(0, 50)}... - ${err}`);
      skipped++;
    }
  }

  // Re-enable foreign keys
  db.exec("PRAGMA foreign_keys = ON");
  db.close();

  console.log(`\nImport complete:`);
  console.log(`  Imported: ${imported} rows`);
  console.log(`  Skipped: ${skipped} rows`);

  if (errors.length > 0) {
    console.log(`\nErrors (first 10):`);
    for (const err of errors.slice(0, 10)) {
      console.log(`  - ${err}`);
    }
  }

  // Verification queries
  const verifyDb = new Database(dbPath);
  const count = verifyDb.query("SELECT COUNT(*) as count FROM production_history").get() as { count: number };
  console.log(`\nVerification:`);
  console.log(`  Total rows in production_history: ${count.count}`);

  const byDate = verifyDb
    .query(
      "SELECT date, SUM(units_produced) as total FROM production_history GROUP BY date ORDER BY date"
    )
    .all() as { date: string; total: number }[];
  console.log(`\n  Units by date:`);
  for (const row of byDate) {
    console.log(`    ${row.date}: ${row.total} units`);
  }

  verifyDb.close();
}

main().catch(console.error);
