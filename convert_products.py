#!/usr/bin/env python3
"""
Convert Work Steps from Excel to products.csv format.
Creates entries for both Tenjam Blue and Tenjam White products.
"""
import pandas as pd

EXCEL_FILE = "Tenjam White 01142026.xlsx"
OUTPUT_FILE = "apps/server/sample-data/tenjam/tenjam-products.csv"

PRODUCTS = [
    {"name": "Tenjam Blue", "version_name": "v1.0", "version_number": 1, "is_default": "Y"},
    {"name": "Tenjam White", "version_name": "v1.0", "version_number": 1, "is_default": "Y"},
]

def transform_dependencies(deps, dep_type):
    """Transform dependencies to format expected by import system.

    Input: "CFA1, CTA1" with type "FINISH"
    Output: "CFA1:finish,CTA1:finish"
    """
    if pd.isna(deps) or deps == "":
        return ""

    dep_list = [d.strip() for d in str(deps).split(",")]
    type_suffix = f":{dep_type.lower()}" if pd.notna(dep_type) and dep_type else ""

    return ",".join(f"{d}{type_suffix}" for d in dep_list)

def main():
    # Read Work Steps sheet
    df = pd.read_excel(EXCEL_FILE, sheet_name="Work Steps", header=None)

    # Header is in row 0
    # Data starts from row 1

    product_rows = []

    for product in PRODUCTS:
        # Process each step (rows 1-31)
        for idx in range(1, 32):
            row = df.iloc[idx].tolist()

            dependency = row[0]
            dep_type = row[1]
            step_code = row[2]
            fb_task_id = row[3]  # External ID
            category = row[4]
            component = row[5]
            task_name = row[6]
            time_seconds = row[7]
            equipment_code = row[8]

            # Skip empty rows
            if pd.isna(step_code):
                continue

            # Transform dependencies
            dependencies = transform_dependencies(dependency, dep_type)

            product_rows.append({
                "product_name": product["name"],
                "version_name": product["version_name"],
                "version_number": product["version_number"],
                "is_default": product["is_default"],
                "step_code": step_code,
                "external_id": int(fb_task_id) if pd.notna(fb_task_id) else "",
                "category": category if pd.notna(category) else "",
                "component": component if pd.notna(component) else "",
                "task_name": task_name if pd.notna(task_name) else "",
                "time_seconds": int(time_seconds) if pd.notna(time_seconds) else 0,
                "equipment_code": equipment_code if pd.notna(equipment_code) else "",
                "dependencies": dependencies,
            })

    # Create dataframe
    columns = [
        "product_name", "version_name", "version_number", "is_default",
        "step_code", "external_id", "category", "component", "task_name",
        "time_seconds", "equipment_code", "dependencies"
    ]
    output_df = pd.DataFrame(product_rows, columns=columns)

    # Write to CSV
    output_df.to_csv(OUTPUT_FILE, index=False)
    print(f"Written {len(product_rows)} product step rows to {OUTPUT_FILE}")
    print(f"  - {len(product_rows) // 2} steps per product")
    print(f"  - Products: {[p['name'] for p in PRODUCTS]}")
    print("\nFirst 10 rows:")
    print(output_df.head(10).to_string())

if __name__ == "__main__":
    main()
