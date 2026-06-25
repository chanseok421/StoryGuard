import type { Issue, SeverityFilter, SeveritySummary } from "./types";

const issueTypeWeight: Record<Issue["type"], number> = {
  character_conflict: 0,
  world_rule_conflict: 1,
  timeline_conflict: 2,
  causality_conflict: 3,
  foreshadowing_gap: 4,
};

const severityWeight: Record<Issue["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function getPriorityIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((first, second) => {
    const byType = issueTypeWeight[first.type] - issueTypeWeight[second.type];
    if (byType !== 0) return byType;
    return severityWeight[first.severity] - severityWeight[second.severity];
  });
}

export function filterIssuesBySeverity(
  issues: Issue[],
  severity: SeverityFilter,
): Issue[] {
  if (severity === "all") return issues;
  return issues.filter((issue) => issue.severity === severity);
}

export function countNonWhitespaceCharacters(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function getSeveritySummary(issues: Issue[]): SeveritySummary {
  return issues.reduce<SeveritySummary>(
    (summary, issue) => {
      summary.issueCount += 1;
      if (issue.severity === "high") summary.highCount += 1;
      if (issue.severity === "medium") summary.mediumCount += 1;
      if (issue.severity === "low") summary.lowCount += 1;
      return summary;
    },
    { issueCount: 0, highCount: 0, mediumCount: 0, lowCount: 0 },
  );
}
