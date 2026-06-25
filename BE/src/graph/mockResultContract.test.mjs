import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const mockResult = JSON.parse(readFileSync("samples/mock-result.json", "utf8"));

test("mock-result summary matches issue counts", () => {
  assert.equal(mockResult.summary.issueCount, mockResult.issues.length);
  assert.equal(
    mockResult.summary.highCount,
    mockResult.issues.filter((issue) => issue.severity === "high").length,
  );
  assert.equal(
    mockResult.summary.mediumCount,
    mockResult.issues.filter((issue) => issue.severity === "medium").length,
  );
  assert.equal(
    mockResult.summary.lowCount,
    mockResult.issues.filter((issue) => issue.severity === "low").length,
  );
});

test("mock-result links every issue to existing evidence and graph nodes", () => {
  const evidenceIds = new Set(mockResult.evidence.map((item) => item.id));
  const nodeIds = new Set(mockResult.nodes.map((node) => node.id));

  for (const issue of mockResult.issues) {
    assert.ok(issue.evidenceIds.length > 0, `${issue.id} must have evidenceIds`);
    assert.ok(issue.relatedNodeIds.length > 0, `${issue.id} must have relatedNodeIds`);

    for (const evidenceId of issue.evidenceIds) {
      assert.ok(evidenceIds.has(evidenceId), `${issue.id} references missing evidence ${evidenceId}`);
    }

    for (const nodeId of issue.relatedNodeIds) {
      assert.ok(nodeIds.has(nodeId), `${issue.id} references missing node ${nodeId}`);
    }
  }
});

test("mock-result graph edges point to existing nodes", () => {
  const nodeIds = new Set(mockResult.nodes.map((node) => node.id));

  for (const edge of mockResult.edges) {
    assert.ok(nodeIds.has(edge.source), `edge source ${edge.source} is missing`);
    assert.ok(nodeIds.has(edge.target), `edge target ${edge.target} is missing`);
  }
});

