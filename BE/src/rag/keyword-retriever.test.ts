import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { chunkSettings } from "./chunk-settings.js";
import { retrieveByKeyword } from "./keyword-retriever.js";
import type { SettingsFixture } from "./types.js";

interface ManuscriptScene {
  id: string;
  title: string;
  content: string;
}

interface ManuscriptFixture {
  projectId: string;
  scenes: ManuscriptScene[];
}

interface GoldenCase {
  sceneId: string;
  difficulty?: "core" | "hard";
  requiredSettingIds: string[];
  supportingSettingIds: string[];
  relevantSettingIds: string[];
}

interface GoldenFixture {
  projectId: string;
  evaluation: {
    topK: number;
  };
  cases: GoldenCase[];
}

async function readJson<T>(relativePath: string): Promise<T> {
  const fileUrl = new URL(relativePath, import.meta.url);
  return JSON.parse(await readFile(fileUrl, "utf8")) as T;
}

const settings = await readJson<SettingsFixture>(
  "../../fixtures/rag/settings.json",
);
const manuscripts = await readJson<ManuscriptFixture>(
  "../../fixtures/rag/manuscripts.json",
);
const golden = await readJson<GoldenFixture>(
  "../../fixtures/rag/golden-retrieval.json",
);

const chunks = chunkSettings(settings);
const coreCases = golden.cases.filter(
  (goldenCase) => goldenCase.difficulty !== "hard",
);
let coreHitCount = 0;
let coreRecallTotal = 0;

for (const goldenCase of golden.cases) {
  const scene = manuscripts.scenes.find(
    (candidate) => candidate.id === goldenCase.sceneId,
  );
  assert.ok(scene, `Missing scene: ${goldenCase.sceneId}`);

  const matches = retrieveByKeyword(
    scene.content,
    chunks,
    golden.evaluation.topK,
  );
  const retrievedSettingIds = matches.map(
    (match) => match.chunk.metadata.settingId,
  );
  const hit = goldenCase.requiredSettingIds.some((settingId) =>
    retrievedSettingIds.includes(settingId),
  );
  const recalledCount = goldenCase.relevantSettingIds.filter((settingId) =>
    retrievedSettingIds.includes(settingId),
  ).length;
  const recall = recalledCount / goldenCase.relevantSettingIds.length;

  console.log(
    `${goldenCase.sceneId}${goldenCase.difficulty === "hard" ? " (hard)" : ""}: ` +
      `${retrievedSettingIds.join(", ")} (hit=${hit}, recall=${recall.toFixed(2)})`,
  );

  // hard 케이스는 의역 검색이라 keyword가 놓치는 게 의도된 동작. 단언은 core에만 적용한다.
  if (goldenCase.difficulty === "hard") {
    continue;
  }

  if (hit) {
    coreHitCount += 1;
  }
  coreRecallTotal += recall;

  assert.equal(
    hit,
    true,
    `${goldenCase.sceneId} missed required evidence. Retrieved: ${retrievedSettingIds.join(", ")}`,
  );
}

const hitAt3 = coreHitCount / coreCases.length;
const recallAt3 = coreRecallTotal / coreCases.length;

assert.equal(hitAt3, 1);
console.log(`Keyword baseline (core) Hit@3=${hitAt3.toFixed(2)}`);
console.log(`Keyword baseline (core) Recall@3=${recallAt3.toFixed(2)}`);
