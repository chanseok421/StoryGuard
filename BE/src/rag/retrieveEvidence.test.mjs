import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const buildDir = ".tmp/rag-test-build";
const tscCli = "node_modules/typescript/bin/tsc";

async function loadRagModule() {
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
      "--skipLibCheck",
      "src/rag/retrieveEvidence.ts",
      "src/shared/types.ts",
    ],
    { stdio: "pipe" },
  );

  const ragModule = await import(pathToFileURL(`${process.cwd()}/${buildDir}/rag/retrieveEvidence.js`));
  rmSync(buildDir, { recursive: true, force: true });

  return ragModule;
}

test("retrieveEvidence returns chunks, evidence, and relatedSettings from matching setting text", async () => {
  const { retrieveEvidence } = await loadRagModule();

  const result = await retrieveEvidence({
    settingsText:
      "이 세계에서는 죽은 사람을 완전히 부활시킬 수 없다.\n\n민준은 왕궁 화재 사흘 뒤에야 수도로 복귀했다.\n\n푸른 나침반은 동쪽 문이 열릴 때만 빛난다.",
    manuscriptText:
      "하린은 죽었던 민준을 완전히 되살렸다. 왕궁 화재 다음 날, 하린은 민준과 함께 폐허를 조사했다.",
  });

  assert.ok(result.chunks.length >= 3);
  assert.ok(result.relatedSettings.length > 0);
  assert.ok(result.relatedSettings.length <= 5);
  assert.ok(result.evidence.length > 0);

  const chunkIds = new Set(result.chunks.map((chunk) => chunk.id));
  for (const item of result.evidence) {
    assert.equal(item.sourceType, "setting");
    assert.ok(item.chunkId);
    assert.ok(chunkIds.has(item.chunkId));
  }
  for (const item of result.relatedSettings) {
    assert.ok(item.chunkId);
    assert.ok(chunkIds.has(item.chunkId));
  }
});

test("retrieveEvidence returns empty arrays instead of throwing for empty input", async () => {
  const { retrieveEvidence } = await loadRagModule();

  const result = await retrieveEvidence({
    settingsText: "",
    manuscriptText: "",
  });

  assert.deepEqual(result, {
    chunks: [],
    evidence: [],
    relatedSettings: [],
  });
});

