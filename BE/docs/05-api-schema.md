# Frontend API Schema

This document is the frontend-facing API schema for StoryGuard.
It only covers the HTTP contract between frontend and backend.

The frontend should treat this file as the MVP source of truth for:

- email/password signup, login, logout, and current user lookup
- project create, list, update, delete, and world graph read
- story create, list, read, update, and delete
- story analysis requests
- saved analysis result list and read

## MVP Scope

Confirmed for MVP:

- Email/password auth with HttpOnly session cookies
- Project create, list, update, delete, and world graph read
- Story create, list, read, update, and delete
- Story listing by project
- Story analysis request
- Saved analysis result list and read

Later scope, not included in the first MVP contract:

- JWT or Bearer token auth
- OAuth login
- Analysis delete
- Multipart upload API
- `.hwpx` upload
- `.docx` upload
- Backend-side `.md` file parsing

## Common Rules

- All request and response bodies are JSON.
- All timestamps are ISO 8601 strings.
- Stored resource ids are UUID strings. AnalyzeResponse graph and evidence ids follow `01-contract.md`.
- Stored data APIs require authentication.
- Auth uses email/password credentials and an HttpOnly session cookie.
- The frontend must send requests with credentials enabled.
- The backend sets, reads, and clears the session cookie.
- OAuth, JWT, and Bearer tokens are not part of this contract.
- A project belongs to one writer.
- A story belongs to one project.
- An analysis result belongs to one story and one project.

## Session Cookie

Use this cookie for MVP auth:

```txt
storyguard_session
```

On signup or login, the backend sets:

```txt
Set-Cookie: storyguard_session=<sessionId>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
```

Local development may omit `Secure`. HTTPS deployment should add `Secure`.

The frontend should not store tokens. It should use browser cookie credentials.

## Common Types

```ts
export type ID = string;
export type ISODateTime = string;

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type PageInfo = {
  limit: number;
  offset: number;
  total: number;
};

export type Provider = "groq" | "ollama" | "mock";
```

## Auth

```ts
export type User = {
  id: ID;
  email: string;
  name?: string;
  createdAt: ISODateTime;
};

export type SignupRequest = {
  email: string;
  password: string;
  name?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  user: User;
};
```

### Signup

`POST /api/auth/signup`

```ts
export type SignupResponse = AuthResponse;
```

### Login

`POST /api/auth/login`

```ts
export type LoginResponse = AuthResponse;
```

### Logout

`POST /api/auth/logout`

Response: `204 No Content`

### Current User

`GET /api/auth/me`

```ts
export type CurrentUserResponse = {
  user: User;
};
```

## Project

```ts
export type Project = {
  id: ID;
  title: string;
  genre?: string;
  description?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type CreateProjectRequest = {
  title: string;
  genre?: string;
  description?: string;
};

export type UpdateProjectRequest = Partial<CreateProjectRequest>;
```

### Create Project

`POST /api/projects`

```ts
export type CreateProjectResponse = {
  project: Project;
};
```

### List Projects

`GET /api/projects?limit=20&offset=0`

```ts
export type ListProjectsResponse = {
  projects: Project[];
  page: PageInfo;
};
```

### Update Project

`PATCH /api/projects/:projectId`

```ts
export type UpdateProjectResponse = {
  project: Project;
};
```

### Delete Project

`DELETE /api/projects/:projectId`

Response: `204 No Content`

### Read Project World Graph

`GET /api/projects/:projectId/world-graph`

This endpoint is for the separate world graph menu. It does not replace the graph fields in `AnalyzeResponse`.

The backend builds the project graph from saved analysis results for the authenticated user's project.

```ts
export type WorldGraph = {
  nodes: StoryNode[];
  edges: StoryEdge[];
};

export type ReadProjectWorldGraphResponse = {
  graph: WorldGraph;
  updatedAt: ISODateTime;
};
```

## Story

```ts
export type StorySourceType = "manual";
export type StoryDocumentType = "settings" | "manuscript";

export type Story = {
  id: ID;
  projectId: ID;
  title: string;
  documentType: StoryDocumentType;
  content: string;
  sourceType: StorySourceType;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type StorySummary = Omit<Story, "content"> & {
  excerpt: string;
};

export type CreateStoryRequest = {
  title: string;
  documentType: StoryDocumentType;
  content: string;
};

export type UpdateStoryRequest = {
  title?: string;
  content?: string;
};
```

### Create Story

`POST /api/projects/:projectId/stories`

Creates a story from plain text or Markdown entered in the frontend.
For `.md` files, the frontend reads the file text and sends it as `content`.

```ts
export type CreateStoryResponse = {
  story: Story;
};
```

### List Stories

`GET /api/projects/:projectId/stories?documentType=manuscript&limit=20&offset=0`

Query params:

```ts
export type ListStoriesQuery = {
  documentType?: StoryDocumentType;
  limit?: number;
  offset?: number;
};
```

```ts
export type ListStoriesResponse = {
  stories: StorySummary[];
  page: PageInfo;
};
```

