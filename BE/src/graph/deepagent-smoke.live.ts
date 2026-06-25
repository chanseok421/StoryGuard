/**
 * deepagent 루프 스모크 테스트(라이브). HTTP/임베딩 경로를 우회하고 provider만 직접 호출해
 * "에이전트가 search_settings 도구를 호출하고 유효 JSON을 반환하는지(= 루프가 닫히는지)" 확인한다.
 *
 * 실행:
 *   dotenv -e C:\Secrets\storyguard.env -- npx tsx src/graph/deepagent-smoke.live.ts
 */
process.env.AI_ANALYSIS_PROVIDER = "deepagent";

import type { GraphAnalysisInput } from "../shared/types.js";
import { runStoryAnalysisDetailed } from "./runStoryAnalysis.js";

const input: GraphAnalysisInput = {
  request: {
    projectTitle: "별의 왕국",
    genre: "판타지",
    settingsText: [
      "이 세계에서는 죽은 사람을 완전히 부활시킬 수 없다. 시간 되돌리기는 사망 직전 3초까지만 가능하다.",
      "민준은 왕궁 화재 사흘 뒤에야 북부 전선에서 수도로 복귀했다.",
      "푸른 나침반은 동쪽 문이 열릴 때만 빛나며, 비밀 통로를 찾는 핵심 단서다.",
    ].join("\n\n"),
    manuscriptText: [
      "하린은 민준의 손을 잡고 주문을 완성하자, 이미 죽었던 민준이 완전히 되살아났다.",
      "왕궁 화재가 일어난 다음 날, 하린은 아직 수도에 도착하지 않은 민준과 함께 폐허를 조사했다.",
      "하린은 별다른 단서 없이 숨겨진 동쪽 문을 찾아냈다.",
    ].join("\n"),
  },
  evidence: [],
  relatedSettings: [],
};

async function main() {
  console.log("[smoke] provider =", process.env.AI_ANALYSIS_PROVIDER);
  console.log("[smoke] model    =", process.env.DEEPAGENT_MODEL || "(provider default — openai: gpt-4o)");
  const started = Date.now();

  const result = await runStoryAnalysisDetailed(input);

  console.log(`[smoke] done in ${Date.now() - started}ms`);
  console.log("[smoke] provider used =", result.provider, "| fallbackUsed =", result.fallbackUsed);
  console.log("[smoke] issues =", result.graph.issues.length, "| nodes =", result.graph.nodes.length, "| edges =", result.graph.edges.length);
  for (const issue of result.graph.issues) {
    console.log(`  - [${issue.severity}] ${issue.type}: ${issue.title}`);
    console.log(`      원고: ${issue.manuscriptQuote}`);
    console.log(`      설정: ${issue.conflictingSetting}`);
  }

  if (result.fallbackUsed) {
    console.error("\n[smoke] ⚠️ FALLBACK USED — 에이전트가 유효 결과를 못 냈고 rule-based로 떨어짐.");
    process.exit(1);
  }
  if (result.graph.issues.length === 0) {
    console.error("\n[smoke] ⚠️ 이슈 0개 — 루프는 닫혔으나 충돌을 못 잡음(모델/프롬프트 확인 필요).");
    process.exit(2);
  }
  console.log("\n[smoke] ✅ 루프 닫힘 + 충돌 검출 성공.");
}

main().catch((error) => {
  console.error("[smoke] ❌ threw:", error);
  process.exit(1);
});
