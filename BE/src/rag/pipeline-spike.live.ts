import { readFile } from "node:fs/promises";

import { retrieveEvidenceWithEmbeddings } from "./embeddingRetrieveEvidence.js";
import { runStoryAnalysis } from "../graph/runStoryAnalysis.js";
import type { AnalyzeRequest } from "../shared/types.js";

// RAG → Role4 통합 스파이크: 실제 evidence가 issue로 흘러가는지(이음새) 검증.
// 사용: npm run spike:pipeline            (기본 scene-001, 내 픽스처)
//      npm run spike:pipeline -- scene-008
//      npm run spike:pipeline -- role4    (Role4 데모 스토리=별의 왕국으로 E2E)
const target = process.argv[2] ?? "scene-001";

async function readText(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}
async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readText(relativePath)) as T;
}

interface SettingsFixture {
  title: string;
  genre: string;
  settings: { content: string }[];
}
interface ManuscriptFixture {
  scenes: { id: string; content: string }[];
}

let request: AnalyzeRequest;

if (target === "role4") {
  // Role4 발표 샘플(별의 왕국)의 ```text 블록 2개(설정집/원고)를 그대로 입력
  const md = await readText("../../samples/role4-demo-story.md");
  const blocks = [...md.matchAll(/```text\r?\n([\s\S]*?)```/g)].map((m) =>
    m[1].trim(),
  );
  if (blocks.length < 2) {
    throw new Error("role4-demo-story.md에서 설정집/원고 블록을 못 찾음");
  }
  request = {
    projectTitle: "별의 왕국",
    genre: "판타지",
    settingsText: blocks[0],
    manuscriptText: blocks[1],
    options: { useRag: true, useGraph: true },
  };
} else {
  const settingsFixture = await readJson<SettingsFixture>(
    "../../fixtures/rag/settings.json",
  );
  const manuscripts = await readJson<ManuscriptFixture>(
    "../../fixtures/rag/manuscripts.json",
  );
  const scene = manuscripts.scenes.find((candidate) => candidate.id === target);
  if (!scene) {
    throw new Error(`Unknown scene: ${target}`);
  }
  request = {
    projectTitle: settingsFixture.title,
    genre: settingsFixture.genre,
    settingsText: settingsFixture.settings.map((s) => s.content).join("\n\n"),
    manuscriptText: scene.content,
    options: { useRag: true, useGraph: true },
  };
}

const sceneId = target;

// ── 1단계: RAG ──────────────────────────────────────────────
const retrieval = await retrieveEvidenceWithEmbeddings({
  settingsText: request.settingsText,
  manuscriptText: request.manuscriptText,
});

console.log(`\n[1] RAG — ${sceneId} 근거 검색 (${retrieval.evidence.length}건)`);
for (const item of retrieval.evidence) {
  console.log(`    ${item.id}  (score ${item.score})  "${item.quote.slice(0, 30)}…"`);
}

// ── 2단계: Role4 LangGraph ─────────────────────────────────
const graph = await runStoryAnalysis({
  request,
  evidence: retrieval.evidence,
  relatedSettings: retrieval.relatedSettings,
});

console.log(`\n[2] Role4 — 분석 결과: issue ${graph.issues.length} / node ${graph.nodes.length} / edge ${graph.edges.length}`);
for (const issue of graph.issues) {
  console.log(`    [${issue.severity}] ${issue.title}`);
  console.log(`        evidenceIds: ${issue.evidenceIds.join(", ") || "(없음)"}`);
}

// ── 3단계: 이음새 검증 ──────────────────────────────────────
const evidenceIdSet = new Set(retrieval.evidence.map((item) => item.id));
const referenced = graph.issues.flatMap((issue) => issue.evidenceIds);
const linked = referenced.filter((id) => evidenceIdSet.has(id));

console.log("\n[3] 이음새 검증");
console.log(`    issue가 참조한 evidenceId ${referenced.length}개 중 ${linked.length}개가 RAG 출력과 일치`);
if (graph.issues.length === 0) {
  console.log("    ⚠ issue 0건 — Role4 템플릿이 이 장면 키워드와 안 맞음(키워드 기반 한계)");
} else if (linked.length > 0) {
  console.log("    ✅ RAG 근거가 Role4 issue로 실제 연결됨");
} else {
  console.log("    ⚠ issue는 생성됐으나 RAG evidence와 id 연결 안 됨(템플릿 fallback 사용)");
}
