#!/usr/bin/env python3
"""
Convert Production Data from Excel to production-history.csv format.
"""
import pandas as pd

EXCEL_FILE = "Tenjam White 01142026.xlsx"
OUTPUT_FILE = "apps/server/sample-data/tenjam/tenjam-production-history.csv"

# Worker name fixes (Production Data typos -> Equipment Matrix canonical)
WORKER_NAME_FIXES = {
    "Cindy": "Cyndi",
    "Maricela": "Maricella",
    "Fransico": "Fransisco",  # Production has typo "Fransico", Equipment Matrix has "Fransisco"
}

# Product name normalization
PRODUCT_NAME_MAP = {
    "Tenjam - Blue": "Tenjam Blue",
    "Tenjam - White": "Tenjam White",
}

def format_time(time_val):
    """Format time value to HH:MM format."""
    if pd.isna(time_val):
        return ""
    if isinstance(time_val, str):
        # Already a string, just take HH:MM part
        return time_val[:5] if len(time_val) >= 5 else time_val
    # Assume it's a datetime.time or similar
    return str(time_val)[:5]

def main():
    # Read Production Data sheet
    df = pd.read_excel(EXCEL_FILE, sheet_name="Production Data", header=0)

    # Filter out "00-Prod Dev" (baseline/reference data)
    df = df[df["Name"] != "00-Prod Dev"]

    # Also filter out "Tenjam" (dev baseline product)
    df = df[df["Product"] != "Tenjam"]

    print(f"Processing {len(df)} production records...")

    history_rows = []
    for _, row in df.iterrows():
        product = row["Product"]
        work_date = row["Date"]
        worker_name = row["Name"]
        step_code = row["Task ID"]
        start_time = row["Start Time"]
        end_time = row["Finish Time"]
        units_produced = row["Completed Units"]

        # Skip rows without essential data
        if pd.isna(step_code) or pd.isna(worker_name):
            continue

        # Normalize product name
        product_name = PRODUCT_NAME_MAP.get(product, product)

        # Fix worker name typos
        worker_name = WORKER_NAME_FIXES.get(worker_name, worker_name)

        # Format date as YYYY-MM-DD
        if pd.notna(work_date):
            work_date_str = pd.to_datetime(work_date).strftime("%Y-%m-%d")
        else:
            continue

        # Both orders are due 2026-01-16
        due_date = "2026-01-16"

        history_rows.append({
            "product_name": product_name,
            "due_date": due_date,
            "version_name": "v1.0",
            "step_code": step_code,
            "worker_name": worker_name,
            "work_date": work_date_str,
            "start_time": format_time(start_time),
            "end_time": format_time(end_time),
            "units_produced": int(units_produced) if pd.notna(units_produced) else 0,
        })

    # Create dataframe
    columns = [
        "product_name", "due_date", "version_name", "step_code",
        "worker_name", "work_date", "start_time", "end_time", "units_produced"
    ]
    output_df = pd.DataFrame(history_rows, columns=columns)

    # Write to CSV
    output_df.to_csv(OUTPUT_FILE, index=False)
    print(f"Written {len(history_rows)} production history rows to {OUTPUT_FILE}")
    print("\nSample rows:")
    print(output_df.head(15).to_string())
    print("\nUnique workers:", output_df["worker_name"].unique().tolist())
    print("Unique products:", output_df["product_name"].unique().tolist())

if __name__ == "__main__":
    main()
