import { readFile } from "node:fs/promises";

import { retrieveEvidenceWithEmbeddings } from "./embeddingRetrieveEvidence.js";

// 사용법: npm run demo:evidence            (기본 scene-001)
//        npm run demo:evidence -- scene-008
const sceneId = process.argv[2] ?? "scene-001";

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  ) as T;
}

interface SettingsFixture {
  settings: { content: string }[];
}
interface ManuscriptFixture {
  scenes: { id: string; content: string }[];
}

const settingsFixture = await readJson<SettingsFixture>(
  "../../fixtures/rag/settings.json",
);
const manuscripts = await readJson<ManuscriptFixture>(
  "../../fixtures/rag/manuscripts.json",
);

// 계약 입력은 평문 텍스트 → 설정 원문을 빈 줄로 이어 붙여 settingsText를 만든다.
const settingsText = settingsFixture.settings
  .map((setting) => setting.content)
  .join("\n\n");

const scene = manuscripts.scenes.find((candidate) => candidate.id === sceneId);
if (!scene) {
  throw new Error(`Unknown scene: ${sceneId}`);
}

const result = await retrieveEvidenceWithEmbeddings({
  settingsText,
  manuscriptText: scene.content,
});

console.log(JSON.stringify(result, null, 2));
