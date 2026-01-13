import {
  getDeadlineRisks,
  getOvertimeProjections,
  getCapacityAnalysis,
  createScenario,
  getScenarios,
  getScenario,
  generateScenarioSchedule,
  deleteScenario,
} from "../services/scenarios";

export async function handleScheduling(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/scheduling/deadline-risks - Get orders at risk of missing deadline
  if (url.pathname === "/api/scheduling/deadline-risks" && request.method === "GET") {
    const risks = await getDeadlineRisks();
    return Response.json(risks);
  }

  // GET /api/scheduling/overtime - Get overtime projections
  if (url.pathname === "/api/scheduling/overtime" && request.method === "GET") {
    const overtime = await getOvertimeProjections();
    return Response.json(overtime);
  }

  // GET /api/scheduling/capacity - Get capacity analysis
  if (url.pathname === "/api/scheduling/capacity" && request.method === "GET") {
    const weeksParam = url.searchParams.get("weeks");
    const weeks = weeksParam ? parseInt(weeksParam) : 8;
    const capacity = await getCapacityAnalysis(weeks);
    return Response.json(capacity);
  }

  // GET /api/scenarios - List all scenarios
  if (url.pathname === "/api/scenarios" && request.method === "GET") {
    const scenarios = await getScenarios();
    return Response.json(scenarios);
  }

  // POST /api/scenarios - Create new scenario
  if (url.pathname === "/api/scenarios" && request.method === "POST") {
    return handleCreateScenario(request);
  }

  // GET /api/scenarios/:id - Get scenario by ID
  const scenarioMatch = url.pathname.match(/^\/api\/scenarios\/(\d+)$/);
  if (scenarioMatch && request.method === "GET") {
    const scenarioId = parseInt(scenarioMatch[1]!);
    const scenario = await getScenario(scenarioId);

    if (!scenario) {
      return Response.json({ error: "Scenario not found" }, { status: 404 });
    }

    return Response.json(scenario);
  }

  // DELETE /api/scenarios/:id - Delete scenario
  if (scenarioMatch && request.method === "DELETE") {
    const scenarioId = parseInt(scenarioMatch[1]!);
    const deleted = await deleteScenario(scenarioId);

    if (!deleted) {
      return Response.json({ error: "Scenario not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  }

  // POST /api/scenarios/:id/generate - Generate schedule for scenario
  const generateMatch = url.pathname.match(/^\/api\/scenarios\/(\d+)\/generate$/);
  if (generateMatch && request.method === "POST") {
    const scenarioId = parseInt(generateMatch[1]!);
    const result = await generateScenarioSchedule(scenarioId);

    if (!result) {
      return Response.json({ error: "Scenario not found" }, { status: 404 });
    }

    return Response.json(result);
  }

  return null;
}

async function handleCreateScenario(request: Request): Promise<Response> {
  try {
    const body = await request.json() as {
      name: string;
      description?: string;
      workerPool: { workerId: number; available: boolean; hoursPerDay?: number }[];
    };

    if (!body.name) {
      return Response.json({ error: "Missing required field: name" }, { status: 400 });
    }

    if (!body.workerPool || !Array.isArray(body.workerPool)) {
      return Response.json({ error: "Missing required field: workerPool" }, { status: 400 });
    }

    const scenario = await createScenario(body.name, body.description || null, body.workerPool);
    return Response.json(scenario, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
