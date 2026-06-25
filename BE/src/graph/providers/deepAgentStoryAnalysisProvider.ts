import { createDeepAgent } from "deepagents";
import { toolStrategy } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

import type { GraphAnalysisInput, GraphAnalysisResult } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";
import { retrieveEvidence } from "../../rag/retrieveEvidence.js";
import { retrieveEvidenceFromVectorStore } from "../../rag/retrieveEvidenceFromVectorStore.js";
import { validateGraphAnalysisResult } from "../validateGraphAnalysisResult.js";
import type { StoryAnalysisProvider } from "./types.js";

const DEFAULT_GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_RECURSION_LIMIT = 50;

/**
 * 1단계(배선) 구현. 기존 단일 프롬프트 provider와 동일한 StoryAnalysisProvider 인터페이스를
 * 따르되, 내부적으로 LangGraph 기반 deep agent를 돌린다. 에이전트는 RAG 검색을 "도구"로
 * 호출하며(search_settings), 최종 출력은 기존 validator로 정합성을 보장한다.
 *
 * 아직 유형별 서브에이전트/write_todos는 붙이지 않았다(다음 단계).
 */

const issueSchema = z.object({
  id: z.string(),
  type: z.enum([
    "character_conflict",
    "world_rule_conflict",
    "timeline_conflict",
    "causality_conflict",
    "foreshadowing_gap",
  ]),
  severity: z.enum(["high", "medium", "low"]),
  title: z.string(),
  manuscriptQuote: z.string(),
  conflictingSetting: z.string(),
  reason: z.string(),
  suggestion: z.string(),
  relatedNodeIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
});

const nodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["character", "event", "rule", "place", "foreshadow", "issue"]),
  importance: z.number(),
  hasIssue: z.boolean(),
});

const edgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  label: z.string(),
  type: z.enum(["relationship", "causes", "violates", "located_at", "foreshadows"]).optional(),
});

