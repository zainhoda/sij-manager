/**
 * Export routes for CSV exports that match import formats
 */
import {
  generateEquipmentMatrixCSV,
  generateProductsCSV,
  generateOrdersCSV,
  generateProductionHistoryCSV,
} from "../services/export-generators";

/**
 * Create a CSV download response
 */
function csvResponse(content: string, filename: string): Response {
  return new Response(content, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * Handle export routes
 */
export async function handleExports(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/exports/equipment-matrix - Export equipment, workers, certifications
  if (url.pathname === "/api/exports/equipment-matrix" && request.method === "GET") {
    try {
      const csv = await generateEquipmentMatrixCSV();
      const timestamp = new Date().toISOString().split("T")[0];
      return csvResponse(csv, `equipment-matrix-${timestamp}.csv`);
    } catch (error) {
      console.error("Error generating equipment matrix export:", error);
      return Response.json(
        { error: "Failed to generate equipment matrix export" },
        { status: 500 }
      );
    }
  }

  // GET /api/exports/products - Export products with versions and steps
  if (url.pathname === "/api/exports/products" && request.method === "GET") {
    try {
      const csv = await generateProductsCSV();
      const timestamp = new Date().toISOString().split("T")[0];
      return csvResponse(csv, `products-${timestamp}.csv`);
    } catch (error) {
      console.error("Error generating products export:", error);
      return Response.json(
        { error: "Failed to generate products export" },
        { status: 500 }
      );
    }
  }

  // GET /api/exports/orders - Export orders
  if (url.pathname === "/api/exports/orders" && request.method === "GET") {
    try {
      const csv = await generateOrdersCSV();
      const timestamp = new Date().toISOString().split("T")[0];
      return csvResponse(csv, `orders-${timestamp}.csv`);
    } catch (error) {
      console.error("Error generating orders export:", error);
      return Response.json(
        { error: "Failed to generate orders export" },
        { status: 500 }
      );
    }
  }

  // GET /api/exports/production-history - Export production history
  if (url.pathname === "/api/exports/production-history" && request.method === "GET") {
    try {
      const csv = await generateProductionHistoryCSV();
      const timestamp = new Date().toISOString().split("T")[0];
      return csvResponse(csv, `production-history-${timestamp}.csv`);
    } catch (error) {
      console.error("Error generating production history export:", error);
      return Response.json(
        { error: "Failed to generate production history export" },
        { status: 500 }
      );
    }
  }

  return null;
}