### Read Story

`GET /api/stories/:storyId`

```ts
export type ReadStoryResponse = {
  story: Story;
};
```

### Update Story

`PATCH /api/stories/:storyId`

```ts
export type UpdateStoryResponse = {
  story: Story;
};
```

### Delete Story

`DELETE /api/stories/:storyId`

Response: `204 No Content`

## Story Analysis

Analysis is requested for one manuscript story.
The frontend may either select an existing settings story or provide `settingsText` directly.

```ts
export type AnalyzeStoryRequest = {
  settingsStoryId?: ID;
  settingsText?: string;
  options?: {
    useRag?: boolean;
    useGraph?: boolean;
    provider?: Provider;
  };
};
```

Rules:

- `settingsStoryId` or `settingsText` may be provided.
- If neither is provided, the backend resolves settings from the same project's `settings` stories, then other project stories, then the target manuscript itself as minimum context.
- The target manuscript is identified by `:storyId`.
- Analysis results are saved separately from the story.
- The response contains both the saved result metadata and the analysis payload.

### Request Story Analysis

`POST /api/stories/:storyId/analyses`

```ts
export type RequestStoryAnalysisResponse = {
  analysis: AnalysisResult;
};
```

## Backend Analyze Mapping

`POST /api/stories/:storyId/analyses` is the HTTP contract.
The backend should convert it into the internal `AnalyzeRequest` from `01-contract.md`.

```ts
const analyzeRequest: AnalyzeRequest = {
  projectId,
  projectTitle,
  genre,
  settingsText,
  manuscriptText: story.content,
  options
};
```

## Analysis Result

`response` uses the existing `AnalyzeResponse` shape from `01-contract.md`.

```ts
export type AnalysisResult = {
  id: ID;
  projectId: ID;
  storyId: ID;
  settingsStoryId?: ID;
  provider: Provider;
  fallbackUsed: boolean;
  summary: {
    issueCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  response: AnalyzeResponse;
  createdAt: ISODateTime;
};

export type AnalysisResultSummary = Omit<AnalysisResult, "response">;
```

### List Story Analysis Results

`GET /api/stories/:storyId/analyses?limit=20&offset=0`

```ts
export type ListStoryAnalysisResultsResponse = {
  analyses: AnalysisResultSummary[];
  page: PageInfo;
};
```

### Read Analysis Result

`GET /api/analyses/:analysisId`

```ts
export type ReadAnalysisResultResponse = {
  analysis: AnalysisResult;
};
```

## AnalyzeResponse

The saved `AnalysisResult.response` field must keep this shape.
World graph menu APIs are additive and must not remove `nodes` or `edges` from `AnalyzeResponse`.

```ts
export type AnalyzeResponse = {
  summary: {
    issueCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  issues: Issue[];
  nodes: StoryNode[];
  edges: StoryEdge[];
  evidence: Evidence[];
  providerInfo: {
    provider: Provider;
    fallbackUsed: boolean;
  };
};

export type Issue = {
  id: string;
  type:
    | "character_conflict"
    | "world_rule_conflict"
    | "timeline_conflict"
    | "causality_conflict"
    | "foreshadowing_gap";
  severity: "high" | "medium" | "low";
  title: string;
  manuscriptQuote: string;
  conflictingSetting: string;
  reason: string;
  suggestion: string;
  relatedNodeIds: string[];
  evidenceIds: string[];
};

export type StoryNode = {
  id: string;
  label: string;
  type: "character" | "event" | "rule" | "place" | "foreshadow" | "issue";
  importance: number;
  hasIssue: boolean;
};

export type StoryEdge = {
  source: string;
  target: string;
  label: string;
  type?: "relationship" | "causes" | "violates" | "located_at" | "foreshadows";
};

export type Evidence = {
  id: string;
  sourceType: "setting" | "manuscript" | "chunk";
  quote: string;
  chunkId?: string;
  score?: number;
};
```

## Status Codes

- `200 OK`: login, current user, read, list, and completed analysis requests
- `201 Created`: signup, project, story, or analysis result created
- `204 No Content`: logout succeeded
- `400 Bad Request`: invalid request body, query, or unsupported file type
- `401 Unauthorized`: login required
- `403 Forbidden`: authenticated user cannot access the resource
- `404 Not Found`: resource does not exist
- `500 Internal Server Error`: unexpected backend failure

## Minimum Frontend Flow

1. Sign up or log in with `/api/auth/signup` or `/api/auth/login`.
2. Keep using the backend session cookie with credentials enabled.
3. Create or select a project with `/api/projects`.
4. Create a settings story with `/api/projects/:projectId/stories`.
5. Create a manuscript story with `/api/projects/:projectId/stories`.
6. Request analysis with `/api/stories/:storyId/analyses`.
7. Show saved analysis history with `/api/stories/:storyId/analyses`.
8. Open one saved result with `/api/analyses/:analysisId`.
9. Open the project world graph with `/api/projects/:projectId/world-graph`.
