import assert from "node:assert/strict";

import type { EmbeddingsInterface } from "@langchain/core/embeddings";

import { retrieveEvidenceWithEmbeddings } from "./embeddingRetrieveEvidence.js";

// 의미가 아닌 글자 n-gram 기반의 결정적 가짜 임베딩(Ollama 불필요, 오프라인 테스트용).
class FakeEmbeddings implements EmbeddingsInterface {
  private readonly dimensions = 256;

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map((document) => this.embed(document));
  }

  async embedQuery(document: string): Promise<number[]> {
    return this.embed(document);
  }

  private embed(text: string): number[] {
    const characters = [...text.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ")];
    const vector = Array<number>(this.dimensions).fill(0);

    for (let index = 0; index < characters.length - 1; index += 1) {
      const gram = characters[index] + characters[index + 1];
      let hash = 2166136261;
      for (const character of gram) {
        hash ^= character.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16777619);
      }
      vector[Math.abs(hash) % this.dimensions] += 1;
    }

    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );
    return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
  }
}

const embeddings = new FakeEmbeddings();

// 1) 팀 계약과 동일한 형태/제약 검증
const result = await retrieveEvidenceWithEmbeddings(
  {
    settingsText:
      "이 세계에서는 죽은 사람을 완전히 부활시킬 수 없다.\n\n민준은 왕궁 화재 사흘 뒤에야 수도로 복귀했다.\n\n푸른 나침반은 동쪽 문이 열릴 때만 빛난다.",
    manuscriptText:
      "하린은 죽었던 민준을 완전히 되살렸다. 왕궁 화재 다음 날, 하린은 민준과 함께 폐허를 조사했다.",
  },
  { embeddings },
);

assert.ok(result.chunks.length >= 3, "chunks >= 3");
assert.ok(
  result.relatedSettings.length > 0 && result.relatedSettings.length <= 5,
  "relatedSettings 1..5",
);
assert.ok(result.evidence.length > 0, "evidence > 0");

const chunkIds = new Set(result.chunks.map((chunk) => chunk.id));
for (const item of result.evidence) {
  assert.equal(item.sourceType, "setting");
  assert.ok(item.chunkId && chunkIds.has(item.chunkId), "evidence.chunkId valid");
  assert.ok(item.id.startsWith("ev_"));
}
for (const item of result.relatedSettings) {
  assert.ok(
    item.chunkId && chunkIds.has(item.chunkId),
    "relatedSetting.chunkId valid",
  );
  assert.ok(item.id.startsWith("rel_"));
  assert.ok(item.title.length > 0);
}

// 2) 빈 입력 → throw 없이 빈 배열 (계약 규칙)
assert.deepEqual(
  await retrieveEvidenceWithEmbeddings(
    { settingsText: "", manuscriptText: "" },
    { embeddings },
  ),
  { chunks: [], evidence: [], relatedSettings: [] },
);

console.log(
  "Validated embeddingRetrieveEvidence: RetrievalResult 계약 준수(chunks/evidence/relatedSettings, id 링크, 빈입력 안전).",
);
