import { MemoryVectorStore } from "./memoryVectorStore.js";
import { PgVectorStore } from "./pgVectorStore.js";
import { QdrantVectorStore } from "./qdrantVectorStore.js";
import type { VectorStore } from "./types.js";

export type {
  ChunkSourceType,
  StoredChunk,
  VectorMatch,
  VectorSearchOptions,
  VectorStore,
} from "./types.js";
export { MemoryVectorStore } from "./memoryVectorStore.js";
export { PgVectorStore } from "./pgVectorStore.js";
export { QdrantVectorStore } from "./qdrantVectorStore.js";

/**
 * VECTOR_STORE 환경변수로 구현체를 고른다(기본 qdrant).
 * 다른 벡터DB를 붙일 땐 여기에 한 줄만 추가하면 된다.
 */
export function createVectorStore(): VectorStore {
  const kind = process.env.VECTOR_STORE?.trim() || "qdrant";

  switch (kind) {
    case "memory":
      return new MemoryVectorStore();
    case "pgvector":
      return new PgVectorStore();
    case "qdrant":
    default:
      return new QdrantVectorStore();
  }
}
