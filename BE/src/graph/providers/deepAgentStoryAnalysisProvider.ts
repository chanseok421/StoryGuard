import { createDeepAgent, type SubAgent } from "deepagents";
import { toolStrategy, createMiddleware } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { GraphAnalysisInput, GraphAnalysisResult } from "../../shared/types.js";
import { logger } from "../../shared/logger.js";
import { retrieveEvidence } from "../../rag/retrieveEvidence.js";
import { retrieveEvidenceFromVectorStore } from "../../rag/retrieveEvidenceFromVectorStore.js";
import { validateGraphAnalysisResult } from "../validateGraphAnalysisResult.js";
import { findUngroundedIssues } from "../groundedness.js";
import type { StoryAnalysisProvider } from "./types.js";

const DEFAULT_GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_OPENAI_API_BASE_URL = "https://api.openai.com/v1";
// 멀티에이전트 오케스트레이션은 약한 모델에서 환각/도구호출 오류가 잦다. 검증 결과
// gpt-4o-mini 는 부적합, gpt-4o 는 충돌 3종 정확 검출. 그래서 단일 프롬프트 경로의
// OPENAI_ANALYSIS_MODEL(보통 mini)을 상속하지 않고 별도 기본값을 둔다.
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_RECURSION_LIMIT = 80;
// 멀티에이전트 1회는 호출이 많고 콜당 토큰이 커서 낮은 TPM 티어(예 OpenAI tier-1 gpt-4o
// 30k/min)를 1회만에 초과한다. 호출 간격을 벌려(초당 N회) 분당 토큰을 한도 밑으로 유지한다.
// 높은 티어를 쓰면 DEEPAGENT_REQUESTS_PER_SECOND 를 키워 빠르게 돌릴 수 있다.
const DEFAULT_REQUESTS_PER_SECOND = 0.1;
const DEFAULT_MAX_RETRIES = 6;

/**
 * 기존 단일 프롬프트 provider와 동일한 StoryAnalysisProvider 인터페이스를 따르되, 내부는
 * LangGraph 기반 deep agent다. 메인 에이전트(오케스트레이터)가 write_todos로 계획하고,
 * 충돌 유형별 서브에이전트(world-rule/timeline/character/foreshadow)에 task 도구로 위임하며,
 * 각 에이전트는 RAG 검색을 도구(search_settings)로 직접 호출한다. 최종 출력은 기존
 * validateGraphAnalysisResult 로 정합성을 보장하고, 실패 시 호출부에서 rule-based로 폴백한다.
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

const OUTPUT_RULES = [
  "출력 규칙:",
  "- node.type 은 character | event | rule | place | foreshadow | issue 중 하나.",
  "- 충돌마다 issue 노드 1개를 만들고, 관련 인물/규칙/사건/장소/복선 노드도 만든다.",
  "- issue.relatedNodeIds 는 네가 만든 node.id 들만 참조한다(이슈 자신의 id 포함 가능).",
  "- edge.source/target 은 반드시 존재하는 node.id 여야 한다.",
  "- manuscriptQuote 는 원고에서 실제로 인용하고, conflictingSetting 은 설정 근거를 인용한다.",
  "- 충돌이 없으면 issues/nodes/edges 를 모두 빈 배열로 둔다.",
].join("\n");

type ConflictAgentConfig = {
  name: string;
  issueType: (typeof issueSchema.shape.type.options)[number];
  focus: string;
  /** node/issue id 접두사. 서브에이전트 간 id 충돌을 막는다. */
  idPrefix: string;
};

const CONFLICT_AGENTS: ConflictAgentConfig[] = [
  {
    name: "world-rule-checker",
    issueType: "world_rule_conflict",
    focus: "세계관 규칙(마법·능력·금기·물리법칙 등)을 원고가 위반하는지",
    idPrefix: "wr",
  },
  {
    name: "timeline-checker",
    issueType: "timeline_conflict",
    focus: "사건의 발생 순서·시점, 인물의 등장/이동 시점이 설정과 모순되는지",
    idPrefix: "tl",
  },
  {
    name: "character-checker",
    issueType: "character_conflict",
    focus: "인물의 성격·능력·관계·외형·소지품이 설정과 불일치하는지",
    idPrefix: "ch",
  },
  {
    name: "foreshadow-checker",
    issueType: "foreshadowing_gap",
    focus: "설정에 심어진 복선·단서·아이템이 원고에서 회수되지 않거나 무시되는지",
    idPrefix: "fs",
  },
];

