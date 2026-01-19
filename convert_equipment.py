#!/usr/bin/env python3
"""
Convert Equipment Matrix from Excel to worker-equipment.csv format.
"""
import pandas as pd

EXCEL_FILE = "Tenjam White 01172026.xlsx"
OUTPUT_FILE = "apps/server/sample-data/tenjam/tenjam-worker-equipment.csv"

# Worker name mappings (clean up temp prefixes)
WORKER_NAME_CLEAN = {
    "Temp - Noe": "Noe",
    "Temp - Fransisco": "Fransisco",
}

def main():
    # Read Equipment Matrix sheet
    df = pd.read_excel(EXCEL_FILE, sheet_name="Equip Matrix", header=None)

    # Get header row (row 0)
    header_row = df.iloc[0].tolist()

    # Extract worker names from header (columns 3-15)
    worker_cols = header_row[3:16]

    # Clean worker names
    workers = []
    for name in worker_cols:
        if pd.isna(name):
            continue
        clean_name = WORKER_NAME_CLEAN.get(name, name)
        workers.append(clean_name)

    print(f"Workers found: {workers}")

    # Process equipment rows (rows 1-29, skip header and footer notes)
    equipment_rows = []
    for idx in range(1, 30):
        row = df.iloc[idx].tolist()
        station_count = row[0]
        equipment_code = row[1]
        work_type_full = row[2]

        # Skip empty rows
        if pd.isna(equipment_code) or equipment_code == "":
            continue

        # Parse work category from work_type (e.g., "Cutting - Team Lead" -> category: "Cutting", type: full string)
        # Keep the full description as work_type
        if pd.isna(work_type_full):
            work_category = ""
            work_type = ""
        elif " - " in str(work_type_full):
            parts = str(work_type_full).split(" - ", 1)
            work_category = parts[0].strip()
            work_type = str(work_type_full)  # Keep full description
        else:
            work_category = str(work_type_full)
            work_type = str(work_type_full)  # Keep full description

        # Get worker certifications (columns 3-15)
        certifications = []
        for i, worker in enumerate(workers):
            col_idx = 3 + i
            val = row[col_idx] if col_idx < len(row) else None
            if pd.notna(val) and str(val).upper() in ["Y", "YES", "1", "TRUE", "X"]:
                certifications.append("Y")
            else:
                certifications.append("")

        equipment_rows.append({
            "equipment_code": equipment_code,
            "work_category": work_category,
            "work_type": work_type,
            "station_count": int(station_count) if pd.notna(station_count) else 0,
            "hourly_cost": 0,  # No cost data in source
            **{worker: cert for worker, cert in zip(workers, certifications)}
        })

    # Create _COST row (no actual cost data, use 0 for all)
    cost_row = {
        "equipment_code": "_COST",
        "work_category": "",
        "work_type": "Worker Cost Per Hour",
        "station_count": 0,
        "hourly_cost": 0,
        **{worker: 0 for worker in workers}
    }

    # Build output dataframe
    columns = ["equipment_code", "work_category", "work_type", "station_count", "hourly_cost"] + workers
    output_df = pd.DataFrame([cost_row] + equipment_rows, columns=columns)

    # Write to CSV
    output_df.to_csv(OUTPUT_FILE, index=False)
    print(f"Written {len(equipment_rows)} equipment rows + _COST row to {OUTPUT_FILE}")
    print(output_df.to_string())

if __name__ == "__main__":
    main()
