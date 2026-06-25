import { readFile } from "node:fs/promises";

export interface GoldenCase {
  sceneId: string;
  difficulty?: "core" | "hard";
  requiredSettingIds: string[];
  relevantSettingIds: string[];
}

export interface GoldenFixture {
  evaluation: { topK: number };
  cases: GoldenCase[];
}

export interface ManuscriptScene {
  id: string;
  content: string;
}

export interface ManuscriptFixture {
  scenes: ManuscriptScene[];
}

export interface CaseResult {
  sceneId: string;
  retrievedSettingIds: string[];
  hit: boolean;
  recall: number;
}

export interface RetrievalReport {
  label: string;
  hitAt3: number;
  recallAt3: number;
  cases: CaseResult[];
}

/**
 * 한 장면 쿼리에 대해 settingId를 rank 순서대로 돌려주는 검색 함수.
 * keyword / embedding 등 어떤 구현이든 이 형태로만 맞추면 동일 기준으로 평가된다.
 */
export type Retriever = (query: string, topK: number) => Promise<string[]>;

export async function readJson<T>(
  relativePath: string,
  baseUrl: string,
): Promise<T> {
  const fileUrl = new URL(relativePath, baseUrl);
  return JSON.parse(await readFile(fileUrl, "utf8")) as T;
}

export async function evaluateRetrieval(
  label: string,
  retrieve: Retriever,
  manuscripts: ManuscriptFixture,
  golden: GoldenFixture,
): Promise<RetrievalReport> {
  const cases: CaseResult[] = [];
  let hitCount = 0;
  let recallTotal = 0;

  for (const goldenCase of golden.cases) {
    const scene = manuscripts.scenes.find(
      (candidate) => candidate.id === goldenCase.sceneId,
    );

    if (!scene) {
      throw new Error(`Missing scene: ${goldenCase.sceneId}`);
    }

    const retrievedSettingIds = await retrieve(
      scene.content,
      golden.evaluation.topK,
    );

    const hit = goldenCase.requiredSettingIds.some((settingId) =>
      retrievedSettingIds.includes(settingId),
    );
    const recall =
      goldenCase.relevantSettingIds.filter((settingId) =>
        retrievedSettingIds.includes(settingId),
      ).length / goldenCase.relevantSettingIds.length;

    hitCount += hit ? 1 : 0;
    recallTotal += recall;

    cases.push({ sceneId: goldenCase.sceneId, retrievedSettingIds, hit, recall });
  }

  return {
    label,
    hitAt3: hitCount / golden.cases.length,
    recallAt3: recallTotal / golden.cases.length,
    cases,
  };
}

export function printReport(report: RetrievalReport): void {
  console.log(`\n[${report.label}]`);
  for (const result of report.cases) {
    console.log(
      `  ${result.sceneId}: ${result.retrievedSettingIds.join(", ")} ` +
        `(hit=${result.hit}, recall=${result.recall.toFixed(2)})`,
    );
  }
  console.log(
    `  => Hit@3=${report.hitAt3.toFixed(2)} Recall@3=${report.recallAt3.toFixed(2)}`,
  );
}

export function printComparison(reports: RetrievalReport[]): void {
  const labelWidth = Math.max(...reports.map((r) => r.label.length), 12);
  const header =
    "method".padEnd(labelWidth) + "  Hit@3   Recall@3";
  console.log("\n=== Retrieval comparison ===");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const report of reports) {
    console.log(
      report.label.padEnd(labelWidth) +
        `  ${report.hitAt3.toFixed(2)}    ${report.recallAt3.toFixed(2)}`,
    );
  }
}
