import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import { getSupabase } from "../db/supabase.js";
import { logRouteError, logSupabaseError } from "../shared/routeLogging.js";
import type {
  AnalyzeResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  ListProjectsResponse,
  Project,
  ReadProjectWorldGraphResponse,
  StoryEdge,
  StoryNode,
  UpdateProjectRequest,
  UpdateProjectResponse,
} from "../shared/types.js";

type ProjectRow = {
  id: string;
  title: string;
  genre: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectTimestampRow = {
  id: string;
  updated_at: string;
};

type ProjectAnalysisGraphRow = {
  response: AnalyzeResponse | null;
  created_at: string;
};

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

function getStringField(body: unknown, field: string): string | undefined {
  if (!body || typeof body !== "object" || !(field in body)) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function toOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parsePagingNumber(value: unknown, defaultValue: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }

  return parsed;
}

function parseLimit(value: unknown): number {
  const limit = parsePagingNumber(value, 20);
  return Math.min(Math.max(limit, 1), 100);
}

function getParam(params: unknown, key: string): string {
  if (!params || typeof params !== "object" || !(key in params)) {
    return "";
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function mergeStoryNodes(target: Map<string, StoryNode>, incoming: StoryNode[]): void {
  for (const node of incoming) {
    const existing = target.get(node.id);

    if (!existing) {
      target.set(node.id, node);
      continue;
    }

    target.set(node.id, {
      ...existing,
      importance: Math.max(existing.importance, node.importance),
      hasIssue: existing.hasIssue || node.hasIssue,
    });
  }
}

function edgeKey(edge: StoryEdge): string {
  return [edge.source, edge.target, edge.label, edge.type ?? ""].join("|");
}

function mergeStoryEdges(target: Map<string, StoryEdge>, incoming: StoryEdge[]): void {
  for (const edge of incoming) {
    target.set(edgeKey(edge), edge);
  }
}

projectsRouter.post("/", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const title = getStringField(req.body, "title")?.trim() ?? "";
    const createRequest: CreateProjectRequest = {
      title,
      genre: getStringField(req.body, "genre"),
      description: getStringField(req.body, "description"),
    };

    if (!createRequest.title) {
      sendError(res, 400, "INVALID_PROJECT_REQUEST", "Project title is required.");
      return;
    }

    const { data, error } = await getSupabase()
      .from("projects")
      .insert({
        user_id: authReq.user.id,
        title: createRequest.title,
        genre: toOptionalText(createRequest.genre),
        description: toOptionalText(createRequest.description),
      })
      .select("id,title,genre,description,created_at,updated_at")
      .single<ProjectRow>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "project create failed", error);
      }
      sendError(res, 500, "PROJECT_CREATE_FAILED", "Failed to create project.");
      return;
    }

    const response: CreateProjectResponse = {
      project: toProject(data),
    };

    res.status(201).json(response);
  } catch (error) {
    logRouteError(req, "project create unexpected error", error);
    sendError(res, 500, "PROJECT_CREATE_FAILED", "Failed to create project.");
  }
});

projectsRouter.get("/", async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const limit = parseLimit(req.query.limit);
    const offset = parsePagingNumber(req.query.offset, 0);
    const from = offset;
    const to = offset + limit - 1;

    const { data, error, count } = await getSupabase()
      .from("projects")
      .select("id,title,genre,description,created_at,updated_at", { count: "exact" })
      .eq("user_id", authReq.user.id)
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<ProjectRow[]>();

    if (error) {
      logSupabaseError(req, "project list failed", error);
      sendError(res, 500, "PROJECT_LIST_FAILED", "Failed to list projects.");
      return;
    }

    const response: ListProjectsResponse = {
      projects: (data ?? []).map(toProject),
      page: {
        limit,
        offset,
        total: count ?? 0,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    logRouteError(req, "project list unexpected error", error);
    sendError(res, 500, "PROJECT_LIST_FAILED", "Failed to list projects.");
  }
});

