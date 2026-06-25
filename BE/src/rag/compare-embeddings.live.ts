import { OpenAIEmbeddings } from "@langchain/openai";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";

import { chunkSettings } from "./chunk-settings.js";
import { createEmbeddingIndex } from "./embedding-retriever.js";
import { createOllamaEmbeddings } from "./ollama-embeddings.js";
import { retrieveByKeyword } from "./keyword-retriever.js";
import {
  evaluateRetrieval,
  printComparison,
  printReport,
  readJson,
  type GoldenFixture,
  type ManuscriptFixture,
  type RetrievalReport,
  type Retriever,
} from "./evaluate-retrieval.js";
import type { SettingsFixture } from "./types.js";

interface ModelSpec {
  label: string;
  /** true면 OPENAI_API_KEY가 있을 때만 실행. 로컬 모델은 false. */
  requiresOpenAIKey: boolean;
  create: () => Promise<EmbeddingsInterface> | EmbeddingsInterface;
}

/**
 * 비교할 임베딩 모델 목록.
 * - OpenAI: 이름만 바꾸면 비교됨 (키 필요).
 * - Ollama: 키 없이 로컬 실행. 사전 준비:
 *     npm i @langchain/ollama
 *     ollama pull bge-m3      (multilingual-e5는 ollama pull znbang/e5-large 등)
 *   ollama 데몬이 떠 있어야 한다 (기본 http://localhost:11434).
 */
const EMBEDDING_MODELS: ModelSpec[] = [
  {
    label: "openai:text-embedding-3-small",
    requiresOpenAIKey: true,
    create: () => new OpenAIEmbeddings({ model: "text-embedding-3-small" }),
  },
  {
    label: "openai:text-embedding-3-large",
    requiresOpenAIKey: true,
    create: () => new OpenAIEmbeddings({ model: "text-embedding-3-large" }),
  },
  {
    label: "openai:text-embedding-ada-002",
    requiresOpenAIKey: true,
    create: () => new OpenAIEmbeddings({ model: "text-embedding-ada-002" }),
  },
  {
    label: "ollama:bge-m3",
    requiresOpenAIKey: false,
    create: () => createOllamaEmbeddings("bge-m3"),
  },
  {
    label: "ollama:snowflake-arctic-embed2",
    requiresOpenAIKey: false,
    create: () => createOllamaEmbeddings("snowflake-arctic-embed2"),
  },
  {
    label: "ollama:granite-embedding:278m",
    requiresOpenAIKey: false,
    create: () => createOllamaEmbeddings("granite-embedding:278m"),
  },
];

const settings = await readJson<SettingsFixture>(
  "../../fixtures/rag/settings.json",
  import.meta.url,
);
const manuscripts = await readJson<ManuscriptFixture>(
  "../../fixtures/rag/manuscripts.json",
  import.meta.url,
);
const golden = await readJson<GoldenFixture>(
  "../../fixtures/rag/golden-retrieval.json",
  import.meta.url,
);

const chunks = chunkSettings(settings);
const reports: RetrievalReport[] = [];
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

// 1) keyword baseline — 항상 실행
const keywordRetriever: Retriever = async (query, topK) =>
  retrieveByKeyword(query, chunks, topK).map(
    (match) => match.chunk.metadata.settingId,
  );
reports.push(
  await evaluateRetrieval("keyword", keywordRetriever, manuscripts, golden),
);

// 2) embedding models — 키 필요 모델은 키가 있을 때만, 로컬 모델은 항상 시도
for (const model of EMBEDDING_MODELS) {
  if (model.requiresOpenAIKey && !hasOpenAIKey) {
    console.warn(`Skipped ${model.label}: OPENAI_API_KEY not set.`);
    continue;
  }

  try {
    const index = await createEmbeddingIndex(chunks, await model.create());
    reports.push(
      await evaluateRetrieval(
        model.label,
        async (query, topK) =>
          (await index.retrieve(query, topK)).map(
            (match) => match.metadata.settingId,
          ),
        manuscripts,
        golden,
      ),
    );
  } catch (error) {
    console.error(`Skipped ${model.label}: ${(error as Error).message}`);
  }
}

for (const report of reports) {
  printReport(report);
}
printComparison(reports);
