import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

import { createOllamaEmbeddings } from "./ollama-embeddings.js";
import type {
  Evidence,
  RelatedSetting,
  RetrievalInput,
  RetrievalResult,
  StoryChunk,
} from "../shared/types.js";

const MAX_RELATED_SETTINGS = 5;

export interface EmbeddingEvidenceOptions {
  /** 주입하면 그걸 사용(테스트용 fake 등). 미주입 시 Ollama bge-m3. */
  embeddings?: EmbeddingsInterface;
  /** 반환할 최대 근거 수 (기본 5) */
  topK?: number;
}

/**
 * 팀 RAG 계약(`retrieveEvidence(input): RetrievalResult`)의 embedding 구현.
 *
 * - 입출력은 keyword 버전(src/rag/retrieveEvidence.ts)과 100% 동일한 계약.
 * - 내부만 의미 검색(bge-m3)으로 교체 → 글자가 안 겹치는 의역도 근거를 찾음.
 * - 실패(임베딩 불가/빈 입력) 시 throw하지 않고 빈 배열 반환(계약 규칙).
 *
 * Backend는 Ollama가 있으면 이 함수를, 없으면 keyword 버전을 쓰면 된다.
 */
export async function retrieveEvidenceWithEmbeddings(
  input: RetrievalInput,
  options: EmbeddingEvidenceOptions = {},
): Promise<RetrievalResult> {
  try {
    const chunks = chunkSettingsText(input.settingsText);
    if (chunks.length === 0 || input.manuscriptText.trim().length === 0) {
      return emptyResult();
    }

    const topK = Math.min(options.topK ?? MAX_RELATED_SETTINGS, chunks.length);
    const embeddings = options.embeddings ?? (await createOllamaEmbeddings());

    const store = await MemoryVectorStore.fromDocuments(
      chunks.map(
        (chunk) =>
          new Document({
            id: chunk.id,
            pageContent: chunk.text,
            metadata: chunk,
          }),
      ),
      embeddings,
    );

    const ranked = await store.similaritySearchWithScore(
      input.manuscriptText,
      topK,
    );

    const evidence: Evidence[] = [];
    const relatedSettings: RelatedSetting[] = [];

    for (const [document, score] of ranked) {
      const chunk = document.metadata as StoryChunk;
      const roundedScore = Number(score.toFixed(4));

      evidence.push({
        id: `ev_${chunk.id}`,
        sourceType: "setting",
        quote: chunk.text,
        chunkId: chunk.id,
        score: roundedScore,
      });

      relatedSettings.push({
        id: `rel_${chunk.id}`,
        title: chunk.metadata?.title ?? createChunkTitle(chunk.text, 0),
        quote: chunk.text,
        chunkId: chunk.id,
        score: roundedScore,
      });
    }

    return { chunks, evidence, relatedSettings };
  } catch {
    return emptyResult();
  }
}

/** 설정집 원문을 빈 줄/"- " 기준으로 잘라 팀 StoryChunk 모양으로 만든다. */
function chunkSettingsText(settingsText: string): StoryChunk[] {
  return settingsText
    .replace(/\r\n/g, "\n") // CRLF 정규화 → 빈 줄 분리가 OS 무관하게 동작
    .split(/\n{2,}|\n-\s+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `chunk_setting_${String(index + 1).padStart(3, "0")}`,
      sourceType: "setting" as const,
      text,
      metadata: {
        title: createChunkTitle(text, index),
        category: inferCategory(text),
        order: index + 1,
      },
    }));
}

function createChunkTitle(text: string, index: number): string {
  const firstSentence = text.split(/(?<=[.!?。！？])\s+|\n+/)[0]?.trim();
  if (!firstSentence) {
    return `설정 ${index + 1}`;
  }
  return firstSentence.length > 24
    ? `${firstSentence.slice(0, 24)}...`
    : firstSentence;
}

function inferCategory(text: string): NonNullable<StoryChunk["metadata"]>["category"] {
  if (containsAny(text, ["인물", "주인공", "하린", "민준", "성격", "능력"])) {
    return "character";
  }
  if (containsAny(text, ["사건", "화재", "전쟁", "죽음", "복귀", "사망"])) {
    return "event";
  }
  if (containsAny(text, ["규칙", "금지", "가능", "불가", "세계", "법칙"])) {
    return "rule";
  }
  if (containsAny(text, ["수도", "왕궁", "문", "장소", "마을", "폐역"])) {
    return "place";
  }
  if (containsAny(text, ["복선", "단서", "나침반", "예언", "수첩"])) {
    return "foreshadow";
  }
  return "other";
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function emptyResult(): RetrievalResult {
  return { chunks: [], evidence: [], relatedSettings: [] };
}
