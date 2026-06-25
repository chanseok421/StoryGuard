import { chunkSettings } from "./chunk-settings.js";
import { createEmbeddingIndex } from "./embedding-retriever.js";
import {
  DEFAULT_EMBEDDING_MODEL,
  createOpenAIEmbeddings,
} from "./openai-embeddings.js";
import {
  evaluateRetrieval,
  printReport,
  readJson,
  type GoldenFixture,
  type ManuscriptFixture,
} from "./evaluate-retrieval.js";
import type { SettingsFixture } from "./types.js";

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY is required. Copy .env.example to .env and load it before running npm run eval:embedding.",
  );
}

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

const model = process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
const index = await createEmbeddingIndex(
  chunkSettings(settings),
  createOpenAIEmbeddings(),
);

const report = await evaluateRetrieval(
  `embedding:${model}`,
  async (query, topK) =>
    (await index.retrieve(query, topK)).map(
      (match) => match.metadata.settingId,
    ),
  manuscripts,
  golden,
);

printReport(report);
