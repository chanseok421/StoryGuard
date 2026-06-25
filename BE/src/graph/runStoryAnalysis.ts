import type {
  Evidence,
  GraphAnalysisInput,
  GraphAnalysisResult,
  Issue,
  StoryEdge,
  StoryNode,
  Provider,
} from "../shared/types.js";
import { logger } from "../shared/logger.js";
import { createStoryAnalysisProvider, type StoryAnalysisProvider } from "./providers/index.js";
import { validateGraphAnalysisResult } from "./validateGraphAnalysisResult.js";

type IssueTemplate = {
  type: Issue["type"];
  severity: Issue["severity"];
  title: string;
  manuscriptTerms: string[];
  settingTerms: string[];
  manuscriptQuote: string;
  conflictingSetting: string;
  reason: string;
  suggestion: string;
  nodes: StoryNode[];
  edges: StoryEdge[];
};

const ISSUE_TEMPLATES: IssueTemplate[] = [
  {
    type: "world_rule_conflict",
    severity: "high",
    title: "부활 금지 규칙과 충돌",
    manuscriptTerms: ["부활", "되살", "죽었던"],
    settingTerms: ["부활", "죽은 사람", "되돌리기"],
    manuscriptQuote: "원고에서 죽은 인물이 완전히 되살아나는 장면이 발견되었습니다.",
    conflictingSetting: "설정상 죽은 사람의 완전한 부활은 허용되지 않습니다.",
    reason: "원고 장면이 세계관의 핵심 규칙을 직접 위반합니다.",
    suggestion: "완전한 부활 대신 제한된 시간 되돌리기나 생존 회피 장면으로 수정하세요.",
    nodes: [
      { id: "char_harin", label: "하린", type: "character", importance: 5, hasIssue: true },
      { id: "char_minjun", label: "민준", type: "character", importance: 4, hasIssue: true },
      { id: "rule_no_resurrection", label: "완전 부활 금지", type: "rule", importance: 5, hasIssue: true },
    ],
    edges: [
      { source: "issue_001", target: "rule_no_resurrection", label: "위반", type: "violates" },
      { source: "issue_001", target: "char_minjun", label: "대상", type: "relationship" },
    ],
  },
  {
    type: "timeline_conflict",
    severity: "medium",
    title: "사건 시점과 인물 등장 시점 충돌",
    manuscriptTerms: ["다음 날", "다음날", "함께", "폐허"],
    settingTerms: ["사흘 뒤", "복귀", "화재"],
    manuscriptQuote: "원고에서 설정상 아직 도착하지 않은 인물이 사건 직후 등장합니다.",
    conflictingSetting: "설정상 해당 인물은 사건 며칠 뒤에야 현장에 도착합니다.",
    reason: "원고의 등장 시점이 기존 사건 순서와 맞지 않습니다.",
    suggestion: "장면 시점을 인물 복귀 이후로 옮기거나, 해당 인물을 장면에서 제외하세요.",
    nodes: [
      { id: "char_minjun", label: "민준", type: "character", importance: 4, hasIssue: true },
      { id: "event_palace_fire", label: "왕궁 화재", type: "event", importance: 4, hasIssue: true },
      { id: "place_capital", label: "수도", type: "place", importance: 3, hasIssue: true },
    ],
    edges: [
      { source: "event_palace_fire", target: "place_capital", label: "발생 장소", type: "located_at" },
      { source: "issue_002", target: "event_palace_fire", label: "시간 충돌", type: "causes" },
      { source: "issue_002", target: "char_minjun", label: "등장 시점 충돌", type: "relationship" },
    ],
  },
  {
    type: "foreshadowing_gap",
    severity: "low",
    title: "복선 회수 부족",
    manuscriptTerms: ["단서 없이", "동쪽 문", "찾아냈"],
    settingTerms: ["푸른 나침반", "동쪽 문", "빛난"],
    manuscriptQuote: "원고에서 핵심 단서 없이 중요한 장소를 찾아냅니다.",
    conflictingSetting: "설정상 해당 장면에는 미리 심어둔 복선이나 아이템이 연결되어야 합니다.",
    reason: "원고가 기존 복선을 사용하지 않아 장면의 설득력이 약해집니다.",
    suggestion: "장면에 복선 아이템이 반응하거나 단서를 제공하는 묘사를 추가하세요.",
    nodes: [
      { id: "foreshadow_blue_compass", label: "푸른 나침반", type: "foreshadow", importance: 3, hasIssue: true },
      { id: "place_east_gate", label: "동쪽 문", type: "place", importance: 2, hasIssue: true },
    ],
    edges: [
      { source: "foreshadow_blue_compass", target: "place_east_gate", label: "문을 가리킴", type: "foreshadows" },
      { source: "issue_003", target: "foreshadow_blue_compass", label: "회수 필요", type: "foreshadows" },
    ],
  },
];

export type StoryAnalysisRunResult = {
  graph: GraphAnalysisResult;
  provider: Provider;
  fallbackUsed: boolean;
};

export async function runStoryAnalysis(input: GraphAnalysisInput): Promise<GraphAnalysisResult> {
  const result = await runStoryAnalysisDetailed(input);
  return result.graph;
}

