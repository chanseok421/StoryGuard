import type { Evidence, RelatedSetting, RetrievalInput, RetrievalResult, StoryChunk } from "../shared/types.js";

const MAX_RELATED_SETTINGS = 5;

export async function retrieveEvidence(input: RetrievalInput): Promise<RetrievalResult> {
  try {
    const settingChunks = chunkSettings(input.settingsText);
    if (settingChunks.length === 0 || input.manuscriptText.trim().length === 0) {
      return emptyRetrievalResult();
    }

    const terms = extractSearchTerms(input.manuscriptText);
    const rankedChunks = settingChunks
      .map((chunk) => ({
        chunk,
        score: scoreChunk(chunk.text, terms),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RELATED_SETTINGS);

    const relatedSettings: RelatedSetting[] = rankedChunks.map(({ chunk, score }) => ({
      id: `rel_${chunk.id}`,
      title: chunk.metadata?.title ?? `관련 설정 ${chunk.metadata?.order ?? ""}`.trim(),
      quote: chunk.text,
      chunkId: chunk.id,
      score,
    }));

    const evidence: Evidence[] = rankedChunks.map(({ chunk, score }) => ({
      id: `ev_${chunk.id}`,
      sourceType: "setting",
      quote: chunk.text,
      chunkId: chunk.id,
      score,
    }));

    return {
      chunks: settingChunks,
      evidence,
      relatedSettings,
    };
  } catch {
    return emptyRetrievalResult();
  }
}

function chunkSettings(settingsText: string): StoryChunk[] {
  return settingsText
    .split(/\n{2,}|\r?\n-\s+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `chunk_setting_${String(index + 1).padStart(3, "0")}`,
      sourceType: "setting",
      text,
      metadata: {
        title: createChunkTitle(text, index),
        category: inferCategory(text),
        order: index + 1,
      },
    }));
}

function extractSearchTerms(text: string): string[] {
  const normalizedTerms = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  return [...new Set(normalizedTerms)];
}

function scoreChunk(text: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const matchCount = terms.filter((term) => text.includes(term)).length;
  return Number((matchCount / terms.length).toFixed(4));
}

function createChunkTitle(text: string, index: number): string {
  const firstSentence = text.split(/(?<=[.!?。！？])\s+|\n+/)[0]?.trim();
  if (!firstSentence) {
    return `설정 ${index + 1}`;
  }

  return firstSentence.length > 24 ? `${firstSentence.slice(0, 24)}...` : firstSentence;
}

function inferCategory(text: string): NonNullable<StoryChunk["metadata"]>["category"] {
  if (containsAny(text, ["인물", "주인공", "하린", "민준", "성격", "능력"])) {
    return "character";
  }
  if (containsAny(text, ["사건", "화재", "전쟁", "죽음", "복귀"])) {
    return "event";
  }
  if (containsAny(text, ["규칙", "금지", "가능", "불가", "세계"])) {
    return "rule";
  }
  if (containsAny(text, ["수도", "왕궁", "문", "장소", "마을"])) {
    return "place";
  }
  if (containsAny(text, ["복선", "단서", "나침반", "예언"])) {
    return "foreshadow";
  }
  return "other";
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function emptyRetrievalResult(): RetrievalResult {
  return {
    chunks: [],
    evidence: [],
    relatedSettings: [],
  };
}
