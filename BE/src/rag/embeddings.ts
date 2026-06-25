import type { EmbeddingsInterface } from "@langchain/core/embeddings";

import { createOllamaEmbeddings } from "./ollama-embeddings.js";
import { createOpenAIEmbeddings } from "./openai-embeddings.js";

/**
 * EMBEDDING_PROVIDER 환경변수로 임베딩 구현을 고른다(기본 ollama bge-m3, 1024차원).
 * openai로 바꾸면 차원이 달라지므로 document_chunks.embedding vector(N)도 함께 맞춰야 한다.
 */
export async function createEmbeddings(): Promise<EmbeddingsInterface> {
  const provider = process.env.EMBEDDING_PROVIDER?.trim() || "ollama";

  if (provider === "openai") {
    return createOpenAIEmbeddings();
  }

  return createOllamaEmbeddings();
}
