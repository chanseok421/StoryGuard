export type ID = string;
export type ISODateTime = string;
export type Provider = "groq" | "ollama" | "mock" | "openai";

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

export type SignupResponse = AuthResponse;
export type LoginResponse = AuthResponse;

export type CurrentUserResponse = {
  user: User;
};

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

export type CreateProjectResponse = {
  project: Project;
};

export type UpdateProjectResponse = {
  project: Project;
};

export type ListProjectsResponse = {
  projects: Project[];
  page: PageInfo;
};

export type StorySourceType = "manual";
export type StoryDocumentType = "settings" | "manuscript";
export type EmbeddingStatus = "pending" | "processing" | "ready" | "failed";

export type Story = {
  id: ID;
  projectId: ID;
  title: string;
  documentType: StoryDocumentType;
  content: string;
  sourceType: StorySourceType;
  embeddingStatus: EmbeddingStatus;
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

export type CreateStoryResponse = {
  story: Story;
};

export type UpdateStoryResponse = {
  story: Story;
};

export type ListStoriesQuery = {
  documentType?: StoryDocumentType;
  limit?: number;
  offset?: number;
};

export type ListStoriesResponse = {
  stories: StorySummary[];
  page: PageInfo;
};

export type ReadStoryResponse = {
  story: Story;
};

export type AnalyzeStoryRequest = {
  settingsStoryId?: ID;
  settingsText?: string;
  options?: {
    useRag?: boolean;
    useGraph?: boolean;
    provider?: Provider;
  };
};

export type RequestStoryAnalysisResponse = {
  analysis: AnalysisResult;
};

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

export type ListStoryAnalysisResultsResponse = {
  analyses: AnalysisResultSummary[];
  page: PageInfo;
};

export type ReadAnalysisResultResponse = {
  analysis: AnalysisResult;
};

export type WorldGraph = {
  nodes: StoryNode[];
  edges: StoryEdge[];
};

export type ReadProjectWorldGraphResponse = {
  graph: WorldGraph;
  updatedAt: ISODateTime;
};

export type AnalyzeRequest = {
  projectId?: string;
  projectTitle: string;
  genre?: string;
  settingsText: string;
  manuscriptText: string;
  options?: {
    useRag?: boolean;
    useGraph?: boolean;
    provider?: Provider;
  };
};

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

export type StoryChunk = {
  id: string;
  sourceType: "setting" | "manuscript";
  text: string;
  metadata?: {
    title?: string;
    category?: "character" | "event" | "rule" | "place" | "foreshadow" | "other";
    order?: number;
  };
};

export type RelatedSetting = {
  id: string;
  title: string;
  quote: string;
  chunkId?: string;
  score?: number;
};

export type RetrievalInput = {
  projectId?: string;
  settingsText: string;
  manuscriptText: string;
};

export type RetrievalResult = {
  chunks: StoryChunk[];
  evidence: Evidence[];
  relatedSettings: RelatedSetting[];
};

export type GraphAnalysisInput = {
  request: AnalyzeRequest;
  evidence: Evidence[];
  relatedSettings: RelatedSetting[];
};

export type GraphAnalysisResult = {
  issues: Issue[];
  nodes: StoryNode[];
  edges: StoryEdge[];
};
