import { buildStoryAnalysisPrompt } from "../buildStoryAnalysisPrompt.js";
import { validateGraphAnalysisResult } from "../validateGraphAnalysisResult.js";
import type { GraphAnalysisInput, GraphAnalysisResult } from "../../shared/types.js";
import type { StoryAnalysisProvider } from "./types.js";

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const DEFAULT_OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_ANALYSIS_MODEL = "gpt-4o-mini";
const DEFAULT_TIMEOUT_MS = 60_000;

function getTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AI_ANALYSIS_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function withTimeout(): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), getTimeoutMs()).unref();
  return controller;
}

export function createOpenAIStoryAnalysisProvider(): StoryAnalysisProvider {
  return {
    name: "openai",
    async analyze(input: GraphAnalysisInput): Promise<GraphAnalysisResult> {
      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for openai analysis provider");
      }

      const prompt = buildStoryAnalysisPrompt(input);
      const controller = withTimeout();
      const baseUrl =
        process.env.OPENAI_API_BASE_URL?.replace(/\/+$/, "") || DEFAULT_OPENAI_API_BASE_URL;
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_ANALYSIS_MODEL || DEFAULT_OPENAI_ANALYSIS_MODEL,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI analysis request failed: ${response.status} ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as OpenAIChatCompletionResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI analysis response did not include message content");
      }

      return validateGraphAnalysisResult(JSON.parse(content), input.evidence);
    },
  };
}
