import {
  mockAnalysis,
  mockProjects,
  mockStories,
  mockUser,
  mockWorldGraph,
} from "../domain/mockData";
import type {
  AnalysisResult,
  AnalysisResultSummary,
  CreateProjectRequest,
  CreateStoryRequest,
  PageInfo,
  Project,
  ReadProjectWorldGraphResponse,
  SignupRequest,
  Story,
  StorySummary,
  UpdateProjectRequest,
  UpdateStoryRequest,
  User,
} from "../domain/types";

const latency = 40;
const sessionStorageKey = "storyguard_mock_user_id";
const initialProjects = [...mockProjects];
const initialStories = [...mockStories];
const initialAnalyses = [mockAnalysis];
let projects = [...mockProjects];
let stories = [...mockStories];
let users = [mockUser];
let analyses = [...initialAnalyses];
let activeSessionUserId: string | null = null;

export type StoryguardApiErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_ALREADY_EXISTS"
  | "VALIDATION_ERROR"
  | "UNKNOWN_ERROR";

export class StoryguardApiError extends Error {
  code: StoryguardApiErrorCode;
  status: number;

  constructor({
    code,
    message,
    status,
  }: {
    code: StoryguardApiErrorCode;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = "StoryguardApiError";
    this.code = code;
    this.status = status;
  }
}

function wait<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), latency);
  });
}

function fail(error: StoryguardApiError): Promise<never> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(error), latency);
  });
}

function now() {
  return new Date().toISOString();
}

function hasBrowserStorage() {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage?.getItem === "function" &&
    typeof window.localStorage?.setItem === "function" &&
    typeof window.localStorage?.removeItem === "function"
  );
}

function setSession(userId: string | null) {
  activeSessionUserId = userId;
  if (!hasBrowserStorage()) return;
  if (userId) {
    window.localStorage.setItem(sessionStorageKey, userId);
  } else {
    window.localStorage.removeItem(sessionStorageKey);
  }
}

function getSessionUserId() {
  if (hasBrowserStorage()) {
    return window.localStorage.getItem(sessionStorageKey) ?? activeSessionUserId;
  }
  return activeSessionUserId;
}

function toAnalysisSummary(analysis: AnalysisResult): AnalysisResultSummary {
  return {
    id: analysis.id,
    projectId: analysis.projectId,
    storyId: analysis.storyId,
    settingsStoryId: analysis.settingsStoryId,
    provider: analysis.provider,
    fallbackUsed: analysis.fallbackUsed,
    summary: analysis.summary,
    createdAt: analysis.createdAt,
  };
}

export type StoryguardApi = {
  login(email: string, password: string): Promise<User>;
  signup(request: SignupRequest): Promise<User>;
  logout(): Promise<void>;
  currentUser(): Promise<User | null>;
  listProjects(): Promise<Project[]>;
  createProject(request: CreateProjectRequest): Promise<Project>;
  updateProject(projectId: string, request: UpdateProjectRequest): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  listStories(projectId: string): Promise<Story[]>;
  readStory(storyId: string): Promise<Story>;
  createStory(projectId: string, request: CreateStoryRequest): Promise<Story>;
  updateStory(storyId: string, request: UpdateStoryRequest): Promise<Story>;
  deleteStory(storyId: string): Promise<void>;
  requestAnalysis(storyId: string): Promise<AnalysisResult>;
  listAnalysisResults(storyId: string): Promise<AnalysisResultSummary[]>;
  readAnalysis(analysisId: string): Promise<AnalysisResult>;
  readProjectWorldGraph(projectId: string): Promise<ReadProjectWorldGraphResponse>;
  reset?: () => void;
};

type AuthResponse = {
  user: User;
};

type CreateProjectResponse = {
  project: Project;
};

type UpdateProjectResponse = {
  project: Project;
};

type ListProjectsResponse = {
  projects: Project[];
  page: PageInfo;
};

type CreateStoryResponse = {
  story: Story;
};

type UpdateStoryResponse = {
  story: Story;
};

type ListStoriesResponse = {
  stories: StorySummary[];
  page: PageInfo;
};

type ReadStoryResponse = {
  story: Story;
};

type RequestStoryAnalysisResponse = {
  analysis: AnalysisResult;
};

type ListStoryAnalysisResultsResponse = {
  analyses: AnalysisResultSummary[];
  page: PageInfo;
};

type ReadAnalysisResultResponse = {
  analysis: AnalysisResult;
};

type ReadProjectWorldGraphApiResponse = ReadProjectWorldGraphResponse;

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

function apiErrorCodeFromStatus(
  status: number,
  code?: string,
): StoryguardApiErrorCode {
  if (
    code === "INVALID_CREDENTIALS" ||
    code === "EMAIL_ALREADY_EXISTS" ||
    code === "VALIDATION_ERROR" ||
    code === "UNKNOWN_ERROR"
  ) {
    return code;
  }
  if (status === 401) return "INVALID_CREDENTIALS";
  if (status === 409) return "EMAIL_ALREADY_EXISTS";
  if (status === 400 || status === 422) return "VALIDATION_ERROR";
  return "UNKNOWN_ERROR";
}

