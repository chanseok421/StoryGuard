import assert from "node:assert/strict";

import type { EmbeddingsInterface } from "@langchain/core/embeddings";

import { chunkDocument } from "./chunkDocument.js";
import { retrieveEvidenceFromVectorStore } from "./retrieveEvidenceFromVectorStore.js";
import { MemoryVectorStore } from "./vectorStore/memoryVectorStore.js";
import type { StoredChunk } from "./vectorStore/types.js";

// 글자 n-gram 기반 결정적 가짜 임베딩(Ollama 불필요).
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
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return magnitude === 0 ? vector : vector.map((value) => value / magnitude);
  }
}

const embeddings = new FakeEmbeddings();
const projectId = "11111111-1111-1111-1111-111111111111";

// 1) chunkDocument: 빈 줄/불릿 분할, 빈 입력 안전
const chunks = chunkDocument("첫 번째 설정 문단.\n\n- 두 번째 설정 항목", "setting");
assert.equal(chunks.length, 2);
assert.equal(chunks[0].chunkIndex, 0);
assert.equal(chunks[0].metadata.sourceType, "setting");
assert.equal(chunkDocument("   ", "setting").length, 0);

// 2) 설정 청크를 인메모리 vectorStore에 임베딩 저장
const settingTexts = [
  "이 세계에서는 죽은 사람을 완전히 부활시킬 수 없다. 되돌리기는 사망 직전 3초까지만 가능하다.",
  "민준은 왕궁 화재 사흘 뒤에야 북부 전선에서 수도로 복귀했다.",
  "푸른 나침반은 동쪽 문이 열릴 때만 빛난다.",
];
const vectors = await embeddings.embedDocuments(settingTexts);
const stored: StoredChunk[] = settingTexts.map((text, index) => ({
  userId: "user-1",
  projectId,
  storyId: "story-settings",
  sourceType: "setting",
  chunkIndex: index,
  content: text,
  metadata: { sourceType: "setting", title: `설정 ${index + 1}` },
  embedding: vectors[index],
}));
const vectorStore = new MemoryVectorStore();
await vectorStore.upsertChunks(stored);

// 3) 원고로 검색 → 부활 규칙 설정이 최상위 근거로 잡힌다
const result = await retrieveEvidenceFromVectorStore(
  {
    projectId,
    manuscriptText: "이미 죽었던 민준이 주문으로 완전히 되살아나 부활했다.",
  },
  { embeddings, vectorStore, topK: 3 },
);

assert.ok(result.evidence.length >= 1, "evidence 존재");
assert.equal(result.evidence.length, result.relatedSettings.length);
assert.equal(result.evidence.length, result.chunks.length);
assert.equal(result.evidence[0].sourceType, "setting");
assert.match(result.evidence[0].quote, /부활/);
for (const item of result.evidence) {
  assert.ok(item.chunkId, "evidence.chunkId 존재");
  assert.ok(typeof item.score === "number");
}

// 4) 빈/잘못된 입력 안전(throw 없이 빈 결과)
const empty = await retrieveEvidenceFromVectorStore(
  { projectId, manuscriptText: "   " },
  { embeddings, vectorStore },
);
assert.deepEqual(empty, { chunks: [], evidence: [], relatedSettings: [] });

// 5) deleteByStory 멱등성
await vectorStore.deleteByStory("story-settings");
const afterDelete = await retrieveEvidenceFromVectorStore(
  { projectId, manuscriptText: "부활" },
  { embeddings, vectorStore },
);
assert.equal(afterDelete.evidence.length, 0);

console.log("Validated chunkDocument + retrieveEvidenceFromVectorStore (MemoryVectorStore).");