const analysisResponseSchema = z.object({
  issues: z.array(issueSchema),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

const SYSTEM_PROMPT = [
  "너는 한국어 소설의 '설정 붕괴(continuity error)'를 검출하는 분석 에이전트다.",
  "원고(manuscript)와 세계관 설정(settings)을 비교해 충돌을 찾아낸다.",
  "",
  "작업 방식:",
  "1. 원고를 읽고 인물·규칙·사건·장소·복선 단위로 검증 포인트를 잡는다.",
  "2. 각 포인트마다 search_settings 도구를 호출해 관련 설정 근거를 직접 검색한다.",
  "   (원고에 등장하는 모든 단정적 서술은 설정과 대조해 확인할 것)",
  "3. 원고가 설정을 위반하거나, 복선을 회수하지 않는 부분을 issue로 정리한다.",
  "4. 충돌에 관련된 인물/규칙/사건/장소/복선/이슈를 node로, 그 관계를 edge로 만든다.",
  "",
  "출력 규칙:",
  "- issue.type 은 character_conflict | world_rule_conflict | timeline_conflict | causality_conflict | foreshadowing_gap 중 하나.",
  "- node.type 은 character | event | rule | place | foreshadow | issue 중 하나.",
  "- issue.relatedNodeIds 는 네가 만든 node.id 들만 참조한다(이슈 자신의 id 포함 가능).",
  "- edge.source/target 은 반드시 존재하는 node.id 여야 한다.",
  "- 충돌이 없으면 issues 는 빈 배열로 둔다.",
].join("\n");

function getTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.DEEPAGENT_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * deepagent가 쓸 채팅 모델을 만든다. OpenAI / Groq(둘 다 OpenAI 호환 API) 중 선택.
 * DEEPAGENT_BACKEND 로 명시할 수 있고, 미설정 시 키가 있는 쪽을 자동 감지한다(openai 우선).
 * 모델명은 DEEPAGENT_MODEL 로 덮어쓸 수 있다.
 */
function createAgentModel(): ChatOpenAI {
  const explicit = process.env.DEEPAGENT_BACKEND?.trim().toLowerCase();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();

  const backend =
    explicit === "openai" || explicit === "groq"
      ? explicit
      : openaiKey
        ? "openai"
        : groqKey
          ? "groq"
          : null;

  if (backend === "openai") {
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is required for deepagent backend=openai");
    }
    return new ChatOpenAI({
      model:
        process.env.DEEPAGENT_MODEL?.trim() ||
        process.env.OPENAI_ANALYSIS_MODEL?.trim() ||
        DEFAULT_OPENAI_MODEL,
      apiKey: openaiKey,
      temperature: 0,
      configuration: {
        baseURL:
          process.env.OPENAI_API_BASE_URL?.replace(/\/+$/, "") || DEFAULT_OPENAI_API_BASE_URL,
      },
    });
  }

  if (backend === "groq") {
    if (!groqKey) {
      throw new Error("GROQ_API_KEY is required for deepagent backend=groq");
    }
    return new ChatOpenAI({
      model:
        process.env.DEEPAGENT_MODEL?.trim() ||
        process.env.GROQ_ANALYSIS_MODEL?.trim() ||
        DEFAULT_GROQ_MODEL,
      apiKey: groqKey,
      temperature: 0,
      configuration: {
        baseURL: process.env.GROQ_API_BASE_URL?.replace(/\/+$/, "") || DEFAULT_GROQ_API_BASE_URL,
      },
    });
  }

  throw new Error(
    "deepagent provider requires OPENAI_API_KEY or GROQ_API_KEY (set DEEPAGENT_BACKEND to choose)",
  );
}

/** 요청 컨텍스트(projectId/settingsText/manuscriptText)를 클로저로 묶은 RAG 검색 도구. */
function createSearchSettingsTool(input: GraphAnalysisInput) {
  const { projectId, settingsText, manuscriptText } = input.request;

  return tool(
    async ({ query }): Promise<string> => {
      const effectiveQuery = query?.trim() || manuscriptText;

      let retrieval = { chunks: [], evidence: [], relatedSettings: [] } as Awaited<
        ReturnType<typeof retrieveEvidence>
      >;

      // 1순위: 사전 임베딩된 vectorDB(projectId 있을 때).
      if (projectId) {
        retrieval = await retrieveEvidenceFromVectorStore({
          projectId,
          manuscriptText: effectiveQuery,
        });
      }

      // 2순위: 제공된 settingsText 즉석 키워드 검색.
      if (retrieval.evidence.length === 0) {
        retrieval = await retrieveEvidence({
          projectId,
          settingsText,
          manuscriptText: effectiveQuery,
        });
      }

      if (retrieval.evidence.length === 0) {
        return "관련 설정 근거를 찾지 못했습니다.";
      }

      return retrieval.evidence
        .map((item, index) => `[${index + 1}] (score ${item.score ?? "?"}) ${item.quote}`)
        .join("\n");
    },
    {
      name: "search_settings",
      description:
        "원고의 특정 부분과 관련된 세계관/설정 근거를 검색한다. query에는 확인하려는 인물·규칙·사건·장소·복선을 자연어로 적는다.",
      schema: z.object({
        query: z
          .string()
          .describe("검색할 설정 키워드/문장 (예: '민준의 수도 복귀 시점', '부활 가능 여부')"),
      }),
    },
  );
}

function buildUserMessage(input: GraphAnalysisInput): string {
  const { projectTitle, genre, manuscriptText } = input.request;

  return [
    `작품 제목: ${projectTitle}`,
    genre ? `장르: ${genre}` : null,
    "",
    "아래 원고를 분석해 설정 붕괴를 찾아라. 필요한 설정 근거는 search_settings 도구로 직접 검색할 것.",
    "",
    "=== 원고(manuscript) ===",
    manuscriptText,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function extractStructuredResult(result: unknown): unknown {
  if (result && typeof result === "object" && "structuredResponse" in result) {
    const structured = (result as { structuredResponse?: unknown }).structuredResponse;
    if (structured) {
      return structured;
    }
  }

  // responseFormat 미적용 모델 대비: 마지막 메시지에서 JSON 블록을 추출한다.
  const messages = (result as { messages?: Array<{ content?: unknown }> }).messages ?? [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const content = messages[i]?.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((part) =>
                typeof part === "string" ? part : ((part as { text?: string })?.text ?? ""),
              )
              .join("")
          : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // 다음 메시지로 폴백
      }
    }
  }

  return { issues: [], nodes: [], edges: [] };
}

export function createDeepAgentStoryAnalysisProvider(): StoryAnalysisProvider {
  return {
    name: "deepagent",
    async analyze(input: GraphAnalysisInput): Promise<GraphAnalysisResult> {
      const model = createAgentModel();
      const searchSettings = createSearchSettingsTool(input);

      const agent = createDeepAgent({
        model,
        tools: [searchSettings],
        systemPrompt: SYSTEM_PROMPT,
        responseFormat: toolStrategy(analysisResponseSchema),
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), getTimeoutMs());
      timer.unref?.();

      try {
        const result = await agent.invoke(
          { messages: [{ role: "user", content: buildUserMessage(input) }] },
          { signal: controller.signal, recursionLimit: DEFAULT_RECURSION_LIMIT },
        );

        const structured = extractStructuredResult(result);
        return validateGraphAnalysisResult(structured, input.evidence);
      } catch (error) {
        logger.warn("deepagent analysis failed", { error });
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