function joinApiUrl(baseUrl: string, path: string) {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export function resolveBackendApiBaseUrl(envValue?: string) {
  return envValue?.trim() || "http://localhost:4000";
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    method,
  };
}

export function createBackendStoryguardApi(baseUrl = ""): StoryguardApi {
  async function request<T>(
    path: string,
    init: RequestInit,
    options: { nullOnUnauthorized?: boolean } = {},
  ): Promise<T> {
    const response = await fetch(joinApiUrl(baseUrl, path), {
      credentials: "include",
      ...init,
    });

    if (options.nullOnUnauthorized && response.status === 401) {
      return null as T;
    }

    if (!response.ok) {
      let message = `StoryGuard API request failed: ${response.status}`;
      let code: string | undefined;
      try {
        const body = await readJson<ApiErrorResponse>(response);
        if (body.error?.message) {
          message = body.error.message;
        }
        code = body.error?.code;
      } catch {
        // Keep the status-based message when the backend returns no JSON body.
      }
      throw new StoryguardApiError({
        code: apiErrorCodeFromStatus(response.status, code),
        message,
        status: response.status,
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return readJson<T>(response);
  }

  const get = <T>(path: string, options?: { nullOnUnauthorized?: boolean }) =>
    request<T>(path, { method: "GET" }, options);

  return {
    async login(email, password) {
      const response = await request<AuthResponse>(
        "/api/auth/login",
        jsonRequest("POST", { email, password }),
      );
      return response.user;
    },
    async signup(signupRequest) {
      const response = await request<AuthResponse>(
        "/api/auth/signup",
        jsonRequest("POST", signupRequest),
      );
      return response.user;
    },
    async logout() {
      await request<void>("/api/auth/logout", { method: "POST" });
    },
    async currentUser() {
      const response = await get<AuthResponse | null>("/api/auth/me", {
        nullOnUnauthorized: true,
      });
      return response?.user ?? null;
    },
    async listProjects() {
      const response = await get<ListProjectsResponse>("/api/projects?limit=20&offset=0");
      return response.projects;
    },
    async createProject(createProjectRequest) {
      const response = await request<CreateProjectResponse>(
        "/api/projects",
        jsonRequest("POST", createProjectRequest),
      );
      return response.project;
    },
    async updateProject(projectId, updateProjectRequest) {
      const response = await request<UpdateProjectResponse>(
        `/api/projects/${projectId}`,
        jsonRequest("PATCH", updateProjectRequest),
      );
      return response.project;
    },
    async deleteProject(projectId) {
      await request<void>(`/api/projects/${projectId}`, {
        credentials: "include",
        method: "DELETE",
      });
    },
    async listStories(projectId) {
      const response = await get<ListStoriesResponse>(
        `/api/projects/${projectId}/stories?documentType=manuscript&limit=20&offset=0`,
      );
      return Promise.all(response.stories.map((story) => this.readStory(story.id)));
    },
    async readStory(storyId) {
      const response = await get<ReadStoryResponse>(`/api/stories/${storyId}`);
      return response.story;
    },
    async createStory(projectId, createStoryRequest) {
      const response = await request<CreateStoryResponse>(
        `/api/projects/${projectId}/stories`,
        jsonRequest("POST", createStoryRequest),
      );
      return response.story;
    },
    async updateStory(storyId, updateStoryRequest) {
      const response = await request<UpdateStoryResponse>(
        `/api/stories/${storyId}`,
        jsonRequest("PATCH", updateStoryRequest),
      );
      return response.story;
    },
    async deleteStory(storyId) {
      await request<void>(`/api/stories/${storyId}`, {
        credentials: "include",
        method: "DELETE",
      });
    },
    async requestAnalysis(storyId) {
      const response = await request<RequestStoryAnalysisResponse>(
        `/api/stories/${storyId}/analyses`,
        { credentials: "include", method: "POST" },
      );
      return response.analysis;
    },
    async listAnalysisResults(storyId) {
      const response = await get<ListStoryAnalysisResultsResponse>(
        `/api/stories/${storyId}/analyses?limit=20&offset=0`,
      );
      return response.analyses;
    },
    async readAnalysis(analysisId) {
      const response = await get<ReadAnalysisResultResponse>(`/api/analyses/${analysisId}`);
      return response.analysis;
    },
    async readProjectWorldGraph(projectId) {
      return get<ReadProjectWorldGraphApiResponse>(`/api/projects/${projectId}/world-graph`);
    },
  };
}

export const mockStoryguardApi: StoryguardApi = {
  async login(email, password) {
    const user = users.find((candidate) => candidate.email === email);
    if (!user || password !== "storyguard") {
      return fail(
        new StoryguardApiError({
          code: "INVALID_CREDENTIALS",
          message: "Invalid credentials",
          status: 401,
        }),
      );
    }
    setSession(user.id);
    return wait(user);
  },
  async signup(request) {
    const exists = users.some((candidate) => candidate.email === request.email);
    if (exists) {
      return fail(
        new StoryguardApiError({
          code: "EMAIL_ALREADY_EXISTS",
          message: "Email already exists",
          status: 409,
        }),
      );
    }
    const timestamp = now();
    const user: User = {
      id: `user-${users.length + 1}`,
      email: request.email,
      name: request.name,
      createdAt: timestamp,
    };
    users = [...users, user];
    setSession(user.id);
    return wait(user);
  },
  async logout() {
    setSession(null);
    return wait(undefined);
  },
  async currentUser() {
    const userId = getSessionUserId();
    return wait(users.find((candidate) => candidate.id === userId) ?? null);
  },
  async listProjects() {
    return wait(projects);
  },
  async createProject(request) {
    const timestamp = now();
    const project: Project = {
      id: `project-${projects.length + 1}`,
      title: request.title,
      genre: request.genre,
      description: request.description,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    projects = [...projects, project];
    return wait(project);
  },
  async updateProject(projectId, request) {
    const timestamp = now();
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) {
      return fail(
        new StoryguardApiError({
          code: "UNKNOWN_ERROR",
          message: "Project not found",
          status: 404,
        }),
      );
    }
    const updatedProject = {
      ...project,
      ...request,
      updatedAt: timestamp,
    };
    projects = projects.map((candidate) =>
      candidate.id === projectId ? updatedProject : candidate,
    );
    return wait(updatedProject);
  },
  async deleteProject(projectId) {
    projects = projects.filter((project) => project.id !== projectId);
    stories = stories.filter((story) => story.projectId !== projectId);
    analyses = analyses.filter((analysis) => analysis.projectId !== projectId);
    return wait(undefined);
  },
  async listStories(projectId) {
    return wait(stories.filter((story) => story.projectId === projectId));
  },
  async readStory(storyId) {
    return wait(stories.find((story) => story.id === storyId) ?? mockStories[0]);
  },
  async createStory(projectId, request) {
    const timestamp = now();
    const story: Story = {
      id: `story-${stories.length + 1}`,
      projectId,
      title: request.title,
      documentType: request.documentType,
      content: request.content,
      sourceType: "manual",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    stories = [story, ...stories];
    return wait(story);
  },
  async updateStory(storyId, request) {
    const timestamp = now();
    const story = stories.find((candidate) => candidate.id === storyId);
    if (!story) {
      return fail(
        new StoryguardApiError({
          code: "UNKNOWN_ERROR",
          message: "Story not found",
          status: 404,
        }),
      );
    }
    const updatedStory = {
      ...story,
      ...request,
      updatedAt: timestamp,
    };
    stories = stories.map((candidate) =>
      candidate.id === storyId ? updatedStory : candidate,
    );
    return wait(updatedStory);
  },
  async deleteStory(storyId) {
    stories = stories.filter((story) => story.id !== storyId);
    analyses = analyses.filter((analysis) => analysis.storyId !== storyId);
    return wait(undefined);
  },
  async requestAnalysis(storyId) {
    const result: AnalysisResult = {
      ...mockAnalysis,
      id: `analysis-${storyId}-${analyses.length + 1}`,
      storyId,
      createdAt: now(),
    };
    analyses = [result, ...analyses.filter((analysis) => analysis.id !== result.id)];
    return wait(result);
  },
  async listAnalysisResults(storyId) {
    return wait(
      analyses
        .filter((analysis) => analysis.storyId === storyId)
        .map((analysis) => toAnalysisSummary(analysis)),
    );
  },
  async readAnalysis(analysisId) {
    return wait(analyses.find((analysis) => analysis.id === analysisId) ?? mockAnalysis);
  },
  async readProjectWorldGraph(projectId) {
    const project = projects.find((candidate) => candidate.id === projectId);
    return wait({
      graph: project?.id === "project-gisadan" ? mockWorldGraph : { nodes: [], edges: [] },
      updatedAt: project?.updatedAt ?? now(),
    });
  },
  reset() {
    projects = [...initialProjects];
    stories = [...initialStories];
    users = [mockUser];
    analyses = [...initialAnalyses];
    setSession(null);
  },
};

const backendApiBaseUrl = resolveBackendApiBaseUrl(
  import.meta.env.VITE_STORYGUARD_API_BASE_URL,
);

export const storyguardApi: StoryguardApi =
  import.meta.env.MODE === "test"
    ? mockStoryguardApi
    : createBackendStoryguardApi(backendApiBaseUrl);
