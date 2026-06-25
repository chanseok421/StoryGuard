import { randomUUID } from "node:crypto";

import { QdrantClient } from "@qdrant/js-client-rest";

import type {
  ChunkSourceType,
  StoredChunk,
  VectorMatch,
  VectorSearchOptions,
  VectorStore,
} from "./types.js";

const COLLECTION = process.env.QDRANT_COLLECTION?.trim() || "document_chunks";
/** bge-m3 임베딩 차원. 임베딩 모델을 바꾸면 이 값도 맞춰야 한다. */
const VECTOR_SIZE = Number(process.env.QDRANT_VECTOR_SIZE) || 1024;

type ChunkPayload = {
  userId: string;
  projectId: string;
  storyId: string;
  sourceType: ChunkSourceType;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
};

/** Qdrant 기반 VectorStore 구현. 컬렉션은 최초 사용 시 자동 생성된다. */
export class QdrantVectorStore implements VectorStore {
  private readonly client: QdrantClient;
  private ready: Promise<void> | null = null;

  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL?.trim() || "http://localhost:6333",
      apiKey: process.env.QDRANT_API_KEY?.trim() || undefined,
    });
  }

  private ensureCollection(): Promise<void> {
    if (!this.ready) {
      this.ready = this.initCollection();
    }
    return this.ready;
  }

  private async initCollection(): Promise<void> {
    const { exists } = await this.client.collectionExists(COLLECTION);
    if (!exists) {
      await this.client.createCollection(COLLECTION, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      });
    }

    // 필터 성능용 payload 인덱스. 이미 있으면 에러를 무시한다.
    for (const field of ["projectId", "sourceType", "storyId"] as const) {
      try {
        await this.client.createPayloadIndex(COLLECTION, {
          field_name: field,
          field_schema: "keyword",
        });
      } catch {
        /* 이미 생성됨 */
      }
    }
  }

  async upsertChunks(chunks: StoredChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }
    await this.ensureCollection();

    await this.client.upsert(COLLECTION, {
      wait: true,
      points: chunks.map((chunk) => ({
        id: randomUUID(),
        vector: chunk.embedding,
        payload: {
          userId: chunk.userId,
          projectId: chunk.projectId,
          storyId: chunk.storyId,
          sourceType: chunk.sourceType,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          metadata: chunk.metadata,
        } satisfies ChunkPayload,
      })),
    });
  }

  async deleteByStory(storyId: string): Promise<void> {
    await this.ensureCollection();
    await this.client.delete(COLLECTION, {
      wait: true,
      filter: { must: [{ key: "storyId", match: { value: storyId } }] },
    });
  }

  async search(options: VectorSearchOptions): Promise<VectorMatch[]> {
    await this.ensureCollection();

    const result = await this.client.search(COLLECTION, {
      vector: options.queryEmbedding,
      limit: options.topK,
      with_payload: true,
      filter: {
        must: [
          { key: "projectId", match: { value: options.projectId } },
          { key: "sourceType", match: { value: options.sourceType } },
        ],
      },
    });

    return result.map((point) => {
      const payload = (point.payload ?? {}) as Partial<ChunkPayload>;
      return {
        id: String(point.id),
        storyId: String(payload.storyId ?? ""),
        sourceType: (payload.sourceType ?? options.sourceType) as ChunkSourceType,
        chunkIndex: Number(payload.chunkIndex ?? 0),
        content: String(payload.content ?? ""),
        metadata: payload.metadata ?? {},
        similarity: point.score,
      };
    });
  }
}
