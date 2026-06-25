import type { ChunkSourceType } from "./vectorStore/types.js";

export interface DocumentChunk {
  chunkIndex: number;
  content: string;
  metadata: {
    sourceType: ChunkSourceType;
    title: string;
  };
}

/** 청크 1개의 목표 최대 길이(문자). 이보다 긴 문단은 슬라이딩 윈도우로 분할. */
const MAX_CHARS = 800;
/** 윈도우 분할 시 인접 청크 간 겹침(문맥 보존용). */
const OVERLAP = 100;

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

/** 빈 줄과 "- " 불릿을 경계로 문단을 나눈다. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|(?:^|\n)\s*-\s+/g)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** MAX_CHARS를 넘는 문단을 OVERLAP만큼 겹치며 잘게 나눈다. */
function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHARS) {
    return [paragraph];
  }

  const windows: string[] = [];
  const step = MAX_CHARS - OVERLAP;
  for (let start = 0; start < paragraph.length; start += step) {
    windows.push(paragraph.slice(start, start + MAX_CHARS));
    if (start + MAX_CHARS >= paragraph.length) {
      break;
    }
  }
  return windows;
}

function createTitle(content: string): string {
  const firstLine = content.split(/[.!?\n]/)[0]?.trim() ?? "";
  const compact = firstLine.replace(/\s+/g, " ");
  return compact.length > 40 ? `${compact.slice(0, 40)}…` : compact;
}

/**
 * 저장된 문서 원문을 임베딩 단위 청크로 나눈다.
 * settings/manuscript 공용. 빈 입력은 빈 배열.
 */
export function chunkDocument(
  content: string,
  sourceType: ChunkSourceType,
): DocumentChunk[] {
  const normalized = normalizeText(content);
  if (!normalized) {
    return [];
  }

  const pieces = splitParagraphs(normalized).flatMap(splitLongParagraph);

  return pieces.map((piece, index) => ({
    chunkIndex: index,
    content: piece,
    metadata: {
      sourceType,
      title: createTitle(piece),
    },
  }));
}
