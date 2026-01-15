#!/usr/bin/env python3
"""
Script to import all Tenjam data into the database via API endpoints.
Run this after starting the server with a fresh database.
"""
import requests
import json
import sys
import time

BASE_URL = "http://localhost:3000"

def wait_for_server():
    """Wait for server to be ready."""
    print("Waiting for server...")
    for _ in range(30):
        try:
            r = requests.get(f"{BASE_URL}/api/health", timeout=2)
            if r.status_code == 200:
                print("Server is ready!")
                return True
        except:
            pass
        time.sleep(0.5)
    print("Server not responding!")
    return False

def import_csv(endpoint_name: str, csv_path: str) -> bool:
    """Import a CSV file via preview + confirm endpoints."""
    print(f"\n{'='*60}")
    print(f"Importing: {endpoint_name}")
    print(f"File: {csv_path}")
    print('='*60)

    # Read CSV content
    with open(csv_path, 'r') as f:
        content = f.read()

    # Preview
    preview_url = f"{BASE_URL}/api/imports/{endpoint_name}/preview"
    print(f"POST {preview_url}")

    response = requests.post(preview_url, json={
        "content": content,
        "format": "csv"
    })

    if response.status_code != 200:
        print(f"ERROR: Preview failed with status {response.status_code}")
        print(response.text[:500])
        return False

    data = response.json()

    # Check for errors
    errors = data.get("errors", [])
    warnings = data.get("warnings", [])

    if errors:
        print(f"ERRORS ({len(errors)}):")
        for err in errors[:5]:
            print(f"  - {err.get('message', err)}")
        if len(errors) > 5:
            print(f"  ... and {len(errors) - 5} more")
        return False

    if warnings:
        print(f"Warnings ({len(warnings)}):")
        for warn in warnings[:3]:
            print(f"  - {warn.get('message', warn)}")

    # Show summary
    preview = data.get("preview", {})
    summary = preview.get("summary", {})
    if summary:
        print(f"Summary: {json.dumps(summary, indent=2)}")

    # Confirm import
    token = data.get("importToken")
    if not token:
        print("ERROR: No import token received")
        return False

    confirm_url = f"{BASE_URL}/api/imports/{endpoint_name}/confirm"
    print(f"POST {confirm_url}")

    response = requests.post(confirm_url, json={"importToken": token})

    if response.status_code != 200:
        print(f"ERROR: Confirm failed with status {response.status_code}")
        print(response.text[:500])
        return False

    result = response.json()
    print(f"SUCCESS: {json.dumps(result, indent=2)}")
    return True

def main():
    data_dir = "apps/server/sample-data/tenjam"

    # Check server
    if not wait_for_server():
        sys.exit(1)

    # Import in order (dependencies matter!)
    imports = [
        ("equipment-matrix", f"{data_dir}/tenjam-worker-equipment.csv"),
        ("products", f"{data_dir}/tenjam-products.csv"),
        ("orders", f"{data_dir}/tenjam-orders.csv"),
        ("production-history", f"{data_dir}/tenjam-production-history.csv"),
    ]

    success_count = 0
    for endpoint, csv_path in imports:
        if import_csv(endpoint, csv_path):
            success_count += 1
        else:
            print(f"\nFailed at {endpoint}, stopping.")
            break

    print(f"\n{'='*60}")
    print(f"Completed: {success_count}/{len(imports)} imports successful")
    print('='*60)

    return success_count == len(imports)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