function buildConflictSubAgentPrompt(config: ConflictAgentConfig): string {
  return [
    `너는 한국어 소설의 '${config.focus}'만 전문적으로 검출하는 서브에이전트다.`,
    "다른 유형의 충돌은 무시하고 네 담당 유형에만 집중한다.",
    "",
    "작업 방식:",
    "1. 전달받은 원고에서 네 담당 유형의 검증 포인트를 모두 찾는다.",
    "2. 각 포인트마다 search_settings 도구를 호출해 관련 설정 근거를 직접 검색한다.",
    "3. 원고가 설정과 충돌하는 부분만 issue 로 정리한다.",
    "",
    "환각 금지(반드시 지킬 것):",
    "- conflictingSetting 에는 search_settings 가 실제로 돌려준 문장만 그대로 인용한다. 설정을 지어내지 마라.",
    "- search_settings 로 근거를 못 찾으면 그 포인트는 issue 로 만들지 않는다(추측 금지).",
    "- '설정이 없다/미확인'은 충돌이 아니다. 설정과 원고가 '서로 모순'될 때만 issue 다.",
    "- manuscriptQuote 는 전달받은 원고에 글자 그대로 존재하는 문장이어야 한다.",
    "- 확신이 없으면 issue 를 만들지 않는다. 적게, 정확하게.",
    "",
    `- 네가 만드는 issue.type 은 반드시 "${config.issueType}" 이다.`,
    `- 모든 id(issue/node)는 "${config.idPrefix}_" 로 시작시켜 다른 검사기와 겹치지 않게 한다.`,
    "  (예: issue id = " + `"${config.idPrefix}_issue_1"` + ", 인물 node id = " + `"${config.idPrefix}_char_minjun"` + ")",
    "",
    OUTPUT_RULES,
  ].join("\n");
}

const ORCHESTRATOR_PROMPT = [
  "너는 한국어 소설의 '설정 붕괴(continuity error)' 검출을 총괄하는 오케스트레이터다.",
  "직접 분석하지 말고, 계획을 세운 뒤 전문 서브에이전트에게 위임하고 결과를 종합한다.",
  "",
  "절차:",
  "1. write_todos 로 검증 계획을 세운다(긴 원고는 장/장면 단위로 쪼갠다).",
  "2. task 도구로 각 유형 전문 서브에이전트에게 위임한다. 위임할 때 원고 전문과",
  "   '무엇을 확인해야 하는지'를 함께 전달한다. 사용할 subagent_type:",
  CONFLICT_AGENTS.map((agent) => `   - ${agent.name}: ${agent.focus}`).join("\n"),
  "3. 각 서브에이전트가 돌려준 issues/nodes/edges 를 하나로 '합친다'.",
  "   - 새로 만들지 말고 받은 항목을 그대로 모은다. node.id 가 중복되면 하나만 남긴다.",
  "   - dangling 참조(존재하지 않는 node.id)는 버린다.",
  "4. 합쳐진 최종 {issues, nodes, edges} 를 반환한다. 충돌이 없으면 모두 빈 배열.",
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
/**
 * 호출 간격을 벌리는 게이트(직렬화 + 최소 간격). 한 인스턴스를 메인/서브에이전트가 공유하므로
 * 이 게이트 하나가 deep agent의 전체 LLM 호출을 throttle해 분당 토큰을 TPM 한도 밑으로 유지한다.
 */
function createThrottleGate(requestsPerSecond: number): () => Promise<void> {
  const minIntervalMs = 1000 / requestsPerSecond;
  let nextAllowed = 0;
  let queue: Promise<void> = Promise.resolve();
  return () => {
    queue = queue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, nextAllowed - now);
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      nextAllowed = Math.max(now, nextAllowed) + minIntervalMs;
    });
    return queue;
  };
}

/**
 * 호출 throttle 미들웨어. wrapModelCall 훅에서 매 모델 호출 직전에 게이트를 통과시킨다.
 * 모델을 서브클래싱(_generate override)하지 않고 미들웨어로 가로채므로 프레임워크 내부
 * 결합도가 낮다. 하나의 gate를 공유하면 오케스트레이터와 모든 서브에이전트의 호출이
 * 한 게이트로 직렬화되어 분당 토큰을 TPM 한도 밑으로 유지한다.
 */
function createThrottleMiddleware(gate: () => Promise<void>) {
  return createMiddleware({
    name: "deepagent-throttle",
    wrapModelCall: async (request, handler) => {
      await gate();
      return handler(request);
    },
  });
}

const SELFCORRECT_MARKER = "[self-correction]";

