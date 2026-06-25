import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { chunkSettings } from "./chunk-settings.js";
import type { SettingsFixture } from "./types.js";

const fixtureUrl = new URL("../../fixtures/rag/settings.json", import.meta.url);
const fixture = JSON.parse(
  await readFile(fixtureUrl, "utf8"),
) as SettingsFixture;

const chunks = chunkSettings(fixture);

assert.equal(chunks.length, 10);
assert.equal(new Set(chunks.map((chunk) => chunk.id)).size, 10);

for (const [index, chunk] of chunks.entries()) {
  const setting = fixture.settings[index];

  assert.equal(chunk.id, `${fixture.projectId}:${setting.id}:0`);
  assert.equal(chunk.metadata.projectId, fixture.projectId);
  assert.equal(chunk.metadata.settingId, setting.id);
  assert.equal(chunk.metadata.settingOrder, index);
  assert.equal(chunk.metadata.chunkIndex, 0);
  assert.equal(chunk.metadata.sourceType, "setting");
  assert.match(chunk.pageContent, new RegExp(setting.title));
  assert.match(chunk.pageContent, new RegExp(setting.content));
}

const abilityChunk = chunks.find(
  (chunk) => chunk.metadata.settingId === "setting-003",
);

assert.ok(abilityChunk);
assert.deepEqual(abilityChunk.metadata.entities, [
  "하린",
  "은빛 회중시계",
  "3초 회귀",
]);
assert.match(abilityChunk.pageContent, /최대 3초/);

assert.throws(
  () =>
    chunkSettings({
      ...fixture,
      settings: [fixture.settings[0], fixture.settings[0]],
    }),
  /Duplicate setting id/,
);

console.log(`Validated ${chunks.length} setting-item chunks.`);
