import assert from "node:assert/strict";
import test from "node:test";
import { runStoryAnalysisDetailed } from "./runStoryAnalysis.js";
import type { GraphAnalysisInput } from "../shared/types.js";
import type { StoryAnalysisProvider } from "./providers/types.js";

const input: GraphAnalysisInput = {
  request: {
    projectTitle: "푸른 왕국",
    settingsText: "죽은 사람은 부활할 수 없다.",
    manuscriptText: "민준은 완전히 되살아났다.",
  },
  evidence: [{ id: "ev_setting_1", sourceType: "setting", quote: "죽은 사람은 부활할 수 없다." }],
  relatedSettings: [{ id: "rel_1", title: "부활 규칙", quote: "죽은 사람은 부활할 수 없다." }],
};

test("runStoryAnalysisDetailed accepts a valid provider result", async () => {
  const provider: StoryAnalysisProvider = {
    name: "groq",
    async analyze() {
      return {
        issues: [
          {
            id: "issue_ai_001",
            type: "world_rule_conflict",
            severity: "high",
            title: "AI가 찾은 부활 충돌",
            manuscriptQuote: "민준은 완전히 되살아났다.",
            conflictingSetting: "죽은 사람은 부활할 수 없다.",
            reason: "부활 금지 규칙과 충돌한다.",
            suggestion: "부활 대신 사망 회피로 바꾸세요.",
            relatedNodeIds: ["issue_ai_001"],
            evidenceIds: ["ev_setting_1"],
          },
        ],
        nodes: [{ id: "issue_ai_001", label: "AI가 찾은 부활 충돌", type: "issue", importance: 5, hasIssue: true }],
        edges: [],
      };
    },
  };

  const result = await runStoryAnalysisDetailed(input, provider);

  assert.equal(result.provider, "groq");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.graph.issues[0]?.title, "AI가 찾은 부활 충돌");
});

test("runStoryAnalysisDetailed falls back when provider throws", async () => {
  const provider: StoryAnalysisProvider = {
    name: "groq",
    async analyze() {
      throw new Error("provider unavailable");
    },
  };

  const result = await runStoryAnalysisDetailed(input, provider);

  assert.equal(result.provider, "mock");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.graph.issues.length, 1);
});
