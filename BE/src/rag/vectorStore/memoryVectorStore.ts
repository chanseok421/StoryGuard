import type {
  StoredChunk,
  VectorMatch,
  VectorSearchOptions,
  VectorStore,
} from "./types.js";

type InternalChunk = StoredChunk & { id: string };

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 인메모리 VectorStore 구현. 테스트와 DB 없는 로컬 폴백용.
 * pgvector와 동일한 계약을 코사인 유사도로 흉내 낸다.
 */
export class MemoryVectorStore implements VectorStore {
  private chunks: InternalChunk[] = [];
  private nextId = 1;

  async upsertChunks(chunks: StoredChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.push({ ...chunk, id: `mem_${this.nextId}` });
      this.nextId += 1;
    }
  }

  async deleteByStory(storyId: string): Promise<void> {
    this.chunks = this.chunks.filter((chunk) => chunk.storyId !== storyId);
  }

  async search(options: VectorSearchOptions): Promise<VectorMatch[]> {
    return this.chunks
      .filter(
        (chunk) =>
          chunk.projectId === options.projectId &&
          chunk.sourceType === options.sourceType,
      )
      .map((chunk) => ({
        id: chunk.id,
        storyId: chunk.storyId,
        sourceType: chunk.sourceType,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        metadata: chunk.metadata,
        similarity: cosineSimilarity(options.queryEmbedding, chunk.embedding),
      }))
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, options.topK);
  }
}