projectsRouter.get("/:projectId/world-graph", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const projectId = getParam(req.params, "projectId");

    const { data: project, error: projectError } = await getSupabase()
      .from("projects")
      .select("id,updated_at")
      .eq("id", projectId)
      .eq("user_id", authReq.user.id)
      .maybeSingle<ProjectTimestampRow>();

    if (projectError || !project) {
      if (projectError) {
        logSupabaseError(req, "project world graph project lookup failed", projectError, { projectId });
      }
      sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found.");
      return;
    }

    const { data, error } = await getSupabase()
      .from("analysis_results")
      .select("response,created_at")
      .eq("project_id", projectId)
      .eq("user_id", authReq.user.id)
      .order("created_at", { ascending: false })
      .returns<ProjectAnalysisGraphRow[]>();

    if (error) {
      logSupabaseError(req, "project world graph analysis lookup failed", error, { projectId });
      sendError(res, 500, "WORLD_GRAPH_READ_FAILED", "Failed to read project world graph.");
      return;
    }

    const nodes = new Map<string, StoryNode>();
    const edges = new Map<string, StoryEdge>();
    const analyses = data ?? [];

    for (const analysis of analyses) {
      mergeStoryNodes(nodes, analysis.response?.nodes ?? []);
      mergeStoryEdges(edges, analysis.response?.edges ?? []);
    }

    const response: ReadProjectWorldGraphResponse = {
      graph: {
        nodes: Array.from(nodes.values()),
        edges: Array.from(edges.values()),
      },
      updatedAt: analyses[0]?.created_at ?? project.updated_at,
    };

    res.status(200).json(response);
  } catch (error) {
    logRouteError(req, "project world graph unexpected error", error);
    sendError(res, 500, "WORLD_GRAPH_READ_FAILED", "Failed to read project world graph.");
  }
});

projectsRouter.patch("/:projectId", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const projectId = getParam(req.params, "projectId");
    const title = getStringField(req.body, "title");
    const genre = getStringField(req.body, "genre");
    const description = getStringField(req.body, "description");
    const updateRequest: UpdateProjectRequest = {};

    if (title !== undefined) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        sendError(res, 400, "INVALID_PROJECT_REQUEST", "Project title cannot be empty.");
        return;
      }
      updateRequest.title = trimmedTitle;
    }

    if (genre !== undefined) {
      updateRequest.genre = genre;
    }

    if (description !== undefined) {
      updateRequest.description = description;
    }

    if (Object.keys(updateRequest).length === 0) {
      sendError(res, 400, "INVALID_PROJECT_REQUEST", "No project fields to update.");
      return;
    }

    const { data, error } = await getSupabase()
      .from("projects")
      .update({
        title: updateRequest.title,
        genre: updateRequest.genre !== undefined ? toOptionalText(updateRequest.genre) : undefined,
        description:
          updateRequest.description !== undefined ? toOptionalText(updateRequest.description) : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", authReq.user.id)
      .select("id,title,genre,description,created_at,updated_at")
      .maybeSingle<ProjectRow>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "project update failed", error, { projectId });
      }
      sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found.");
      return;
    }

    const response: UpdateProjectResponse = {
      project: toProject(data),
    };

    res.status(200).json(response);
  } catch (error) {
    logRouteError(req, "project update unexpected error", error);
    sendError(res, 500, "PROJECT_UPDATE_FAILED", "Failed to update project.");
  }
});

projectsRouter.delete("/:projectId", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const projectId = getParam(req.params, "projectId");
    const { data, error } = await getSupabase()
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", authReq.user.id)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "project delete failed", error, { projectId });
      }
      sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found.");
      return;
    }

    res.status(204).send();
  } catch (error) {
    logRouteError(req, "project delete unexpected error", error);
    sendError(res, 500, "PROJECT_DELETE_FAILED", "Failed to delete project.");
  }
});
