import assert from "node:assert/strict";
import test from "node:test";
import { validateGraphAnalysisResult } from "./validateGraphAnalysisResult.js";
import type { Evidence } from "../shared/types.js";

const evidence: Evidence[] = [
  { id: "ev_setting_1", sourceType: "setting", quote: "죽은 사람은 부활할 수 없다." },
];

test("validateGraphAnalysisResult removes references that are not in evidence or nodes", () => {
  const result = validateGraphAnalysisResult(
    {
      issues: [
        {
          id: "issue_001",
          type: "world_rule_conflict",
          severity: "high",
          title: "부활 규칙 충돌",
          manuscriptQuote: "그는 되살아났다.",
          conflictingSetting: "죽은 사람은 부활할 수 없다.",
          reason: "원고가 설정의 금지 규칙을 위반한다.",
          suggestion: "부활 대신 생존 회피 장면으로 바꾸세요.",
          relatedNodeIds: ["issue_001", "missing_node"],
          evidenceIds: ["ev_setting_1", "missing_evidence"],
        },
      ],
      nodes: [
        { id: "issue_001", label: "부활 규칙 충돌", type: "issue", importance: 5, hasIssue: true },
      ],
      edges: [
        { source: "issue_001", target: "missing_node", label: "잘못된 연결", type: "violates" },
      ],
    },
    evidence,
  );

  assert.deepEqual(result.issues[0]?.relatedNodeIds, ["issue_001"]);
  assert.deepEqual(result.issues[0]?.evidenceIds, ["ev_setting_1"]);
  assert.deepEqual(result.edges, []);
});

test("validateGraphAnalysisResult returns an empty graph for malformed model output", () => {
  const result = validateGraphAnalysisResult({ issues: "not-array", nodes: [], edges: [] }, evidence);

  assert.deepEqual(result, { issues: [], nodes: [], edges: [] });
});
