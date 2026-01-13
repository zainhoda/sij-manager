import { handleProducts } from "./routes/products";
import { handleOrders } from "./routes/orders";
import { handleSchedules } from "./routes/schedules";
import { handleScheduleEntries } from "./routes/schedule-entries";
import { handleEquipment } from "./routes/equipment";
import { handleWorkers } from "./routes/workers";
import { handleCertifications } from "./routes/certifications";
import { handleProficiencies } from "./routes/proficiencies";
import { handleAnalytics } from "./routes/analytics";
import { handleScheduling } from "./routes/scheduling";

// Initialize database (this also seeds it)
import "./db";

// CORS headers for development
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const server = Bun.serve({
  port: process.env.PORT || 3000,
  async fetch(request) {
    try {
      const url = new URL(request.url);

      // Handle preflight requests
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Health check
      if (url.pathname === "/") {
        return new Response("SIJ Manager API", {
          headers: { "Content-Type": "text/plain", ...corsHeaders },
        });
      }

      if (url.pathname === "/api/health") {
        return Response.json(
          { status: "ok", timestamp: new Date().toISOString() },
          { headers: corsHeaders }
        );
      }

      // Route handlers
      let response: Response | null = null;

      response = await handleProducts(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleOrders(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleSchedules(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleScheduleEntries(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleEquipment(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleWorkers(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleCertifications(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleProficiencies(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleAnalytics(request);
      if (response) {
        return addCorsHeaders(response);
      }

      response = await handleScheduling(request);
      if (response) {
        return addCorsHeaders(response);
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error("Server error:", error);
      return Response.json(
        { error: "Internal server error" },
        { status: 500, headers: corsHeaders }
      );
    }
  },
});

console.log(`SIJ Manager API running at http://localhost:${server.port}`);
