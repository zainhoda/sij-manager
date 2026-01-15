/**
 * Database seeding using the same import functions as the API endpoints
 * This ensures the import pipeline is verified during startup
 */
import type { Client } from "@libsql/client";
import { initDatabase, ensureSchema } from "./schema";

// Import parsers
import {
  parseEquipmentMatrix,
  parseProducts,
  parseOrders,
  parseProductionDataV2,
} from "../services/import-parsers";

// Import validators
import {
  validateEquipmentMatrix,
  validateProducts,
  validateOrders,
  validateProductionDataV2,
} from "../services/import-validators";

// Import execute functions (these use the db directly)
import {
  getExistingData,
  getOrdersExistingData,
  getProductionDataV2ExistingData,
  executeEquipmentMatrixImport,
  executeProductsImport,
  executeOrdersImport,
  executeProductionDataV2Import,
  deriveProficiencies,
} from "../routes/imports";

// Sample data file paths
const SAMPLE_DATA_DIR = import.meta.dir + "/../sample-data";

export async function seedDatabase(db: Client) {
  // Check if already seeded by looking for any products
  const existingProducts = await db.execute("SELECT id FROM products LIMIT 1");
  if (existingProducts.rows.length > 0) {
    console.log("Database already seeded");
    return;
  }

  console.log("Seeding database from sample CSV files...");

  try {
    // 1. Import Worker-Equipment Matrix
    console.log("\n[1/4] Importing Worker-Equipment Matrix...");
    const workerEquipmentCsv = await Bun.file(`${SAMPLE_DATA_DIR}/sample-worker-equipment.csv`).text();
    const equipmentParsed = parseEquipmentMatrix(workerEquipmentCsv, 'csv');
    const equipmentExisting = await getExistingData();
    const equipmentValidation = validateEquipmentMatrix(equipmentParsed, equipmentExisting);

    if (!equipmentValidation.valid) {
      console.error("Worker-Equipment validation failed:", equipmentValidation.errors);
      throw new Error("Worker-Equipment import validation failed");
    }

    const equipmentResult = await executeEquipmentMatrixImport(equipmentParsed);
    console.log(`  Created ${equipmentResult.workCategoriesCreated} work categories`);
    console.log(`  Created ${equipmentResult.equipmentCreated} equipment`);
    console.log(`  Created ${equipmentResult.workersCreated} workers`);
    console.log(`  Created ${equipmentResult.certificationsCreated} certifications`);

    // 2. Import Products
    console.log("\n[2/4] Importing Products...");
    const productsCsv = await Bun.file(`${SAMPLE_DATA_DIR}/sample-products.csv`).text();
    const productsParsed = parseProducts(productsCsv, 'csv');
    const productsExisting = await getExistingData();
    const productsValidation = validateProducts(productsParsed, productsExisting);

    if (!productsValidation.valid) {
      console.error("Products validation failed:", productsValidation.errors);
      throw new Error("Products import validation failed");
    }

    const productsResult = await executeProductsImport(productsParsed, productsValidation);
    console.log(`  Created ${productsResult.workCategoriesCreated} work categories`);
    console.log(`  Created ${productsResult.componentsCreated} components`);
    console.log(`  Created ${productsResult.productsCreated} products`);
    console.log(`  Created ${productsResult.versionsCreated} versions`);
    console.log(`  Created ${productsResult.stepsCreated} steps`);
    console.log(`  Created ${productsResult.dependenciesCreated} dependencies`);

    // 3. Import Orders
    console.log("\n[3/4] Importing Orders...");
    const ordersCsv = await Bun.file(`${SAMPLE_DATA_DIR}/sample-orders.csv`).text();
    const ordersParsed = parseOrders(ordersCsv, 'csv');
    const ordersExisting = await getOrdersExistingData();
    const ordersValidation = validateOrders(ordersParsed, ordersExisting);

    if (!ordersValidation.valid) {
      console.error("Orders validation failed:", ordersValidation.errors);
      throw new Error("Orders import validation failed");
    }

    const ordersResult = await executeOrdersImport(ordersValidation);
    console.log(`  Created ${ordersResult.ordersCreated} orders`);

    // 4. Import Production History
    console.log("\n[4/4] Importing Production History...");
    const productionCsv = await Bun.file(`${SAMPLE_DATA_DIR}/sample-production-history.csv`).text();
    const productionParsed = parseProductionDataV2(productionCsv, 'csv');
    const productionExisting = await getProductionDataV2ExistingData();
    const productionValidation = validateProductionDataV2(productionParsed, productionExisting);

    if (!productionValidation.valid) {
      console.error("Production History validation failed:", productionValidation.errors);
      throw new Error("Production History import validation failed");
    }

    const productionResult = await executeProductionDataV2Import(productionValidation);
    console.log(`  Created ${productionResult.schedulesCreated} schedules`);
    console.log(`  Created ${productionResult.entriesCreated} schedule entries`);
    console.log(`  Created ${productionResult.assignmentsCreated} task assignments`);

    // Derive proficiencies
    console.log("\nDeriving worker proficiencies...");
    const proficiencyResult = await deriveProficiencies();
    console.log(`  Created ${proficiencyResult.proficienciesCreated} proficiencies`);
    console.log(`  Updated ${proficiencyResult.proficienciesUpdated} proficiencies`);

    console.log("\nDatabase seeding complete!");

  } catch (error) {
    console.error("Seeding failed:", error);
    throw error;
  }
}

// Run if called directly
if (import.meta.main) {
  const db = initDatabase();
  await ensureSchema(db);
  await seedDatabase(db);
  db.close();
}
