import type { GraphAnalysisResult, Issue } from "../shared/types.js";

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

/**
 * 각 issue.manuscriptQuote 가 실제 원고에 존재하는지(=환각이 아닌지)를 결정적으로 판정한다.
 * 원고에 근거가 없는(지어낸) issue 목록을 반환한다. LLM 없이 문자열 근사 매칭이라 값싸고 재현 가능.
 *
 * self-correction 피드백 루프의 "검증 신호"로 쓰인다: 반환값이 비어있지 않으면 재수행 트리거.
 */
export function findUngroundedIssues(
  graph: GraphAnalysisResult,
  manuscriptText: string,
): Issue[] {
  const haystack = normalizeForMatch(manuscriptText);
  if (haystack.length === 0) {
    return [];
  }

  return (graph.issues ?? []).filter((issue) => {
    const quote = normalizeForMatch(issue.manuscriptQuote ?? "");
    // 너무 짧은 인용은 오탐이 잦아 판정 보류.
    if (quote.length < 4) {
      return false;
    }
    // 긴 인용은 모델이 줄이거나 '…'로 생략하는 경우가 있어 앞 40자만으로 근사한다.
    const probe = quote.length > 40 ? quote.slice(0, 40) : quote;
    return !haystack.includes(probe);
  });
}
