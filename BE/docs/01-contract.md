# Analyze API Contract

This document is the MVP contract for StoryGuard. All teams should treat `AnalyzeResponse` as the source of truth.

## Endpoint Goal

`/api/analyze` receives a setting bible and a new manuscript scene, then returns:

- conflict cards for the UI
- evidence quotes for each card
- Story Memory Graph nodes and edges
- provider fallback metadata

The API must always return an `AnalyzeResponse` shaped JSON. If Groq, Ollama, RAG, or LangGraph fails, the backend should return a fallback response with the same shape.

## AnalyzeRequest

```ts
export type AnalyzeRequest = {
  projectId?: string;
  projectTitle: string;
  genre?: string;
  settingsText: string;
  manuscriptText: string;
  options?: {
    useRag?: boolean;
    useGraph?: boolean;
    provider?: "groq" | "ollama" | "mock";
  };
};
```

Rules:

- `projectTitle`, `settingsText`, and `manuscriptText` are required.
- `projectId` is optional for MVP because login/storage may be deferred.
- `options.provider` is a preference, not a guarantee. The backend may still fall back to `mock`.

## AnalyzeResponse

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
    provider: "groq" | "ollama" | "mock";
    fallbackUsed: boolean;
  };
};
```

Rules:

- `summary.issueCount` must equal `issues.length`.
- Severity counts must match the `issues` array.
- Every `issues[].relatedNodeIds` id must exist in `nodes`.
- Every `issues[].evidenceIds` id must exist in `evidence`.
- `providerInfo.provider` is the final provider that produced the returned response.
- `providerInfo.fallbackUsed` is `true` when the requested provider failed or was bypassed.

## Issue

```ts
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
```

UI expectations:

- One issue maps to one conflict card.
- `manuscriptQuote` is the problem sentence from the new manuscript.
- `conflictingSetting` is the older setting or rule being violated.
- `reason` explains why the two conflict.
- `suggestion` should be directly usable by a writer.
- `relatedNodeIds` highlights graph nodes when the card is clicked.
- `evidenceIds` opens the supporting quote panel.

## StoryNode

```ts
export type StoryNode = {
  id: string;
  label: string;
  type: "character" | "event" | "rule" | "place" | "foreshadow" | "issue";
  importance: number;
  hasIssue: boolean;
};
```

Rules:

- Use stable ids such as `char_harin`, `rule_no_resurrection`, or `issue_001`.
- `importance` should be a number from `1` to `5`.
- `hasIssue` should be `true` when a node is directly connected to a conflict card.

## StoryEdge

```ts
export type StoryEdge = {
  source: string;
  target: string;
  label: string;
  type?: "relationship" | "causes" | "violates" | "located_at" | "foreshadows";
};
```

Rules:

- `source` and `target` must be valid `StoryNode.id` values.
- `label` is UI-facing text shown near or beside a graph edge.
- `type` helps the graph choose line color or style.

## Evidence

```ts
export type Evidence = {
  id: string;
  sourceType: "setting" | "manuscript" | "chunk";
  quote: string;
  chunkId?: string;
  score?: number;
};
```

Rules:

- `sourceType` tells the UI where the quote came from.
- `chunkId` links evidence back to RAG chunks when available.
- `score` is optional and may be omitted for mock/manual evidence.

## Failure Contract

On failure, do not return a different error object. Return an `AnalyzeResponse` with:

- `summary.issueCount` set to `0` when no reliable result exists
- empty `issues`, `nodes`, `edges`, and `evidence` arrays if needed
- `providerInfo.provider: "mock"`
- `providerInfo.fallbackUsed: true`

