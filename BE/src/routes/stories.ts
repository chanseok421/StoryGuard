import { Router, type Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../auth/middleware.js";
import { getSupabase } from "../db/supabase.js";
import { scheduleIngest } from "../rag/ingestDocument.js";
import { logRouteError, logSupabaseError } from "../shared/routeLogging.js";
import type {
  CreateStoryRequest,
  CreateStoryResponse,
  EmbeddingStatus,
  ListStoriesResponse,
  ReadStoryResponse,
  Story,
  StoryDocumentType,
  StorySummary,
  UpdateStoryRequest,
  UpdateStoryResponse,
} from "../shared/types.js";

type StoryRow = {
  id: string;
  project_id: string;
  title: string;
  document_type: StoryDocumentType;
  content: string;
  source_type: "manual";
  embedding_status?: EmbeddingStatus;
  created_at: string;
  updated_at: string;
};

type StorySummaryRow = Omit<StoryRow, "content"> & {
  content: string;
};

const STORY_SELECT = "id,project_id,title,document_type,content,source_type,created_at,updated_at";

export const projectStoriesRouter = Router({ mergeParams: true });
export const storiesRouter = Router();

projectStoriesRouter.use(requireAuth);
storiesRouter.use(requireAuth);

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

function isStoryDocumentType(value: unknown): value is StoryDocumentType {
  return value === "settings" || value === "manuscript";
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

function toStory(row: StoryRow): Story {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    documentType: row.document_type,
    content: row.content,
    sourceType: row.source_type,
    embeddingStatus: row.embedding_status ?? "pending",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStorySummary(row: StorySummaryRow): StorySummary {
  const { content: _content, ...story } = toStory(row);
  return {
    ...story,
    excerpt: createExcerpt(row.content),
  };
}

function createExcerpt(content: string): string {
  const compact = content.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}

function getParam(params: unknown, key: string): string {
  if (!params || typeof params !== "object" || !(key in params)) {
    return "";
  }

  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

async function ensureProjectOwned(projectId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string }>();

  return !error && Boolean(data);
}

projectStoriesRouter.post("/", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const projectId = getParam(req.params, "projectId");
    const title = getStringField(req.body, "title")?.trim() ?? "";
    const content = getStringField(req.body, "content") ?? "";
    const documentType = getStringField(req.body, "documentType");

    if (!projectId || !(await ensureProjectOwned(projectId, authReq.user.id))) {
      sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found.");
      return;
    }

    if (!title || !content.trim() || !isStoryDocumentType(documentType)) {
      sendError(res, 400, "INVALID_STORY_REQUEST", "Story title, documentType, and content are required.");
      return;
    }

    const createRequest: CreateStoryRequest = {
      title,
      documentType,
      content,
    };

    const { data, error } = await getSupabase()
      .from("story_documents")
      .insert({
        user_id: authReq.user.id,
        project_id: projectId,
        title: createRequest.title,
        document_type: createRequest.documentType,
        content: createRequest.content,
        source_type: "manual",
      })
      .select(STORY_SELECT)
      .single<StoryRow>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "story create failed", error, { projectId });
      }
      sendError(res, 500, "STORY_CREATE_FAILED", "Failed to create story.");
      return;
    }

    // 저장은 끝났으니 즉시 응답하고, 청킹/임베딩은 백그라운드로 돌린다.
    scheduleIngest({
      storyId: data.id,
      userId: authReq.user.id,
      projectId: data.project_id,
      documentType: data.document_type,
      content: data.content,
    });

    const response: CreateStoryResponse = {
      story: toStory(data),
    };

    res.status(201).json(response);
  } catch (error) {
    logRouteError(req, "story create unexpected error", error);
    sendError(res, 500, "STORY_CREATE_FAILED", "Failed to create story.");
  }
});

