import type { RetrievalMatch, SettingChunk } from "./types.js";

const KOREAN_PARTICLES = [
  "으로부터",
  "에서부터",
  "에게서",
  "까지",
  "부터",
  "처럼",
  "보다",
  "에게",
  "한테",
  "께서",
  "으로",
  "에서",
  "하고",
  "이며",
  "로",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "의",
  "와",
  "과",
  "도",
  "만",
];

function normalizeToken(token: string): string {
  const normalized = token.toLocaleLowerCase("ko-KR").trim();

  for (const particle of KOREAN_PARTICLES) {
    if (
      normalized.length > particle.length + 1 &&
      normalized.endsWith(particle)
    ) {
      return normalized.slice(0, -particle.length);
    }
  }

  return normalized;
}

function tokenize(text: string): string[] {
  const rawTokens = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [
    ...new Set(
      rawTokens
        .map(normalizeToken)
        .filter((token) => token.length > 1),
    ),
  ];
}

function intersect(queryTerms: Set<string>, documentTerms: string[]): string[] {
  return documentTerms.filter((term) => queryTerms.has(term));
}

function scoreChunk(
  queryTerms: Set<string>,
  chunk: SettingChunk,
): Omit<RetrievalMatch, "rank"> {
  const entityTokens = chunk.metadata.entities.flatMap(tokenize);
  const titleTokens = tokenize(chunk.metadata.title);
  const contentTokens = tokenize(chunk.pageContent);

  const matchedEntities = intersect(queryTerms, entityTokens);
  const matchedTitleTerms = intersect(queryTerms, titleTokens);
  const matchedContentTerms = intersect(queryTerms, contentTokens);
  const matchedTerms = [
    ...new Set([
      ...matchedEntities,
      ...matchedTitleTerms,
      ...matchedContentTerms,
    ]),
  ];

  const score =
    matchedEntities.length * 4 +
    matchedTitleTerms.length * 2 +
    matchedContentTerms.length;

  return {
    chunk,
    score,
    matchedTerms,
    matchedEntities,
  };
}

export function retrieveByKeyword(
  query: string,
  chunks: SettingChunk[],
  topK = 3,
): RetrievalMatch[] {
  if (!Number.isInteger(topK) || topK < 1) {
    throw new Error("topK must be a positive integer.");
  }

  const queryTerms = new Set(tokenize(query));

  if (queryTerms.size === 0) {
    return [];
  }

  return chunks
    .map((chunk) => scoreChunk(queryTerms, chunk))
    .filter((match) => match.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.chunk.metadata.settingOrder - right.chunk.metadata.settingOrder,
    )
    .slice(0, topK)
    .map((match, index) => ({ ...match, rank: index + 1 }));
}
