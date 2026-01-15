#!/usr/bin/env python3
"""
Create orders.csv with orders for Tenjam Blue and Tenjam White.
Based on production dates in the Excel file.
"""
import pandas as pd

OUTPUT_FILE = "apps/server/sample-data/tenjam/tenjam-orders.csv"

# Orders: 1 Blue + 1 White, both due Friday Jan 16
ORDERS = [
    {"product_name": "Tenjam Blue", "quantity": 400, "due_date": "2026-01-16", "status": "in_progress"},
    {"product_name": "Tenjam White", "quantity": 400, "due_date": "2026-01-16", "status": "in_progress"},
]

def main():
    output_df = pd.DataFrame(ORDERS)
    output_df.to_csv(OUTPUT_FILE, index=False)
    print(f"Written {len(ORDERS)} orders to {OUTPUT_FILE}")
    print(output_df.to_string())

if __name__ == "__main__":
    main()