export async function runStoryAnalysisDetailed(
  input: GraphAnalysisInput,
  provider: StoryAnalysisProvider | null = createStoryAnalysisProvider(),
): Promise<StoryAnalysisRunResult> {
  if (!provider) {
    return {
      graph: runRuleBasedStoryAnalysis(input),
      provider: "mock",
      fallbackUsed: true,
    };
  }

  try {
    const graph = validateGraphAnalysisResult(await provider.analyze(input), input.evidence);

    return {
      graph,
      provider: provider.name,
      fallbackUsed: false,
    };
  } catch (error) {
    logger.warn("story analysis provider failed; using rule-based fallback", {
      provider: provider.name,
      error,
    });

    return {
      graph: runRuleBasedStoryAnalysis(input),
      provider: "mock",
      fallbackUsed: true,
    };
  }
}

export function runRuleBasedStoryAnalysis(input: GraphAnalysisInput): GraphAnalysisResult {
  try {
    const manuscriptText = input.request.manuscriptText ?? "";
    const settingsText = input.request.settingsText ?? "";
    const issues = buildIssues(manuscriptText, settingsText, input.evidence);
    const nodes = buildNodes(issues);
    const edges = buildEdges(issues, nodes);

    return validateGraphResult({ issues, nodes, edges });
  } catch (error) {
    logger.warn("rule-based story analysis failed", { error });
    return { issues: [], nodes: [], edges: [] };
  }
}

function buildIssues(manuscriptText: string, settingsText: string, evidence: Evidence[]): Issue[] {
  const issues: Issue[] = [];

  // These templates are a demo fallback. The model-backed path should eventually
  // produce the same Issue shape from evidence pairs instead of fixed keywords.
  for (const template of ISSUE_TEMPLATES) {
    if (!matchesTemplate(template, manuscriptText, settingsText, evidence)) {
      continue;
    }

    const issueNumber = issues.length + 1;
    const issueId = `issue_${String(issueNumber).padStart(3, "0")}`;
    const linkedEvidence = findEvidence(template, evidence);

    issues.push({
      id: issueId,
      type: template.type,
      severity: template.severity,
      title: template.title,
      manuscriptQuote: findSentence(manuscriptText, template.manuscriptTerms) ?? template.manuscriptQuote,
      conflictingSetting:
        linkedEvidence.find((item) => item.sourceType === "setting")?.quote ??
        findSentence(settingsText, template.settingTerms) ??
        template.conflictingSetting,
      reason: template.reason,
      suggestion: template.suggestion,
      relatedNodeIds: [...template.nodes.map((node) => node.id), issueId],
      evidenceIds: linkedEvidence.map((item) => item.id),
    });
  }

  return issues;
}

function matchesTemplate(
  template: IssueTemplate,
  manuscriptText: string,
  settingsText: string,
  evidence: Evidence[],
): boolean {
  const evidenceText = evidence.map((item) => item.quote).join("\n");
  const hasManuscriptSignal = containsAny(manuscriptText, template.manuscriptTerms);
  const hasSettingSignal = containsAny(`${settingsText}\n${evidenceText}`, template.settingTerms);

  return hasManuscriptSignal && hasSettingSignal;
}

function findEvidence(template: IssueTemplate, evidence: Evidence[]): Evidence[] {
  return evidence
    .filter((item) => containsAny(item.quote, template.settingTerms))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 2);
}

function buildNodes(issues: Issue[]): StoryNode[] {
  const nodes = new Map<string, StoryNode>();

  for (const issue of issues) {
    const template = ISSUE_TEMPLATES.find((item) => item.type === issue.type);
    if (!template) {
      continue;
    }

    for (const node of template.nodes) {
      nodes.set(node.id, node);
    }

    nodes.set(issue.id, {
      id: issue.id,
      label: issue.title,
      type: "issue",
      importance: severityToImportance(issue.severity),
      hasIssue: true,
    });
  }

  return [...nodes.values()];
}

function buildEdges(issues: Issue[], nodes: StoryNode[]): StoryEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: StoryEdge[] = [];

  for (const issue of issues) {
    const template = ISSUE_TEMPLATES.find((item) => item.type === issue.type);
    if (!template) {
      continue;
    }

    for (const edge of template.edges) {
      const edgeWithIssueId = {
        ...edge,
        source: edge.source.startsWith("issue_") ? issue.id : edge.source,
        target: edge.target.startsWith("issue_") ? issue.id : edge.target,
      };

      if (nodeIds.has(edgeWithIssueId.source) && nodeIds.has(edgeWithIssueId.target)) {
        edges.push(edgeWithIssueId);
      }
    }
  }

  return edges;
}

function validateGraphResult(result: GraphAnalysisResult): GraphAnalysisResult {
  const nodeIds = new Set(result.nodes.map((node) => node.id));

  // Keep the API contract stable even when a rule creates an incomplete graph.
  return {
    issues: result.issues.map((issue) => ({
      ...issue,
      relatedNodeIds: issue.relatedNodeIds.filter((id) => nodeIds.has(id)),
    })),
    nodes: result.nodes,
    edges: result.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  };
}

function findSentence(text: string, terms: string[]): string | undefined {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => containsAny(sentence, terms));
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function severityToImportance(severity: Issue["severity"]): number {
  if (severity === "high") {
    return 5;
  }
  if (severity === "medium") {
    return 4;
  }
  return 2;
}
