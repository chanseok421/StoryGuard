import { createDeepAgentStoryAnalysisProvider } from "./deepAgentStoryAnalysisProvider.js";
import { createGroqStoryAnalysisProvider } from "./groqStoryAnalysisProvider.js";
import { createOllamaStoryAnalysisProvider } from "./ollamaStoryAnalysisProvider.js";
import { createOpenAIStoryAnalysisProvider } from "./openaiStoryAnalysisProvider.js";
import type { StoryAnalysisProvider } from "./types.js";

export function createStoryAnalysisProvider(): StoryAnalysisProvider | null {
  const provider = process.env.AI_ANALYSIS_PROVIDER?.trim().toLowerCase();

  if (provider === "deepagent") {
    return createDeepAgentStoryAnalysisProvider();
  }

  if (provider === "groq") {
    return createGroqStoryAnalysisProvider();
  }

  if (provider === "ollama") {
    return createOllamaStoryAnalysisProvider();
  }

  if (provider === "openai") {
    return createOpenAIStoryAnalysisProvider();
  }

  return null;
}

export type { StoryAnalysisProvider } from "./types.js";
