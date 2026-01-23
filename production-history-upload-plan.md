# Production History CSV Upload Plan

**CSV File:** `production-history-2026-01-23.csv`
**Total Records:** 312 (excluding header and empty rows)
**Date Range:** 2026-01-12 to 2026-01-22

---

## 1. BOMs in Fishbowl

| Product Number | BOM ID | Steps | Status |
|----------------|--------|-------|--------|
| SPL3300PLWNB | 2746 | 1-28 | ✓ Exists |
| TT_AR_0001_BLK | 2749 | 1-12 | ✓ Exists |
| TT_CC_0001_BLK | 2750 | 1-30 | ✓ Exists |
| TT_HR_0001_BLK | 2748 | 1-12 | ✓ Exists |
| TT_AR_0001_GRY | 2754 | 1-12 | ✓ Exists |
| TT_CC_0001_GRY | 2753 | 1-30 | ✓ Exists |
| TT_HR_0001_GRY | 2752 | 1-12 | ✓ Exists |
| TT_CC_0002_BLK | 2757 | 1-32 | ✓ Exists |
| W0624009-IW-GRY | 2762 | 1-4 | ✓ Exists |
| **TT_AR_002_BLK** | — | — | ❌ Missing from Fishbowl |
| **TT_CC_002_GRY** | — | — | ❌ Missing from Fishbowl |

---

## 2. Invalid Step Numbers in CSV

These rows reference step numbers that don't exist in Fishbowl's work instructions:

### SPL3300PLWNB (valid steps: 1-28)

| CSV Line | Step | Worker | Date |
|----------|------|--------|------|
| 93 | 29 | Pilar | 1/16/26 |
| 95 | 29 | Pilar | 1/16/26 |
| 118 | 29 | Patty | 1/16/26 |
| 120 | 29 | Patty | 1/16/26 |
| 164 | 29 | Pilar | 1/17/26 |
| 166 | 29 | Pilar | 1/17/26 |
| 168 | 29 | Pilar | 1/17/26 |
| 171 | 30 | Julieta | 1/17/26 |
| 172 | 31 | Julieta | 1/17/26 |
| 173 | 30 | Julieta | 1/17/26 |
| 174 | 31 | Julieta | 1/17/26 |

### TT_CC_0001_GRY (valid steps: 1-30)

| CSV Line | Step | Worker | Date |
|----------|------|--------|------|
| 283 | 501 | Pilar | 1/22/26 |
| 284 | 502 | Pilar | 1/22/26 |
| 285 | 502 | Pilar | 1/22/26 |
| 286 | 502 | Pilar | 1/22/26 |
| 287 | 501 | Pilar | 1/22/26 |
| 288 | 503 | Pilar | 1/22/26 |
| 289 | 500 | Pilar | 1/22/26 |

**Questions for client:**
- What are steps 29, 30, 31 for SPL3300PLWNB? Should these be added to Fishbowl?
- What are steps 500-503 for TT_CC_0001_GRY? Are these custom/special step codes?

---

## 3. Worker Name Mismatches

| CSV Name | Database Name | Affected Rows |
|----------|---------------|---------------|
| Cindy | Cyndi | Multiple |
| Fransico | Fransisco | Lines 8, 47, 97-102, 169-170 |
| Maricela | Maricella | Multiple |

**Options:**
1. Update the CSV to match database spellings
2. Update the database to match CSV spellings
3. Add name aliases to the import logic

---

## 4. Column Mapping

| CSV Column | Database Column | Transformation |
|------------|-----------------|----------------|
| `bom_num` | — | Work order reference (not used directly) |
| `Product Number` | `fishbowl_bom_num` | Lookup `fishbowl_bom_id` from Fishbowl |
| `step_number` | `bom_step_id` | Lookup from `bom_steps` table |
| — | `step_name` | Lookup from `bom_steps` table |
| `worker_name` | `worker_id`, `worker_name` | Lookup ID, store name |
| `work_date` | `date` | Convert `M/D/YY` → `YYYY-MM-DD` |
| `start_time` | `start_time` | Convert `H:MM AM/PM` → `HH:MM:SS` |
| `end_time` | `end_time` | Convert `H:MM AM/PM` → `HH:MM:SS` |
| `units_produced` | `units_produced` | Direct copy |
| — | `actual_seconds` | Calculate from `end_time - start_time` |

---

## 5. Steps to Make CSV Uploadable

### A. Immediate Fixes (Client Action Required)

- [ ] Clarify what steps 29, 30, 31 are for SPL3300PLWNB
- [ ] Clarify what steps 500-503 are for TT_CC_0001_GRY
- [ ] Confirm if TT_AR_002_BLK and TT_CC_002_GRY should be created in Fishbowl
- [ ] Fix worker name spellings OR confirm database should be updated

### B. System Setup Required

- [ ] Sync 9 BOMs from Fishbowl to local cache (`fishbowl_bom_cache`)
- [ ] Create BOM steps in local DB from Fishbowl work instructions (`bom_steps`)
- [ ] Add any missing steps (29-31 for SPL3300PLWNB, etc.) if confirmed

### C. Import Logic Required

The importer needs to:

1. **Parse CSV** and skip empty rows (lines 313+)
2. **Validate product numbers** exist in `fishbowl_bom_cache`
3. **Look up `fishbowl_bom_id`** from `Product Number`
4. **Look up `bom_step_id`** from `step_number` + BOM
5. **Look up `worker_id`** from `worker_name` (with name normalization)
6. **Convert date** from `M/D/YY` to `YYYY-MM-DD`
7. **Convert times** from `H:MM AM/PM` to 24-hour format
8. **Calculate `actual_seconds`** from start/end times
9. **Insert into `production_history`** table

---

## 6. Database Schema Reference

```sql
CREATE TABLE production_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demand_entry_id INTEGER,              -- nullable
  fishbowl_bom_id INTEGER NOT NULL,     -- from BOM lookup
  fishbowl_bom_num TEXT NOT NULL,       -- Product Number
  bom_step_id INTEGER NOT NULL,         -- from step lookup
  step_name TEXT NOT NULL,              -- from step lookup
  worker_id INTEGER NOT NULL,           -- from worker lookup
  worker_name TEXT NOT NULL,            -- from CSV
  date TEXT NOT NULL,                   -- work_date converted
  start_time TEXT NOT NULL,             -- converted
  end_time TEXT NOT NULL,               -- converted
  units_produced INTEGER NOT NULL,      -- from CSV
  planned_units INTEGER,                -- nullable
  actual_seconds INTEGER NOT NULL,      -- calculated
  expected_seconds INTEGER,             -- nullable
  efficiency_percent REAL,              -- nullable
  labor_cost REAL,                      -- nullable
  equipment_cost REAL,                  -- nullable
  plan_task_id INTEGER,                 -- nullable
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Summary

| Category | Count | Status |
|----------|-------|--------|
| Total CSV rows | 312 | — |
| Valid BOMs | 9 | ✓ Ready to sync |
| Missing BOMs | 2 | ❌ Need client input |
| Invalid step rows | 18 | ❌ Need client input |
| Worker mismatches | 3 | ⚠️ Need decision |
| Empty rows to skip | 17 | ✓ Will filter |
