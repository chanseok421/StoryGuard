import { buildStoryAnalysisPrompt } from "../buildStoryAnalysisPrompt.js";
import { graphAnalysisJsonSchema } from "../graphAnalysisSchema.js";
import { validateGraphAnalysisResult } from "../validateGraphAnalysisResult.js";
import type { GraphAnalysisInput, GraphAnalysisResult } from "../../shared/types.js";
import type { StoryAnalysisProvider } from "./types.js";

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_ANALYSIS_MODEL = "gpt-oss:20b";
const DEFAULT_TIMEOUT_MS = 30_000;

function getTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AI_ANALYSIS_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function withTimeout(): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), getTimeoutMs()).unref();
  return controller;
}

export function createOllamaStoryAnalysisProvider(): StoryAnalysisProvider {
  return {
    name: "ollama",
    async analyze(input: GraphAnalysisInput): Promise<GraphAnalysisResult> {
      const prompt = buildStoryAnalysisPrompt(input);
      const controller = withTimeout();
      const baseUrl = process.env.OLLAMA_BASE_URL?.replace(/\/+$/, "") || DEFAULT_OLLAMA_BASE_URL;
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OLLAMA_ANALYSIS_MODEL || DEFAULT_OLLAMA_ANALYSIS_MODEL,
          stream: false,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          format: graphAnalysisJsonSchema,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama analysis request failed: ${response.status} ${body.slice(0, 500)}`);
      }

      const payload = (await response.json()) as OllamaChatResponse;
      const content = payload.message?.content;
      if (!content) {
        throw new Error("Ollama analysis response did not include message content");
      }

      return validateGraphAnalysisResult(JSON.parse(content), input.evidence);
    },
  };
}
