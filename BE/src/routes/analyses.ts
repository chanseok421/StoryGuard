import { Router, type Response } from "express";
import { analyze } from "../api/analyze.js";
import { requireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import { getSupabase } from "../db/supabase.js";
import { logRouteError, logSupabaseError } from "../shared/routeLogging.js";
import type {
  AnalysisResult,
  AnalysisResultSummary,
  AnalyzeResponse,
  AnalyzeStoryRequest,
  ListStoryAnalysisResultsResponse,
  Provider,
  ReadAnalysisResultResponse,
  RequestStoryAnalysisResponse,
  StoryDocumentType,
} from "../shared/types.js";

type ProjectRow = {
  id: string;
  title: string;
  genre: string | null;
};

type StoryRow = {
  id: string;
  project_id: string;
  title: string;
  document_type: StoryDocumentType;
  content: string;
};

type SettingsStoryRow = {
  id: string;
  title: string;
  content: string;
  document_type: StoryDocumentType;
  created_at: string;
};

type AnalysisResultRow = {
  id: string;
  project_id: string;
  story_id: string;
  settings_story_id: string | null;
  provider: Provider;
  fallback_used: boolean;
  summary: AnalyzeResponse["summary"];
  response: AnalyzeResponse;
  created_at: string;
};

const STORY_SELECT = "id,project_id,title,document_type,content";
const ANALYSIS_SELECT =
  "id,project_id,story_id,settings_story_id,provider,fallback_used,summary,response,created_at";

export const storyAnalysesRouter = Router({ mergeParams: true });
export const analysesRouter = Router();

storyAnalysesRouter.use(requireAuth);
analysesRouter.use(requireAuth);

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

function getParam(params: unknown, key: string): string {
  if (!params || typeof params !== "object" || !(key in params)) {
    return "";
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function getStringField(body: unknown, field: string): string | undefined {
  if (!body || typeof body !== "object" || !(field in body)) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function getOptions(body: unknown): AnalyzeStoryRequest["options"] {
  if (!body || typeof body !== "object" || !("options" in body)) {
    return undefined;
  }

  const options = (body as Record<string, unknown>).options;
  if (!options || typeof options !== "object") {
    return undefined;
  }

  return options as AnalyzeStoryRequest["options"];
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

function toAnalysisResult(row: AnalysisResultRow): AnalysisResult {
  return {
    id: row.id,
    projectId: row.project_id,
    storyId: row.story_id,
    settingsStoryId: row.settings_story_id ?? undefined,
    provider: row.provider,
    fallbackUsed: row.fallback_used,
    summary: row.summary,
    response: row.response,
    createdAt: row.created_at,
  };
}

function toAnalysisResultSummary(row: AnalysisResultRow): AnalysisResultSummary {
  const { response: _response, ...summary } = toAnalysisResult(row);
  return summary;
}

function buildFallbackSettingsText(stories: SettingsStoryRow[]): string {
  return stories
    .map((story) => `# ${story.title}\n\n${story.content}`)
    .join("\n\n---\n\n")
    .trim();
}

async function readStory(storyId: string, userId: string): Promise<StoryRow | null> {
  const { data, error } = await getSupabase()
    .from("story_documents")
    .select(STORY_SELECT)
    .eq("id", storyId)
    .eq("user_id", userId)
    .maybeSingle<StoryRow>();

  if (error || !data) {
    return null;
  }

  return data;
}

async function readProject(projectId: string, userId: string): Promise<ProjectRow | null> {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("id,title,genre")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle<ProjectRow>();

  if (error || !data) {
    return null;
  }

  return data;
}

async function resolveSettingsText(
  body: unknown,
  story: StoryRow,
  userId: string,
): Promise<{ settingsText: string; settingsStoryId?: string } | null> {
  const settingsText = getStringField(body, "settingsText")?.trim();
  if (settingsText) {
    return { settingsText };
  }

  const settingsStoryId = getStringField(body, "settingsStoryId");
  if (settingsStoryId) {
    const settingsStory = await readStory(settingsStoryId, userId);
    if (!settingsStory || settingsStory.project_id !== story.project_id) {
      return null;
    }

    return {
      settingsText: settingsStory.content,
      settingsStoryId: settingsStory.id,
    };
  }

  const { data: settingsData, error: settingsError } = await getSupabase()
    .from("story_documents")
    .select("id,title,content,document_type,created_at")
    .eq("user_id", userId)
    .eq("project_id", story.project_id)
    .neq("id", story.id)
    .eq("document_type", "settings")
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<SettingsStoryRow[]>();

  if (settingsError) {
    return null;
  }

  const settingsStories = settingsData ?? [];
  if (settingsStories.length > 0) {
    return {
      settingsText: buildFallbackSettingsText(settingsStories),
      settingsStoryId: settingsStories[0]?.id,
    };
  }

  const { data: fallbackData, error: fallbackError } = await getSupabase()
    .from("story_documents")
    .select("id,title,content,document_type,created_at")
    .eq("user_id", userId)
    .eq("project_id", story.project_id)
    .neq("id", story.id)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<SettingsStoryRow[]>();

  if (fallbackError) {
    return null;
  }

  const resolvedText = buildFallbackSettingsText(fallbackData ?? []);

  if (!resolvedText) {
    return {
      settingsText: `${story.title}\n\n${story.content}`,
    };
  }

  return {
    settingsText: resolvedText,
  };
}

storyAnalysesRouter.post("/", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const storyId = getParam(req.params, "storyId");
    const story = await readStory(storyId, authReq.user.id);

    if (!story) {
      sendError(res, 404, "STORY_NOT_FOUND", "Story not found.");
      return;
    }

    const project = await readProject(story.project_id, authReq.user.id);
    if (!project) {
      sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found.");
      return;
    }

    const settings = await resolveSettingsText(req.body, story, authReq.user.id);
    if (!settings) {
      sendError(res, 400, "INVALID_ANALYSIS_REQUEST", "Failed to resolve settings text.");
      return;
    }

    const analysisResponse = await analyze({
      projectId: project.id,
      projectTitle: project.title,
      genre: project.genre ?? undefined,
      settingsText: settings.settingsText,
      manuscriptText: story.content,
      options: getOptions(req.body),
    });

    const { data, error } = await getSupabase()
      .from("analysis_results")
      .insert({
        user_id: authReq.user.id,
        project_id: project.id,
        story_id: story.id,
        settings_story_id: settings.settingsStoryId ?? null,
        provider: analysisResponse.providerInfo.provider,
        fallback_used: analysisResponse.providerInfo.fallbackUsed,
        summary: analysisResponse.summary,
        response: analysisResponse,
      })
      .select(ANALYSIS_SELECT)
      .single<AnalysisResultRow>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "analysis create save failed", error, {
          projectId: project.id,
          storyId: story.id,
        });
      }
      sendError(res, 500, "ANALYSIS_CREATE_FAILED", "Failed to save analysis result.");
      return;
    }

    const response: RequestStoryAnalysisResponse = {
      analysis: toAnalysisResult(data),
    };

    res.status(201).json(response);
  } catch (error) {
    logRouteError(req, "analysis create unexpected error", error);
    sendError(res, 500, "ANALYSIS_CREATE_FAILED", "Failed to create analysis.");
  }
});

