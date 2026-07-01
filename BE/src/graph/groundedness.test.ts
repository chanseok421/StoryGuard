import assert from "node:assert/strict";

import { findUngroundedIssues } from "./groundedness.js";
import type { GraphAnalysisResult } from "../shared/types.js";

const manuscript =
  "하린은 민준의 손을 잡고 주문을 완성했다. 그러자 이미 죽었던 민준이 완전히 되살아났다.\n" +
  "왕궁 화재가 일어난 다음 날, 하린은 민준과 함께 폐허를 조사했다.";

function graphWithQuote(quote: string): GraphAnalysisResult {
  return {
    issues: [
      {
        id: "x_1",
        type: "world_rule_conflict",
        severity: "high",
        title: "t",
        manuscriptQuote: quote,
        conflictingSetting: "s",
        reason: "r",
        suggestion: "sg",
        relatedNodeIds: [],
        evidenceIds: [],
      },
    ],
    nodes: [],
    edges: [],
  };
}

// 1) 원고에 실제로 있는 인용 → grounded (검출 0)
assert.equal(
  findUngroundedIssues(graphWithQuote("이미 죽었던 민준이 완전히 되살아났다"), manuscript).length,
  0,
  "근거 있는 인용은 통과해야 한다",
);

// 2) 공백만 다른 인용도 grounded로 인정(정규화)
assert.equal(
  findUngroundedIssues(graphWithQuote("이미 죽었던 민준이   완전히 되살아났다"), manuscript).length,
  0,
  "공백 차이는 무시하고 통과해야 한다",
);

// 3) 원고에 없는(지어낸) 인용 → 환각 검출(1)
assert.equal(
  findUngroundedIssues(graphWithQuote("용이 하늘에서 불을 뿜으며 성을 무너뜨렸다"), manuscript).length,
  1,
  "환각 인용은 검출해야 한다",
);

// 4) 너무 짧은 인용은 판정 보류(오탐 방지)
assert.equal(
  findUngroundedIssues(graphWithQuote("손"), manuscript).length,
  0,
  "너무 짧은 인용은 보류해야 한다",
);

console.log("groundedness.test.ts ok");