function getMaxSelfCorrections(): number {
  const parsed = Number.parseInt(process.env.DEEPAGENT_SELFCORRECT_MAX ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

/**
 * self-correction 피드백 루프 미들웨어.
 * afterModel 훅에서 최종 구조화 출력(structuredResponse)의 groundedness를 검증하고,
 * 원고에 없는(환각) manuscriptQuote를 가진 issue가 있으면:
 *   1) 종료 조건(structuredResponse)을 해제하고
 *   2) 교정 지시 메시지를 주입한 뒤
 *   3) jumpTo:"model"로 모델 단계로 되돌려 재수행시킨다.
 * 무한루프 방지를 위해 예산(DEEPAGENT_SELFCORRECT_MAX, 기본 1회)을 둔다.
 * 검증 신호(findUngroundedIssues)는 LLM 없이 결정적이라 재현 가능하다.
 */
function createSelfCorrectionMiddleware(manuscriptText: string) {
  const maxCorrections = getMaxSelfCorrections();

  return createMiddleware({
    name: "deepagent-self-correction",
    // jumpTo:"model"로 되돌리려면 허용 타겟을 선언해야 한다.
    afterModel: {
      canJumpTo: ["model"],
      hook: (state) => {
      if (maxCorrections <= 0) {
        return undefined;
      }

      const current = state as {
        structuredResponse?: unknown;
        messages?: Array<{ content?: unknown }>;
      };
      const structured = current.structuredResponse;
      if (!structured || typeof structured !== "object") {
        return undefined; // 아직 최종 구조화 출력이 아님 → 통과
      }

      const priorCorrections = (current.messages ?? []).filter(
        (message) => typeof message.content === "string" && message.content.includes(SELFCORRECT_MARKER),
      ).length;

      const ungrounded = findUngroundedIssues(structured as GraphAnalysisResult, manuscriptText);
      // 검증/데모용: FORCE=1이면 첫 회에 한해 강제로 재수행시켜 루프 동작을 확인한다.
      const forced = process.env.DEEPAGENT_SELFCORRECT_FORCE === "1" && priorCorrections === 0;
      if (ungrounded.length === 0 && !forced) {
        return undefined; // 근거 OK → 그대로 종료
      }
      if (priorCorrections >= maxCorrections) {
        logger.warn("self-correction budget exhausted; accepting current result", {
          ungrounded: ungrounded.length,
        });
        return undefined;
      }

      logger.info("self-correction: ungrounded issues detected; looping back to model", {
        ungrounded: ungrounded.length,
        attempt: priorCorrections + 1,
      });

      const correctionMessage =
        ungrounded.length > 0
          ? `${SELFCORRECT_MARKER} 검증 실패: 아래 issue의 manuscriptQuote가 실제 원고에 존재하지 않습니다(환각).\n` +
            ungrounded.map((issue) => `- "${issue.manuscriptQuote}" (${issue.type})`).join("\n") +
            `\n해당 issue를 삭제하거나, 원고에 실제로 존재하는 문장으로 manuscriptQuote를 고쳐 최종 결과를 다시 내세요.`
          : `${SELFCORRECT_MARKER} 최종 결과를 한 번 더 검토해, 각 issue의 manuscriptQuote가 원고에 실제로 존재하는지 확인하고 정확도를 높여 다시 내세요.`;

      return {
        // 종료 조건 해제 → 모델이 다시 판단하게 한다.
        structuredResponse: undefined,
        messages: [new HumanMessage(correctionMessage)],
        jumpTo: "model" as const,
      };
      },
    },
  });
}

function getRequestsPerSecond(): number {
  const parsed = Number.parseFloat(process.env.DEEPAGENT_REQUESTS_PER_SECOND ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUESTS_PER_SECOND;
}

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
      model: process.env.DEEPAGENT_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      apiKey: openaiKey,
      temperature: 0,
      // throttle(미들웨어)를 넘는 일시적 429(TPM)는 retry-after 백오프 재시도로 흡수.
      maxRetries: DEFAULT_MAX_RETRIES,
      // 병렬 tool call을 끈다: 서브에이전트 위임(task)이 순차로 돌아 tool_call 응답 누락(400
      // parity)이 사라진다. 특히 mini에서 간헐적으로 나던 오류를 없앤다.
      modelKwargs: { parallel_tool_calls: false },
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
      maxRetries: DEFAULT_MAX_RETRIES,
      modelKwargs: { parallel_tool_calls: false },
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

/**
 * 충돌 유형별 전문 서브에이전트 4종. 각자 search_settings 도구를 갖고 자기 유형만 검출한다.
 * 메인 에이전트와 같은 throttle 게이트를 미들웨어로 공유해, 서브에이전트의 모델 호출까지
 * 전부 한 게이트로 묶어 throttle한다(서브에이전트는 메인의 미들웨어를 상속하지 않으므로 명시 주입).
 */
function buildConflictSubAgents(
  searchSettings: ReturnType<typeof createSearchSettingsTool>,
  throttleGate: () => Promise<void>,
): SubAgent[] {
  return CONFLICT_AGENTS.map((config) => ({
    name: config.name,
    description: `${config.focus} 전문 검출`,
    systemPrompt: buildConflictSubAgentPrompt(config),
    tools: [searchSettings],
    middleware: [createThrottleMiddleware(throttleGate)],
    responseFormat: toolStrategy(analysisResponseSchema),
  }));
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
      // 하나의 게이트를 오케스트레이터·서브에이전트가 공유 → 실행 전체의 모델 호출이 throttle된다.
      const throttleGate = createThrottleGate(getRequestsPerSecond());
      const subagents = buildConflictSubAgents(searchSettings, throttleGate);

      const agent = createDeepAgent({
        model,
        tools: [searchSettings],
        subagents,
        systemPrompt: ORCHESTRATOR_PROMPT,
        // throttle: 매 호출 간격 조절 / self-correction: 최종 출력 검증 실패 시 모델로 되돌려 재수행.
        middleware: [
          createThrottleMiddleware(throttleGate),
          createSelfCorrectionMiddleware(input.request.manuscriptText),
        ],
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
