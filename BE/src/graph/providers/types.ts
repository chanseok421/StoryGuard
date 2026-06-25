import type { GraphAnalysisInput, GraphAnalysisResult, Provider } from "../../shared/types.js";

export type StoryAnalysisProviderName = Extract<Provider, "groq" | "ollama" | "openai">;

export type StoryAnalysisProvider = {
  name: StoryAnalysisProviderName;
  analyze(input: GraphAnalysisInput): Promise<GraphAnalysisResult>;
};
