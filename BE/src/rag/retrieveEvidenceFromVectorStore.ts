import type { EmbeddingsInterface } from "@langchain/core/embeddings";

import type {
  Evidence,
  RelatedSetting,
  RetrievalResult,
  StoryChunk,
} from "../shared/types.js";
import { chunkDocument } from "./chunkDocument.js";
import { createEmbeddings } from "./embeddings.js";
import { createVectorStore } from "./vectorStore/index.js";
import type { VectorMatch, VectorStore } from "./vectorStore/types.js";

const MAX_RELATED_SETTINGS = 5;
/** 원고 청크 1개당 가져올 설정 청크 수. */
const PER_CHUNK_K = 3;

export interface VectorRetrievalInput {
  projectId: string;
  manuscriptText: string;
}

export interface VectorRetrievalOptions {
  /** 미주입 시 EMBEDDING_PROVIDER(기본 ollama). 테스트용 fake 주입 가능. */
  embeddings?: EmbeddingsInterface;
  /** 미주입 시 VECTOR_STORE(기본 pgvector). */
  vectorStore?: VectorStore;
  /** 최종 반환할 설정 근거 수(기본 5). */
  topK?: number;
}

function emptyResult(): RetrievalResult {
  return { chunks: [], evidence: [], relatedSettings: [] };
}

/** 여러 원고 청크 검색 결과를 설정 청크 id 기준으로 합치고 최고 점수만 남긴다. */
function mergeMatches(matchLists: VectorMatch[][]): VectorMatch[] {
  const best = new Map<string, VectorMatch>();
  for (const matches of matchLists) {
    for (const match of matches) {
      const existing = best.get(match.id);
      if (!existing || match.similarity > existing.similarity) {
        best.set(match.id, match);
      }
    }
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity);
}

/**
 * 사전 임베딩된 설정 청크(vectorDB)에서 원고와 관련된 근거를 검색한다.
 * 입출력 계약은 기존 retrieveEvidence/retrieveEvidenceWithEmbeddings와 동일(RetrievalResult).
 * 설정이 아직 ingest되지 않았거나 실패하면 빈 결과를 반환한다(throw 안 함).
 */
export async function retrieveEvidenceFromVectorStore(
  input: VectorRetrievalInput,
  options: VectorRetrievalOptions = {},
): Promise<RetrievalResult> {
  try {
    if (!input.projectId || input.manuscriptText.trim().length === 0) {
      return emptyResult();
    }

    const topK = options.topK ?? MAX_RELATED_SETTINGS;
    const manuscriptChunks = chunkDocument(input.manuscriptText, "manuscript");
    if (manuscriptChunks.length === 0) {
      return emptyResult();
    }

    const embeddings = options.embeddings ?? (await createEmbeddings());
    const vectorStore = options.vectorStore ?? createVectorStore();

    const queryVectors = await embeddings.embedDocuments(
      manuscriptChunks.map((chunk) => chunk.content),
    );

    const matchLists = await Promise.all(
      queryVectors.map((queryEmbedding) =>
        vectorStore.search({
          projectId: input.projectId,
          sourceType: "setting",
          queryEmbedding,
          topK: PER_CHUNK_K,
        }),
      ),
    );

    const ranked = mergeMatches(matchLists).slice(0, topK);
    if (ranked.length === 0) {
      return emptyResult();
    }

    const chunks: StoryChunk[] = [];
    const evidence: Evidence[] = [];
    const relatedSettings: RelatedSetting[] = [];

    for (const match of ranked) {
      const score = Number(match.similarity.toFixed(4));
      const title =
        typeof match.metadata?.title === "string" && match.metadata.title.trim()
          ? (match.metadata.title as string)
          : `관련 설정 ${match.chunkIndex + 1}`;

      chunks.push({
        id: match.id,
        sourceType: "setting",
        text: match.content,
        metadata: { title },
      });

      evidence.push({
        id: `ev_${match.id}`,
        sourceType: "setting",
        quote: match.content,
        chunkId: match.id,
        score,
      });

      relatedSettings.push({
        id: `rel_${match.id}`,
        title,
        quote: match.content,
        chunkId: match.id,
        score,
      });
    }

    return { chunks, evidence, relatedSettings };
  } catch {
    return emptyResult();
  }
}
