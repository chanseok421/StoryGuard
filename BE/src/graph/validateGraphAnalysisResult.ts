import type { Evidence, GraphAnalysisResult, Issue, StoryEdge, StoryNode } from "../shared/types.js";

const ISSUE_TYPES = new Set<Issue["type"]>([
  "character_conflict",
  "world_rule_conflict",
  "timeline_conflict",
  "causality_conflict",
  "foreshadowing_gap",
]);
const SEVERITIES = new Set<Issue["severity"]>(["high", "medium", "low"]);
const NODE_TYPES = new Set<StoryNode["type"]>(["character", "event", "rule", "place", "foreshadow", "issue"]);
const EDGE_TYPES = new Set<NonNullable<StoryEdge["type"]>>([
  "relationship",
  "causes",
  "violates",
  "located_at",
  "foreshadows",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeNode(value: unknown): StoryNode | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getString(value.id);
  const label = getString(value.label);
  const type = getString(value.type);
  const importance = typeof value.importance === "number" ? value.importance : null;

  if (!id || !label || !type || !NODE_TYPES.has(type as StoryNode["type"]) || importance === null) {
    return null;
  }

  return {
    id,
    label,
    type: type as StoryNode["type"],
    importance,
    hasIssue: value.hasIssue === true,
  };
}

function normalizeIssue(value: unknown, nodeIds: Set<string>, evidenceIds: Set<string>): Issue | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getString(value.id);
  const type = getString(value.type);
  const severity = getString(value.severity);
  const title = getString(value.title);
  const manuscriptQuote = getString(value.manuscriptQuote);
  const conflictingSetting = getString(value.conflictingSetting);
  const reason = getString(value.reason);
  const suggestion = getString(value.suggestion);

  if (
    !id ||
    !type ||
    !ISSUE_TYPES.has(type as Issue["type"]) ||
    !severity ||
    !SEVERITIES.has(severity as Issue["severity"]) ||
    !title ||
    !manuscriptQuote ||
    !conflictingSetting ||
    !reason ||
    !suggestion
  ) {
    return null;
  }

  return {
    id,
    type: type as Issue["type"],
    severity: severity as Issue["severity"],
    title,
    manuscriptQuote,
    conflictingSetting,
    reason,
    suggestion,
    relatedNodeIds: getStringArray(value.relatedNodeIds).filter((nodeId) => nodeIds.has(nodeId)),
    evidenceIds: getStringArray(value.evidenceIds).filter((evidenceId) => evidenceIds.has(evidenceId)),
  };
}

function normalizeEdge(value: unknown, nodeIds: Set<string>): StoryEdge | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = getString(value.source);
  const target = getString(value.target);
  const label = getString(value.label);
  const type = getString(value.type);

  if (!source || !target || !label || !nodeIds.has(source) || !nodeIds.has(target)) {
    return null;
  }

  return {
    source,
    target,
    label,
    ...(type && EDGE_TYPES.has(type as NonNullable<StoryEdge["type"]>)
      ? { type: type as NonNullable<StoryEdge["type"]> }
      : {}),
  };
}

export function validateGraphAnalysisResult(output: unknown, evidence: Evidence[]): GraphAnalysisResult {
  if (!isRecord(output) || !Array.isArray(output.issues) || !Array.isArray(output.nodes) || !Array.isArray(output.edges)) {
    return { issues: [], nodes: [], edges: [] };
  }

  const nodes = output.nodes.map(normalizeNode).filter((node): node is StoryNode => Boolean(node));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const issues = output.issues
    .map((issue) => normalizeIssue(issue, nodeIds, evidenceIds))
    .filter((issue): issue is Issue => Boolean(issue));
  const edges = output.edges
    .map((edge) => normalizeEdge(edge, nodeIds))
    .filter((edge): edge is StoryEdge => Boolean(edge));

  return { issues, nodes, edges };
}
