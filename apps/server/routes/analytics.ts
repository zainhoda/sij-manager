import {
  getWorkerProductivity,
  getWorkerProductivityHistory,
  getWorkerProficiencyHistory,
  calculateAutoAdjustments,
  applyProficiencyAdjustment,
  getAssignmentOutputHistory,
  getAssignmentTimeMetrics,
  getAssignmentAnalytics,
  getWorkerAssignmentAnalytics,
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

  // GET /api/analytics/assignments/:id/output-history - Get output history for an assignment
  const assignmentHistoryMatch = url.pathname.match(/^\/api\/analytics\/assignments\/(\d+)\/output-history$/);
  if (assignmentHistoryMatch && request.method === "GET") {
    const assignmentId = parseInt(assignmentHistoryMatch[1]!);
    const history = getAssignmentOutputHistory(assignmentId);
    return Response.json(history);
  }

  // GET /api/analytics/assignments/:id/metrics - Get time-per-piece metrics and speedup data
  const assignmentMetricsMatch = url.pathname.match(/^\/api\/analytics\/assignments\/(\d+)\/metrics$/);
  if (assignmentMetricsMatch && request.method === "GET") {
    const assignmentId = parseInt(assignmentMetricsMatch[1]!);
    const metrics = getAssignmentTimeMetrics(assignmentId);
    
    if (!metrics) {
      return Response.json({ error: "Assignment not found" }, { status: 404 });
    }
    
    return Response.json(metrics);
  }

  // GET /api/analytics/assignments/:id - Get full assignment analytics
  const assignmentAnalyticsMatch = url.pathname.match(/^\/api\/analytics\/assignments\/(\d+)$/);
  if (assignmentAnalyticsMatch && request.method === "GET") {
    const assignmentId = parseInt(assignmentAnalyticsMatch[1]!);
    const analytics = getAssignmentAnalytics(assignmentId);
    
    if (!analytics) {
      return Response.json({ error: "Assignment not found" }, { status: 404 });
    }
    
    return Response.json(analytics);
  }

  // GET /api/analytics/workers/:id/assignments - Get all assignment analytics for a worker
  const workerAssignmentsMatch = url.pathname.match(/^\/api\/analytics\/workers\/(\d+)\/assignments$/);
  if (workerAssignmentsMatch && request.method === "GET") {
    const workerId = parseInt(workerAssignmentsMatch[1]!);
    const analytics = getWorkerAssignmentAnalytics(workerId);
    return Response.json(analytics);
  }

  return null;
}
