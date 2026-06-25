import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

import type {
  EmbeddingRetrievalMatch,
  SettingChunk,
  SettingChunkMetadata,
} from "./types.js";

export interface EmbeddingIndex {
  retrieve(query: string, topK?: number): Promise<EmbeddingRetrievalMatch[]>;
}

function validateTopK(topK: number): void {
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("topK must be a positive integer.");
  }
}

export async function createEmbeddingIndex(
  chunks: SettingChunk[],
  embeddings: EmbeddingsInterface,
): Promise<EmbeddingIndex> {
  if (chunks.length === 0) {
    throw new Error("At least one setting chunk is required.");
  }

  const documents = chunks.map(
    (chunk) =>
      new Document<SettingChunkMetadata>({
        id: chunk.id,
        pageContent: chunk.pageContent,
        metadata: chunk.metadata,
      }),
  );
  const vectorStore = await MemoryVectorStore.fromDocuments(
    documents,
    embeddings,
  );

  return {
    async retrieve(query: string, topK = 3) {
      validateTopK(topK);

      if (!query.trim()) {
        return [];
      }

      const results = await vectorStore.similaritySearchWithScore(query, topK);

      return results.map(([document, score], index) => ({
        pageContent: document.pageContent,
        metadata: document.metadata as SettingChunkMetadata,
        rank: index + 1,
        score,
      }));
    },
  };
}
