export type ID = string;
export type ISODateTime = string;

export type Provider = "groq" | "ollama" | "mock";

export type PageInfo = {
  limit: number;
  offset: number;
  total: number;
};

export type Severity = "high" | "medium" | "low";
export type SeverityFilter = Severity | "all";

export type IssueType =
  | "character_conflict"
  | "world_rule_conflict"
  | "timeline_conflict"
  | "causality_conflict"
  | "foreshadowing_gap";

export type StoryDocumentType = "settings" | "manuscript";
export type StorySourceType = "manual";

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

export type Issue = {
  id: string;
  type: IssueType;
  severity: Severity;
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

export type WorldGraph = {
  nodes: StoryNode[];
  edges: StoryEdge[];
};

export type ReadProjectWorldGraphResponse = {
  graph: WorldGraph;
  updatedAt: ISODateTime;
};

export type Evidence = {
  id: string;
  sourceType: "setting" | "manuscript" | "chunk";
  quote: string;
  chunkId?: string;
  score?: number;
};

export type AnalyzeResponse = {
  summary: SeveritySummary;
  issues: Issue[];
  nodes: StoryNode[];
  edges: StoryEdge[];
  evidence: Evidence[];
  providerInfo: {
    provider: Provider;
    fallbackUsed: boolean;
  };
};

export type SeveritySummary = {
  issueCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
};

export type AnalysisResult = {
  id: ID;
  projectId: ID;
  storyId: ID;
  settingsStoryId?: ID;
  provider: Provider;
  fallbackUsed: boolean;
  summary: SeveritySummary;
  response: AnalyzeResponse;
  createdAt: ISODateTime;
};

export type AnalysisResultSummary = Omit<AnalysisResult, "response">;
