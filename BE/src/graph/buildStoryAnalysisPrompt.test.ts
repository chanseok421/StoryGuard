import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryAnalysisPrompt } from "./buildStoryAnalysisPrompt.js";

test("buildStoryAnalysisPrompt includes inputs and strict JSON constraints", () => {
  const prompt = buildStoryAnalysisPrompt({
    request: {
      projectTitle: "푸른 왕국",
      genre: "fantasy",
      settingsText: "죽은 사람은 부활할 수 없다.",
      manuscriptText: "민준은 완전히 되살아났다.",
    },
    evidence: [{ id: "ev_1", sourceType: "setting", quote: "죽은 사람은 부활할 수 없다." }],
    relatedSettings: [{ id: "rel_1", title: "부활 규칙", quote: "죽은 사람은 부활할 수 없다." }],
  });

  assert.match(prompt.system, /StoryGuard 분석기/);
  assert.match(prompt.system, /JSON/);
  assert.match(prompt.user, /푸른 왕국/);
  assert.match(prompt.user, /민준은 완전히 되살아났다/);
  assert.match(prompt.user, /ev_1/);
  assert.match(prompt.user, /issue\.evidenceIds/);
});