storyAnalysesRouter.get("/", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const storyId = getParam(req.params, "storyId");
    const story = await readStory(storyId, authReq.user.id);
    const limit = parseLimit(req.query.limit);
    const offset = parsePagingNumber(req.query.offset, 0);

    if (!story) {
      sendError(res, 404, "STORY_NOT_FOUND", "Story not found.");
      return;
    }

    const { data, error, count } = await getSupabase()
      .from("analysis_results")
      .select(ANALYSIS_SELECT, { count: "exact" })
      .eq("user_id", authReq.user.id)
      .eq("story_id", story.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
      .returns<AnalysisResultRow[]>();

    if (error) {
      logSupabaseError(req, "analysis list failed", error, { storyId: story.id });
      sendError(res, 500, "ANALYSIS_LIST_FAILED", "Failed to list analysis results.");
      return;
    }

    const response: ListStoryAnalysisResultsResponse = {
      analyses: (data ?? []).map(toAnalysisResultSummary),
      page: {
        limit,
        offset,
        total: count ?? 0,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    logRouteError(req, "analysis list unexpected error", error);
    sendError(res, 500, "ANALYSIS_LIST_FAILED", "Failed to list analysis results.");
  }
});

analysesRouter.get("/:analysisId", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { data, error } = await getSupabase()
      .from("analysis_results")
      .select(ANALYSIS_SELECT)
      .eq("id", getParam(req.params, "analysisId"))
      .eq("user_id", authReq.user.id)
      .maybeSingle<AnalysisResultRow>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "analysis read failed", error);
      }
      sendError(res, 404, "ANALYSIS_NOT_FOUND", "Analysis result not found.");
      return;
    }

    const response: ReadAnalysisResultResponse = {
      analysis: toAnalysisResult(data),
    };

    res.status(200).json(response);
  } catch (error) {
    logRouteError(req, "analysis read unexpected error", error);
    sendError(res, 500, "ANALYSIS_READ_FAILED", "Failed to read analysis result.");
  }
});
