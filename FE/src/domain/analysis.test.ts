import { describe, expect, it } from "vitest";
import {
  countNonWhitespaceCharacters,
  filterIssuesBySeverity,
  getPriorityIssues,
  getSeveritySummary,
} from "./analysis";
import type { Issue } from "./types";

const issues: Issue[] = [
  {
    id: "timeline-1",
    type: "timeline_conflict",
    severity: "medium",
    title: "회차 순서 충돌",
    manuscriptQuote: "새벽 이후에 다시 전날 밤으로 돌아갔다.",
    conflictingSetting: "앞선 원고에서는 새벽 이후 이동이 불가능했다.",
    reason: "시간 순서가 앞선 원고와 맞지 않는다.",
    suggestion: "장면 순서를 조정한다.",
    relatedNodeIds: [],
    evidenceIds: ["evidence-3"],
  },
  {
    id: "character-1",
    type: "character_conflict",
    severity: "high",
    title: "세린의 마력 속성",
    manuscriptQuote: "세린이 검은 마력을 방출했다.",
    conflictingSetting: "12화에서 세린은 빛의 마력만 사용한다고 말했다.",
    reason: "인물 능력 설정이 이전 원고와 충돌한다.",
    suggestion: "빛 계열 능력으로 수정하거나 검은 마력의 근거를 추가한다.",
    relatedNodeIds: ["node-serin"],
    evidenceIds: ["evidence-1"],
  },
  {
    id: "world-1",
    type: "world_rule_conflict",
    severity: "low",
    title: "금지된 기술 사용 조건",
    manuscriptQuote: "세린 혼자 금지된 기술을 사용했다.",
    conflictingSetting: "8화에서 금지된 기술은 3인 의식이 필요하다고 설명했다.",
    reason: "세계관 규칙의 발동 조건이 달라졌다.",
    suggestion: "의식 참여자를 추가하거나 예외 조건을 설정한다.",
    relatedNodeIds: ["node-ritual"],
    evidenceIds: ["evidence-2"],
  },
];

describe("analysis helpers", () => {
  it("prioritizes character and world rule conflicts before deferred issue types", () => {
    expect(getPriorityIssues(issues).map((issue) => issue.id)).toEqual([
      "character-1",
      "world-1",
      "timeline-1",
    ]);
  });

  it("filters issues by selected severity", () => {
    expect(filterIssuesBySeverity(issues, "high")).toHaveLength(1);
    expect(filterIssuesBySeverity(issues, "high")[0].id).toBe("character-1");
    expect(filterIssuesBySeverity(issues, "all")).toHaveLength(3);
  });

  it("counts Korean manuscript characters without whitespace", () => {
    expect(countNonWhitespaceCharacters("세린이 검은 마력을 방출했다.\n\n빛이 사라졌다.")).toBe(20);
  });

  it("summarizes issue severities for the result panel", () => {
    expect(getSeveritySummary(issues)).toEqual({
      issueCount: 3,
      highCount: 1,
      mediumCount: 1,
      lowCount: 1,
    });
  });
});
