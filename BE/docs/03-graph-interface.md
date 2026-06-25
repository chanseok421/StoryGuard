# LangGraph Interface

The Prompt+LangGraph owner is responsible for turning request text and retrieved evidence into conflict cards and graph data.

## Input

```ts
export type GraphAnalysisInput = {
  request: AnalyzeRequest;
  evidence: Evidence[];
  relatedSettings: RelatedSetting[];
};
```

## Output

```ts
export type GraphAnalysisResult = {
  issues: Issue[];
  nodes: StoryNode[];
  edges: StoryEdge[];
};
```

## Function Contract

```ts
export async function runStoryAnalysis(
  input: GraphAnalysisInput
): Promise<GraphAnalysisResult>;
```

## Responsibilities

- Detect conflicts using the allowed `Issue.type` values.
- Assign `severity` as `high`, `medium`, or `low`.
- Create `StoryNode` and `StoryEdge` arrays for the Story Memory Graph.
- Link every issue to graph nodes through `relatedNodeIds`.
- Link every issue to supporting evidence through `evidenceIds`.

## MVP Workflow

The first LangGraph workflow can be simple:

1. Normalize request and evidence.
2. Detect conflicts.
3. Build issue cards.
4. Build graph nodes and edges.
5. Validate ids before returning.

## Implementation Stages

`runStoryAnalysis(input)` is the stable boundary. The internal implementation may
change by stage, but callers should keep using the same function.

### Stage 1: Rule-based demo

Use deterministic rules and keywords to return stable demo JSON.

- Good for hackathon integration and frontend/backend testing.
- May include sample-specific rules.
- Must still link `issues[].evidenceIds` to ids from `input.evidence`.
- Must still validate `relatedNodeIds` and graph edge endpoints before returning.

### Stage 2: Evidence-driven analyzer

Remove sample-specific titles, node ids, and fixed suggestions where possible.
Build issue candidates from `input.evidence`, `input.relatedSettings`, and
sentences in `request.manuscriptText`.

Expected behavior:

1. Extract candidate manuscript sentences.
2. Pair each sentence with related setting evidence.
3. Classify the pair into one allowed `Issue.type`.
4. Assign `severity` from the conflict type and evidence strength.
5. Generate issue text from the actual quotes, not fixed demo wording.
6. Build graph ids from detected entities or normalized labels.

### Stage 3: Model-backed LangGraph

Replace the rule engine with LangGraph nodes and a model provider such as Groq or
Ollama. The graph can be split like this:

1. `normalizeInput`: trim and normalize request/evidence.
2. `selectEvidence`: choose the most relevant evidence pairs.
3. `detectConflicts`: produce structured issue candidates.
4. `buildGraph`: create `StoryNode` and `StoryEdge` arrays.
5. `validateOutput`: remove broken ids and return safe arrays.

The model must not return directly to the API without validation.

## Output Safety

If the model cannot produce valid JSON, return a safe empty result:

```ts
{
  issues: [],
  nodes: [],
  edges: []
}
```

Backend will wrap this into a valid `AnalyzeResponse`.
