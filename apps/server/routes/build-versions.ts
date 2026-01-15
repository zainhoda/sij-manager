import {
  getBuildVersions,
  getBuildVersion,
  getBuildVersionWithSteps,
  getBuildVersionSteps,
  getDefaultBuildVersion,
  createBuildVersion,
  cloneBuildVersion,
  updateBuildVersion,
  setDefaultBuildVersion,
  addStepToBuildVersion,
  removeStepFromBuildVersion,
  reorderBuildVersionSteps,
  deleteBuildVersion,
  getAvailableStepsForBuildVersion,
} from "../services/build-version-manager";
import {
  getBuildVersionMetrics,
  compareBuildVersionMetrics,
} from "../services/analytics";

export async function handleBuildVersions(request: Request): Promise<Response | null> {
  const url = new URL(request.url);

  // GET /api/products/:id/build-versions - list all build versions for a product
  const listMatch = url.pathname.match(/^\/api\/products\/(\d+)\/build-versions$/);
  if (listMatch && request.method === "GET") {
    const productId = parseInt(listMatch[1]!);
    const versions = await getBuildVersions(productId);
    return Response.json(versions);
  }

  // POST /api/products/:id/build-versions - create a new build version
  if (listMatch && request.method === "POST") {
    const productId = parseInt(listMatch[1]!);
    const body = await request.json() as {
      version_name: string;
      description?: string;
      clone_from_id?: number;
    };

    if (!body.version_name) {
      return Response.json({ error: "version_name is required" }, { status: 400 });
    }

    try {
      const version = await createBuildVersion(
        productId,
        body.version_name,
        body.description || null,
        body.clone_from_id
      );
      return Response.json(version, { status: 201 });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // GET /api/build-versions/:id - get a build version with its steps
  const getMatch = url.pathname.match(/^\/api\/build-versions\/(\d+)$/);
  if (getMatch && request.method === "GET") {
    const buildVersionId = parseInt(getMatch[1]!);
    const version = await getBuildVersionWithSteps(buildVersionId);
    if (!version) {
      return Response.json({ error: "Build version not found" }, { status: 404 });
    }
    return Response.json(version);
  }

  // PATCH /api/build-versions/:id - update a build version
  if (getMatch && request.method === "PATCH") {
    const buildVersionId = parseInt(getMatch[1]!);
    const body = await request.json() as {
      version_name?: string;
      description?: string;
      status?: 'draft' | 'active' | 'deprecated';
    };

    const version = await updateBuildVersion(buildVersionId, body);
    if (!version) {
      return Response.json({ error: "Build version not found" }, { status: 404 });
    }
    return Response.json(version);
  }

  // DELETE /api/build-versions/:id - delete a build version
  if (getMatch && request.method === "DELETE") {
    const buildVersionId = parseInt(getMatch[1]!);
    try {
      const deleted = await deleteBuildVersion(buildVersionId);
      if (!deleted) {
        return Response.json({ error: "Build version not found" }, { status: 404 });
      }
      return Response.json({ success: true });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // POST /api/build-versions/:id/clone - clone a build version
  const cloneMatch = url.pathname.match(/^\/api\/build-versions\/(\d+)\/clone$/);
  if (cloneMatch && request.method === "POST") {
    const buildVersionId = parseInt(cloneMatch[1]!);
    const body = await request.json() as {
      version_name: string;
      description?: string;
    };

    if (!body.version_name) {
      return Response.json({ error: "version_name is required" }, { status: 400 });
    }

    try {
      const version = await cloneBuildVersion(buildVersionId, body.version_name, body.description || null);
      return Response.json(version, { status: 201 });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // POST /api/build-versions/:id/set-default - set as default build version
  const setDefaultMatch = url.pathname.match(/^\/api\/build-versions\/(\d+)\/set-default$/);
  if (setDefaultMatch && request.method === "POST") {
    const buildVersionId = parseInt(setDefaultMatch[1]!);
    try {
      await setDefaultBuildVersion(buildVersionId);
      const version = await getBuildVersion(buildVersionId);
      return Response.json(version);
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // GET /api/build-versions/:id/steps - get steps in the build version
  const stepsMatch = url.pathname.match(/^\/api\/build-versions\/(\d+)\/steps$/);
  if (stepsMatch && request.method === "GET") {
    const buildVersionId = parseInt(stepsMatch[1]!);
    const version = await getBuildVersion(buildVersionId);
    if (!version) {
      return Response.json({ error: "Build version not found" }, { status: 404 });
    }
    const steps = await getBuildVersionSteps(buildVersionId);
    return Response.json(steps);
  }

  // POST /api/build-versions/:id/steps - add a step to the build version
  if (stepsMatch && request.method === "POST") {
    const buildVersionId = parseInt(stepsMatch[1]!);
    const body = await request.json() as {
      product_step_id: number;
      sequence?: number;
    };

    if (!body.product_step_id) {
      return Response.json({ error: "product_step_id is required" }, { status: 400 });
    }

    try {
      const step = await addStepToBuildVersion(buildVersionId, body.product_step_id, body.sequence);
      return Response.json(step, { status: 201 });
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  // DELETE /api/build-versions/:id/steps/:stepId - remove a step from the build version
  const removeStepMatch = url.pathname.match(/^\/api\/build-versions\/(\d+)\/steps\/(\d+)$/);
  if (removeStepMatch && request.method === "DELETE") {
    const buildVersionId = parseInt(removeStepMatch[1]!);
    const productStepId = parseInt(removeStepMatch[2]!);
    const removed = await removeStepFromBuildVersion(buildVersionId, productStepId);
    if (!removed) {
      return Response.json({ error: "Step not found in build version" }, { status: 404 });
    }
    return Response.json({ success: true });
  }

  // PUT /api/build-versions/:id/steps/reorder - reorder steps in the build version
  const reorderMatch = url.pathname.match(/^\/api\/build-versions\/(\d+)\/steps\/reorder$/);
  if (reorderMatch && request.method === "PUT") {
    const buildVersionId = parseInt(reorderMatch[1]!);
    const body = await request.json() as {
      steps: { productStepId: number; sequence: number }[];
    };

    if (!body.steps || !Array.isArray(body.steps)) {
      return Response.json({ error: "steps array is required" }, { status: 400 });
    }

    await reorderBuildVersionSteps(buildVersionId, body.steps);
    const steps = await getBuildVersionSteps(buildVersionId);
    return Response.json(steps);
  }

  // GET /api/build-versions/:id/available-steps - get steps that can be added to this version
  const availableMatch = url.pathname.match(/^\/api\/build-versions\/(\d+)\/available-steps$/);
  if (availableMatch && request.method === "GET") {
    const buildVersionId = parseInt(availableMatch[1]!);
    const steps = await getAvailableStepsForBuildVersion(buildVersionId);
    return Response.json(steps);
  }

  // GET /api/build-versions/:id/metrics - get performance metrics for a build version
  const metricsMatch = url.pathname.match(/^\/api\/build-versions\/(\d+)\/metrics$/);
  if (metricsMatch && request.method === "GET") {
    const buildVersionId = parseInt(metricsMatch[1]!);
    const metrics = await getBuildVersionMetrics(buildVersionId);
    if (!metrics) {
      return Response.json({ error: "Build version not found" }, { status: 404 });
    }
    return Response.json(metrics);
  }

  // GET /api/build-versions/compare?ids=1,2,3 - compare metrics between versions
  if (url.pathname === "/api/build-versions/compare" && request.method === "GET") {
    const idsParam = url.searchParams.get("ids");
    if (!idsParam) {
      return Response.json({ error: "ids parameter is required" }, { status: 400 });
    }
    const ids = idsParam.split(",").map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (ids.length < 2) {
      return Response.json({ error: "At least 2 version IDs required for comparison" }, { status: 400 });
    }
    const comparison = await compareBuildVersionMetrics(ids);
    return Response.json(comparison);
  }

  return null;
}
