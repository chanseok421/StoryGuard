import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const buildDir = ".tmp/graph-test-build";
const tscCli = "node_modules/typescript/bin/tsc";

async function loadGraphModule() {
  rmSync(buildDir, { recursive: true, force: true });
  mkdirSync(buildDir, { recursive: true });

  execFileSync(
    process.execPath,
    [
      tscCli,
      "--outDir",
      buildDir,
      "--rootDir",
      "src",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      // tsconfig.json과 동일하게 맞춘다. 이게 없으면 deepagent provider가 끌어오는
      // deepagents/langgraph 제네릭 추론이 깨져 컴파일이 실패한다.
      "--strict",
      "--esModuleInterop",
      "--skipLibCheck",
      "src/graph/runStoryAnalysis.ts",
      "src/shared/types.ts",
    ],
    { stdio: "pipe" },
  );

  const graphModule = await import(pathToFileURL(`${process.cwd()}/${buildDir}/graph/runStoryAnalysis.js`));
  rmSync(buildDir, { recursive: true, force: true });

  return graphModule;
}

test("runStoryAnalysis turns retrieved evidence into linked issues and graph data", async () => {
  const { runStoryAnalysis } = await loadGraphModule();

  const result = await runStoryAnalysis({
    request: {
      projectTitle: "별의 왕국",
      settingsText:
        "이 세계에서는 죽은 사람을 완전히 부활시킬 수 없다.\n민준은 왕궁 화재 사흘 뒤에야 수도로 복귀했다.\n푸른 나침반은 동쪽 문이 열릴 때만 빛난다.",
      manuscriptText:
        "하린은 이미 죽었던 민준을 완전히 되살렸다.\n왕궁 화재 다음 날, 하린은 민준과 함께 폐허를 조사했다.\n하린은 별다른 단서 없이 동쪽 문을 찾아냈다.",
    },
    evidence: [
      {
        id: "ev_setting_resurrection",
        sourceType: "setting",
        quote: "이 세계에서는 죽은 사람을 완전히 부활시킬 수 없다.",
        chunkId: "chunk_setting_001",
        score: 0.96,
      },
      {
        id: "ev_setting_minjun_return",
        sourceType: "setting",
        quote: "민준은 왕궁 화재 사흘 뒤에야 수도로 복귀했다.",
        chunkId: "chunk_setting_002",
        score: 0.91,
      },
      {
        id: "ev_setting_blue_compass",
        sourceType: "setting",
        quote: "푸른 나침반은 동쪽 문이 열릴 때만 빛난다.",
        chunkId: "chunk_setting_003",
        score: 0.84,
      },
    ],
    relatedSettings: [
      {
        id: "rel_resurrection",
        title: "완전 부활 금지",
        quote: "이 세계에서는 죽은 사람을 완전히 부활시킬 수 없다.",
        chunkId: "chunk_setting_001",
        score: 0.96,
      },
    ],
  });

  assert.equal(result.issues.length, 3);
  assert.deepEqual(
    result.issues.map((issue) => issue.type),
    ["world_rule_conflict", "timeline_conflict", "foreshadowing_gap"],
  );
  assert.deepEqual(
    result.issues.map((issue) => issue.severity),
    ["high", "medium", "low"],
  );

  const evidenceIds = new Set(["ev_setting_resurrection", "ev_setting_minjun_return", "ev_setting_blue_compass"]);
  for (const issue of result.issues) {
    assert.ok(issue.evidenceIds.length > 0);
    assert.ok(issue.evidenceIds.every((id) => evidenceIds.has(id)));
  }

  const nodeIds = new Set(result.nodes.map((node) => node.id));
  for (const issue of result.issues) {
    assert.ok(issue.relatedNodeIds.every((id) => nodeIds.has(id)));
  }
  for (const edge of result.edges) {
    assert.ok(nodeIds.has(edge.source));
    assert.ok(nodeIds.has(edge.target));
  }
});