projectStoriesRouter.get("/", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const projectId = getParam(req.params, "projectId");
    const documentType = req.query.documentType;
    const limit = parseLimit(req.query.limit);
    const offset = parsePagingNumber(req.query.offset, 0);

    if (!projectId || !(await ensureProjectOwned(projectId, authReq.user.id))) {
      sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found.");
      return;
    }

    if (documentType !== undefined && !isStoryDocumentType(documentType)) {
      sendError(res, 400, "INVALID_STORY_QUERY", "documentType must be settings or manuscript.");
      return;
    }

    let query = getSupabase()
      .from("story_documents")
      .select(STORY_SELECT, { count: "exact" })
      .eq("user_id", authReq.user.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (isStoryDocumentType(documentType)) {
      query = query.eq("document_type", documentType);
    }

    const { data, error, count } = await query.returns<StorySummaryRow[]>();

    if (error) {
      logSupabaseError(req, "story list failed", error, { projectId });
      sendError(res, 500, "STORY_LIST_FAILED", "Failed to list stories.");
      return;
    }

    const response: ListStoriesResponse = {
      stories: (data ?? []).map(toStorySummary),
      page: {
        limit,
        offset,
        total: count ?? 0,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    logRouteError(req, "story list unexpected error", error);
    sendError(res, 500, "STORY_LIST_FAILED", "Failed to list stories.");
  }
});

storiesRouter.get("/:storyId", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { data, error } = await getSupabase()
      .from("story_documents")
      .select(STORY_SELECT)
      .eq("id", getParam(req.params, "storyId"))
      .eq("user_id", authReq.user.id)
      .maybeSingle<StoryRow>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "story read failed", error);
      }
      sendError(res, 404, "STORY_NOT_FOUND", "Story not found.");
      return;
    }

    const response: ReadStoryResponse = {
      story: toStory(data),
    };

    res.status(200).json(response);
  } catch (error) {
    logRouteError(req, "story read unexpected error", error);
    sendError(res, 500, "STORY_READ_FAILED", "Failed to read story.");
  }
});

storiesRouter.get("/:storyId/status", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { data, error } = await getSupabase()
      .from("story_documents")
      .select("id")
      .eq("id", getParam(req.params, "storyId"))
      .eq("user_id", authReq.user.id)
      .maybeSingle<{ id: string }>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "story status read failed", error);
      }
      sendError(res, 404, "STORY_NOT_FOUND", "Story not found.");
      return;
    }

    res.status(200).json({ storyId: data.id, embeddingStatus: "pending" satisfies EmbeddingStatus });
  } catch (error) {
    logRouteError(req, "story status unexpected error", error);
    sendError(res, 500, "STORY_STATUS_FAILED", "Failed to read embedding status.");
  }
});

storiesRouter.patch("/:storyId", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const title = getStringField(req.body, "title");
    const content = getStringField(req.body, "content");
    const updateRequest: UpdateStoryRequest = {};

    if (title !== undefined) {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        sendError(res, 400, "INVALID_STORY_REQUEST", "Story title cannot be empty.");
        return;
      }
      updateRequest.title = trimmedTitle;
    }

    if (content !== undefined) {
      if (!content.trim()) {
        sendError(res, 400, "INVALID_STORY_REQUEST", "Story content cannot be empty.");
        return;
      }
      updateRequest.content = content;
    }

    if (Object.keys(updateRequest).length === 0) {
      sendError(res, 400, "INVALID_STORY_REQUEST", "No story fields to update.");
      return;
    }

    const contentChanged = updateRequest.content !== undefined;
    const { data, error } = await getSupabase()
      .from("story_documents")
      .update({
        ...updateRequest,
        updated_at: new Date().toISOString(),
      })
      .eq("id", getParam(req.params, "storyId"))
      .eq("user_id", authReq.user.id)
      .select(STORY_SELECT)
      .maybeSingle<StoryRow>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "story update failed", error);
      }
      sendError(res, 404, "STORY_NOT_FOUND", "Story not found.");
      return;
    }

    if (contentChanged) {
      scheduleIngest({
        storyId: data.id,
        userId: authReq.user.id,
        projectId: data.project_id,
        documentType: data.document_type,
        content: data.content,
      });
    }

    const response: UpdateStoryResponse = {
      story: toStory(data),
    };

    res.status(200).json(response);
  } catch (error) {
    logRouteError(req, "story update unexpected error", error);
    sendError(res, 500, "STORY_UPDATE_FAILED", "Failed to update story.");
  }
});

storiesRouter.delete("/:storyId", async (req, res) => {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { data, error } = await getSupabase()
      .from("story_documents")
      .delete()
      .eq("id", getParam(req.params, "storyId"))
      .eq("user_id", authReq.user.id)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error || !data) {
      if (error) {
        logSupabaseError(req, "story delete failed", error);
      }
      sendError(res, 404, "STORY_NOT_FOUND", "Story not found.");
      return;
    }

    res.status(204).send();
  } catch (error) {
    logRouteError(req, "story delete unexpected error", error);
    sendError(res, 500, "STORY_DELETE_FAILED", "Failed to delete story.");
  }
});
