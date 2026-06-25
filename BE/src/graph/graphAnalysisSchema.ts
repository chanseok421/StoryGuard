export const graphAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: [
              "character_conflict",
              "world_rule_conflict",
              "timeline_conflict",
              "causality_conflict",
              "foreshadowing_gap",
            ],
          },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          title: { type: "string" },
          manuscriptQuote: { type: "string" },
          conflictingSetting: { type: "string" },
          reason: { type: "string" },
          suggestion: { type: "string" },
          relatedNodeIds: { type: "array", items: { type: "string" } },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
        required: [
          "id",
          "type",
          "severity",
          "title",
          "manuscriptQuote",
          "conflictingSetting",
          "reason",
          "suggestion",
          "relatedNodeIds",
          "evidenceIds",
        ],
      },
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["character", "event", "rule", "place", "foreshadow", "issue"] },
          importance: { type: "number" },
          hasIssue: { type: "boolean" },
        },
        required: ["id", "label", "type", "importance", "hasIssue"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: ["relationship", "causes", "violates", "located_at", "foreshadows"] },
        },
        required: ["source", "target", "label", "type"],
      },
    },
  },
  required: ["issues", "nodes", "edges"],
} as const;
