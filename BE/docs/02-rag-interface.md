# RAG Interface

The RAG owner is responsible for finding setting evidence that helps explain conflicts. The first version may use keyword retrieval. Embedding retrieval can come later.

## Input

```ts
export type RetrievalInput = {
  projectId?: string;
  settingsText: string;
  manuscriptText: string;
};
```

## Output

```ts
export type RetrievalResult = {
  chunks: StoryChunk[];
  evidence: Evidence[];
  relatedSettings: RelatedSetting[];
};
```

The RAG implementation only needs to return these three arrays. Backend and LangGraph should not depend on any internal retriever details.

## Function Contract

```ts
export async function retrieveEvidence(
  input: RetrievalInput
): Promise<RetrievalResult>;
```

## StoryChunk

```ts
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
```

## RelatedSetting

```ts
export type RelatedSetting = {
  id: string;
  title: string;
  quote: string;
  chunkId?: string;
  score?: number;
};
```

## MVP Defaults

- Start with setting-item chunks if the sample settings are structured.
- Use paragraph chunks as a fallback when settings are plain text.
- Return top 3 to 5 related settings.
- If retrieval fails, return empty arrays instead of throwing to the API layer.

## Handoff to LangGraph

Backend will pass `evidence` and `relatedSettings` into `runStoryAnalysis`. RAG does not need to create final issues. RAG only needs to provide useful supporting quotes.

