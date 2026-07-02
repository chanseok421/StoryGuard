/**
 * 설정 붕괴 검출 정확도 평가 하네스(라이브).
 * 라벨링된 케이스(설정+원고+정답 충돌)에 대해 deepagent를 실행하고,
 * 검출 결과를 정답과 대조해 recall / false-positive / 폴백률을 집계한다.
 *
 * 실행:
 *   npm run eval:detection            # C:\Secrets\storyguard.env (mini)
 *   DEEPAGENT_MODEL=gpt-4o EVAL_RUNS=2 npm run eval:detection
 *
 * 매칭 규칙: 검출된 issue가 정답과 "일치"하려면 issue.type이 같고,
 * issue 텍스트(제목/인용/근거)에 정답 키워드가 하나 이상 포함되어야 한다.
 */
process.env.AI_ANALYSIS_PROVIDER = "deepagent";

import type { GraphAnalysisInput, Issue } from "../shared/types.js";
import { runStoryAnalysisDetailed } from "./runStoryAnalysis.js";

type ExpectedConflict = { type: Issue["type"]; keywords: string[] };
type EvalCase = {
  name: string;
  settingsText: string;
  manuscriptText: string;
  expected: ExpectedConflict[]; // 빈 배열 = 충돌 없어야 함(정탐 테스트)
};

const CASES: EvalCase[] = [
  {
    name: "world_rule (부활 규칙 위반)",
    settingsText: "이 세계에서 죽은 사람은 완전히 부활시킬 수 없다. 시간 되돌리기는 사망 직전 3초까지만 가능하다.",
    manuscriptText: "하린은 민준의 손을 잡고 주문을 완성하자, 이미 죽었던 민준이 완전히 되살아났다.",
    expected: [{ type: "world_rule_conflict", keywords: ["부활", "되살", "죽"] }],
  },
  {
    name: "timeline (복귀 시점 모순)",
    settingsText: "민준은 왕궁 화재가 일어난 사흘 뒤에야 북부 전선에서 수도로 복귀했다.",
    manuscriptText: "왕궁 화재가 일어난 다음 날, 하린은 아직 수도에 도착하지 않은 민준과 함께 폐허를 조사했다.",
    expected: [{ type: "timeline_conflict", keywords: ["다음", "사흘", "복귀", "시점", "도착"] }],
  },
  {
    name: "character (불 공포증 불일치)",
    settingsText: "하린은 어릴 적 화재로 가족을 잃어, 불을 극도로 두려워하며 불 근처에는 가지 못한다.",
    manuscriptText: "불길이 치솟는 회랑 한가운데로, 하린은 망설임 없이 뛰어들어 단서를 찾았다.",
    expected: [{ type: "character_conflict", keywords: ["불", "두려", "공포", "성격"] }],
  },
  {
    name: "clean (충돌 없음 - 정탐 테스트)",
    settingsText: "하린은 검술의 달인이며, 푸른 검 '월광'을 항상 지니고 다닌다.",
    manuscriptText: "하린은 월광을 뽑아 들고, 익숙한 검술로 적들을 차례로 베어냈다.",
    expected: [], // 충돌이 없어야 정상
  },
];

function matches(issue: Issue, expected: ExpectedConflict): boolean {
  if (issue.type !== expected.type) return false;
  const text = `${issue.title}${issue.manuscriptQuote}${issue.conflictingSetting}${issue.reason}`;
  return expected.keywords.some((k) => text.includes(k));
}

function getRuns(): number {
  const n = Number.parseInt(process.env.EVAL_RUNS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function runOnce(c: EvalCase) {
  const input: GraphAnalysisInput = {
    request: { projectTitle: "eval", genre: "판타지", settingsText: c.settingsText, manuscriptText: c.manuscriptText },
    evidence: [],
    relatedSettings: [],
  };
  const started = Date.now();
  const result = await runStoryAnalysisDetailed(input);
  const issues = result.graph.issues;

  const caught = c.expected.filter((e) => issues.some((i) => matches(i, e))).length;
  const falsePositives = issues.filter((i) => !c.expected.some((e) => matches(i, e))).length;

  return {
    ms: Date.now() - started,
    fallback: result.fallbackUsed,
    provider: result.provider,
    expected: c.expected.length,
    caught,
    falsePositives,
    detected: issues.length,
  };
}

async function main() {
  const runs = getRuns();
  console.log(`\n=== 설정 붕괴 검출 평가 (model=${process.env.DEEPAGENT_MODEL ?? "default"}, runs/case=${runs}) ===\n`);

  let totExpected = 0;
  let totCaught = 0;
  let totFalsePos = 0;
  let totRuns = 0;
  let totFallback = 0;

  for (const c of CASES) {
    for (let r = 0; r < runs; r += 1) {
      const res = await runOnce(c);
      totRuns += 1;
      totFallback += res.fallback ? 1 : 0;
      totExpected += res.expected;
      totCaught += res.caught;
      totFalsePos += res.falsePositives;

      const recall = res.expected > 0 ? `${res.caught}/${res.expected}` : "n/a";
      console.log(
        `  ${c.name} [run ${r + 1}] → 검출 ${res.detected} | 정답검출 ${recall} | 오탐 ${res.falsePositives}` +
          ` | ${res.provider}${res.fallback ? "(FALLBACK)" : ""} | ${(res.ms / 1000).toFixed(0)}s`,
      );
    }
  }

  const recallPct = totExpected > 0 ? ((totCaught / totExpected) * 100).toFixed(0) : "n/a";
  console.log("\n--- 집계 ---");
  console.log(`  Recall(정답 충돌 검출률): ${totCaught}/${totExpected} = ${recallPct}%`);
  console.log(`  False Positives(오탐 합계): ${totFalsePos}`);
  console.log(`  Fallback(엔진 실패→규칙기반): ${totFallback}/${totRuns}`);
  console.log("");
}

main().catch((e) => {
  console.error("[eval] threw:", e);
  process.exit(1);
});
