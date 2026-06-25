import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StoryguardApiError,
  createBackendStoryguardApi,
  resolveBackendApiBaseUrl,
} from "./storyguardApi";
import type { AnalysisResult, Project, Story, User } from "../domain/types";

const user: User = {
  id: "user-1",
  email: "writer@example.com",
  name: "테스트 작가",
  createdAt: "2026-06-20T00:00:00.000Z",
};

const project: Project = {
  id: "project-1",
  title: "테스트 프로젝트",
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
};

const story: Story = {
  id: "story-1",
  projectId: "project-1",
  title: "1화",
  documentType: "manuscript",
  content: "본문",
  sourceType: "manual",
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
};

const analysis: AnalysisResult = {
  id: "analysis-1",
  projectId: "project-1",
  storyId: "story-1",
  provider: "mock",
  fallbackUsed: false,
  summary: {
    issueCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
  },
  response: {
    summary: {
      issueCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
    issues: [],
    nodes: [],
    edges: [],
    evidence: [],
    providerInfo: {
      provider: "mock",
      fallbackUsed: false,
    },
  },
  createdAt: "2026-06-20T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("backend StoryGuard API adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults the backend base URL to the local backend server", () => {
    expect(resolveBackendApiBaseUrl()).toBe("http://localhost:4000");
    expect(resolveBackendApiBaseUrl("https://api.storyguard.test")).toBe(
      "https://api.storyguard.test",
    );
  });

  it("sends auth requests with cookie credentials and unwraps the user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createBackendStoryguardApi("https://api.storyguard.test");
    await expect(api.login("writer@example.com", "secret")).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledWith("https://api.storyguard.test/api/auth/login", {
      body: JSON.stringify({ email: "writer@example.com", password: "secret" }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  });

  it("maps backend auth failures to StoryguardApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid credentials",
          },
        },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = createBackendStoryguardApi();

    await expect(api.login("writer@example.com", "wrong")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
    await expect(api.login("writer@example.com", "wrong")).rejects.toBeInstanceOf(
      StoryguardApiError,
    );
  });

  it("unwraps list responses and reads full story content after story summaries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ projects: [project], page: { limit: 20, offset: 0, total: 1 } }))
      .mockResolvedValueOnce(
        jsonResponse({
          stories: [{ ...story, content: undefined, excerpt: "본문" }],
          page: { limit: 20, offset: 0, total: 1 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ story }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createBackendStoryguardApi();

    await expect(api.listProjects()).resolves.toEqual([project]);
    await expect(api.listStories("project-1")).resolves.toEqual([story]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects?limit=20&offset=0", {
      credentials: "include",
      method: "GET",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/stories?documentType=manuscript&limit=20&offset=0",
      {
        credentials: "include",
        method: "GET",
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/stories/story-1", {
      credentials: "include",
      method: "GET",
    });
  });

  it("requests saved story analysis and opens saved analysis results", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ analysis }))
      .mockResolvedValueOnce(
        jsonResponse({ analyses: [analysis], page: { limit: 20, offset: 0, total: 1 } }),
      )
      .mockResolvedValueOnce(jsonResponse({ analysis }));
    vi.stubGlobal("fetch", fetchMock);

    const api = createBackendStoryguardApi();

    await expect(api.requestAnalysis("story-1")).resolves.toEqual(analysis);
    await expect(api.listAnalysisResults("story-1")).resolves.toEqual([analysis]);
    await expect(api.readAnalysis("analysis-1")).resolves.toEqual(analysis);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/stories/story-1/analyses", {
      credentials: "include",
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/stories/story-1/analyses?limit=20&offset=0",
      {
        credentials: "include",
        method: "GET",
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/analyses/analysis-1", {
      credentials: "include",
      method: "GET",
    });
  });
});
