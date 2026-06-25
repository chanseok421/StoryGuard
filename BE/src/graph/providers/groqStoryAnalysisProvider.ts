import { buildStoryAnalysisPrompt } from "../buildStoryAnalysisPrompt.js";
import { validateGraphAnalysisResult } from "../validateGraphAnalysisResult.js";
import type { GraphAnalysisInput, GraphAnalysisResult } from "../../shared/types.js";
import type { StoryAnalysisProvider } from "./types.js";

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const DEFAULT_GROQ_API_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_ANALYSIS_MODEL = "openai/gpt-oss-120b";
const DEFAULT_TIMEOUT_MS = 20_000;

function getTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AI_ANALYSIS_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function withTimeout(): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), getTimeoutMs()).unref();
  return controller;
}

export function createGroqStoryAnalysisProvider(): StoryAnalysisProvider {
  return {
    name: "groq",
    async analyze(input: GraphAnalysisInput): Promise<GraphAnalysisResult> {
      const apiKey = process.env.GROQ_API_KEY?.trim();
      if (!apiKey) {
        throw new Error("GROQ_API_KEY is required for groq analysis provider");
      }

      const prompt = buildStoryAnalysisPrompt(input);
      const controller = withTimeout();
      const baseUrl = process.env.GROQ_API_BASE_URL?.replace(/\/+$/, "") || DEFAULT_GROQ_API_BASE_URL;
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_ANALYSIS_MODEL || DEFAULT_GROQ_ANALYSIS_MODEL,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          // json_schema(strict)는 일부 모델 미지원/긴 입력에서 검증 실패가 잦아
          // json_object 모드 사용. 출력 형태는 프롬프트로 강제하고 validator로 정리한다.
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Groq analysis request failed: ${response.status} ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as GroqChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Groq analysis response did not include message content");
      }

      return validateGraphAnalysisResult(JSON.parse(content), input.evidence);
    },
  };
}
