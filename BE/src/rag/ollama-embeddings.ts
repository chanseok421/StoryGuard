import type { EmbeddingsInterface } from "@langchain/core/embeddings";

export const DEFAULT_OLLAMA_EMBEDDING_MODEL = "bge-m3";

/**
 * Ollama 로컬 임베딩. 무료, 키 불필요(데몬이 떠 있어야 함: localhost:11434).
 * bge-m3가 무료 후보 비교에서 1위라 기본값. [[storyguard-rag-embedding-decision]]
 *
 * 비-리터럴 specifier로 동적 import → @langchain/ollama 미설치 시에도
 * typecheck를 막지 않고 런타임에서만 로드한다.
 */
export async function createOllamaEmbeddings(
  model: string = process.env.OLLAMA_EMBEDDING_MODEL?.trim() ||
    DEFAULT_OLLAMA_EMBEDDING_MODEL,
): Promise<EmbeddingsInterface> {
  const moduleName = "@langchain/ollama";
  const { OllamaEmbeddings } = await import(moduleName);
  // 데몬 주소. 컨테이너에서 호스트 Ollama를 쓸 땐 OLLAMA_BASE_URL로 덮어쓴다
  // (예: http://host.docker.internal:11434). 미설정 시 라이브러리 기본값(localhost:11434).
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  return new OllamaEmbeddings(baseUrl ? { model, baseUrl } : { model });
}
