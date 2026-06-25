export type ChunkSourceType = "setting" | "manuscript";

/** 임베딩까지 끝난, 저장 직전의 청크. */
export interface StoredChunk {
  userId: string;
  projectId: string;
  storyId: string;
  sourceType: ChunkSourceType;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}

export interface VectorSearchOptions {
  projectId: string;
  sourceType: ChunkSourceType;
  queryEmbedding: number[];
  topK: number;
}

export interface VectorMatch {
  id: string;
  storyId: string;
  sourceType: ChunkSourceType;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  /** 코사인 유사도 (1에 가까울수록 유사). */
  similarity: number;
}

/**
 * 벡터 저장/검색 포트. 기본 구현은 Supabase pgvector이고,
 * 구현체만 갈아끼우면(Qdrant 등) 나머지 코드는 그대로 둘 수 있다.
 */
export interface VectorStore {
  /** 임베딩 포함 청크들을 저장한다. */
  upsertChunks(chunks: StoredChunk[]): Promise<void>;
  /** 특정 문서의 모든 청크를 삭제한다(재저장 멱등성용). */
  deleteByStory(storyId: string): Promise<void>;
  /** 쿼리 임베딩으로 유사 청크 topK를 검색한다. */
  search(options: VectorSearchOptions): Promise<VectorMatch[]>;
}
