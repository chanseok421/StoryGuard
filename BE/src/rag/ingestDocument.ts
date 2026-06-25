import type { StoryDocumentType } from "../shared/types.js";
import { logger } from "../shared/logger.js";
import { chunkDocument } from "./chunkDocument.js";
import { createEmbeddings } from "./embeddings.js";
import { createVectorStore } from "./vectorStore/index.js";
import type { ChunkSourceType, StoredChunk } from "./vectorStore/types.js";

export interface IngestParams {
  storyId: string;
  userId: string;
  projectId: string;
  documentType: StoryDocumentType;
  content: string;
}

export type EmbeddingStatus = "pending" | "processing" | "ready" | "failed";

/** story_documents.document_type → 청크 source_type */
function toChunkSourceType(documentType: StoryDocumentType): ChunkSourceType {
  return documentType === "settings" ? "setting" : "manuscript";
}

async function setStatus(storyId: string, status: EmbeddingStatus): Promise<void> {
  logger.info("ingest status changed", { storyId, status });
}

/**
 * 문서 1건을 청킹→임베딩→벡터 저장한다.
 * 재저장 시 기존 청크를 지우고 다시 넣어 멱등성을 보장한다.
 */
export async function ingestStoryDocument(params: IngestParams): Promise<void> {
  const sourceType = toChunkSourceType(params.documentType);
  await setStatus(params.storyId, "processing");

  try {
    const chunks = chunkDocument(params.content, sourceType);
    const vectorStore = createVectorStore();

    // 항상 기존 청크부터 제거(재저장/수정 멱등성).
    await vectorStore.deleteByStory(params.storyId);

    if (chunks.length === 0) {
      await setStatus(params.storyId, "ready");
      return;
    }

    const embeddings = await createEmbeddings();
    const vectors = await embeddings.embedDocuments(chunks.map((chunk) => chunk.content));

    const stored: StoredChunk[] = chunks.map((chunk, index) => ({
      userId: params.userId,
      projectId: params.projectId,
      storyId: params.storyId,
      sourceType,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: vectors[index],
    }));

    await vectorStore.upsertChunks(stored);
    await setStatus(params.storyId, "ready");
  } catch (error) {
    logger.error("ingest failed", {
      storyId: params.storyId,
      error,
    });
    await setStatus(params.storyId, "failed");
  }
}

/**
 * 라우트에서 응답을 막지 않고 백그라운드로 인게스트를 돌린다(fire-and-forget).
 * 실패해도 이미 status='failed'로 기록되므로 여기선 삼킨다.
 */
export function scheduleIngest(params: IngestParams): void {
  void ingestStoryDocument(params).catch((error) => {
    logger.error("ingest schedule unexpected error", {
      storyId: params.storyId,
      error,
    });
  });
}
