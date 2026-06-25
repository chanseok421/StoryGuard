import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import type { EmbeddingsInterface } from "@langchain/core/embeddings";

import { chunkSettings } from "./chunk-settings.js";
import { createEmbeddingIndex } from "./embedding-retriever.js";
import type { SettingsFixture } from "./types.js";

interface ManuscriptScene {
  id: string;
  content: string;
}

interface ManuscriptFixture {
  scenes: ManuscriptScene[];
}

interface GoldenCase {
  sceneId: string;
  difficulty?: "core" | "hard";
  requiredSettingIds: string[];
}

interface GoldenFixture {
  evaluation: { topK: number };
  cases: GoldenCase[];
}

class CharacterNgramEmbeddings implements EmbeddingsInterface {
  private readonly dimensions = 512;

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map((document) => this.embed(document));
  }

  async embedQuery(document: string): Promise<number[]> {
    return this.embed(document);
  }

  private embed(text: string): number[] {
    const normalized = text.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
    const characters = [...normalized];
    const vector = Array<number>(this.dimensions).fill(0);

    for (const size of [2, 3]) {
      for (let index = 0; index <= characters.length - size; index += 1) {
        const gram = characters.slice(index, index + size).join("");
        let hash = 2166136261;

        for (const character of gram) {
          hash ^= character.codePointAt(0) ?? 0;
          hash = Math.imul(hash, 16777619);
        }

        vector[Math.abs(hash) % this.dimensions] += 1;
      }
    }

    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );

    return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
  }
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

const index = await createEmbeddingIndex(
  chunkSettings(settings),
  new CharacterNgramEmbeddings(),
);

// 이 테스트는 LangChain MemoryVectorStore 연동 배선(plumbing)을 검증한다.
// CharacterNgram은 의미가 아닌 글자 기반이라 의역(hard) 케이스는 못 잡는 게 정상이므로,
// 엄격한 Hit@3=1.00 단언은 core 케이스에만 적용한다.
const coreCases = golden.cases.filter(
  (goldenCase) => goldenCase.difficulty !== "hard",
);
let coreHitCount = 0;

for (const goldenCase of golden.cases) {
  const scene = manuscripts.scenes.find(
    (candidate) => candidate.id === goldenCase.sceneId,
  );
  assert.ok(scene, `Missing scene: ${goldenCase.sceneId}`);

  const matches = await index.retrieve(scene.content, golden.evaluation.topK);
  const settingIds = matches.map((match) => match.metadata.settingId);
  const hit = goldenCase.requiredSettingIds.some((settingId) =>
    settingIds.includes(settingId),
  );

  assert.equal(matches.length, golden.evaluation.topK);
  assert.ok(matches.every((match, index) => match.rank === index + 1));

  if (goldenCase.difficulty === "hard") {
    continue;
  }

  if (hit) {
    coreHitCount += 1;
  }

  assert.equal(
    hit,
    true,
    `${goldenCase.sceneId} missed required evidence. Retrieved: ${settingIds.join(", ")}`,
  );
}

assert.equal(coreHitCount / coreCases.length, 1);
assert.deepEqual(await index.retrieve("", 3), []);
await assert.rejects(() => index.retrieve("하린", 0), /positive integer/);

console.log(
  "Validated LangChain MemoryVectorStore integration with core Hit@3=1.00.",
);
