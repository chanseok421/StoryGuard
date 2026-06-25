import { OpenAIEmbeddings } from "@langchain/openai";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export function createOpenAIEmbeddings(): OpenAIEmbeddings {
  const model = process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;

  return new OpenAIEmbeddings({
    model,
  });
}
