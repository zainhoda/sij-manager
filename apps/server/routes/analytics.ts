import {
  getWorkerProductivity,
  getWorkerProductivityHistory,
  getWorkerProficiencyHistory,
  calculateAutoAdjustments,
  applyProficiencyAdjustment,
} from "../services/analytics";

export async function handleAnalytics(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/analytics/workers/:id/productivity - Get worker productivity summary
  const productivityMatch = url.pathname.match(/^\/api\/analytics\/workers\/(\d+)\/productivity$/);
  if (productivityMatch && request.method === "GET") {
    const workerId = parseInt(productivityMatch[1]!);
    const productivity = getWorkerProductivity(workerId);

    if (!productivity) {
      return Response.json({ error: "Worker not found" }, { status: 404 });
    }

    return Response.json(productivity);
  }

  // GET /api/analytics/workers/:id/productivity/history - Get productivity trend data
  const historyMatch = url.pathname.match(/^\/api\/analytics\/workers\/(\d+)\/productivity\/history$/);
  if (historyMatch && request.method === "GET") {
    const workerId = parseInt(historyMatch[1]!);
    const daysParam = url.searchParams.get("days");
    const days = daysParam ? parseInt(daysParam) : 30;

    const history = getWorkerProductivityHistory(workerId, days);
    return Response.json(history);
  }

  // GET /api/analytics/workers/:id/proficiency-history - Get proficiency change log
  const profHistoryMatch = url.pathname.match(/^\/api\/analytics\/workers\/(\d+)\/proficiency-history$/);
  if (profHistoryMatch && request.method === "GET") {
    const workerId = parseInt(profHistoryMatch[1]!);
    const history = getWorkerProficiencyHistory(workerId);
    return Response.json(history);
  }

  // GET /api/analytics/pending-adjustments - Get pending proficiency adjustments
  if (url.pathname === "/api/analytics/pending-adjustments" && request.method === "GET") {
    const adjustments = calculateAutoAdjustments();
    return Response.json(adjustments);
  }

  // POST /api/analytics/recalculate-proficiencies - Trigger auto-adjustment batch
  if (url.pathname === "/api/analytics/recalculate-proficiencies" && request.method === "POST") {
    const adjustments = calculateAutoAdjustments();

    // Apply all adjustments
    for (const adjustment of adjustments) {
      applyProficiencyAdjustment(adjustment);
    }

    return Response.json({
      applied: adjustments.length,
      adjustments,
    });
  }

  return null;
}
