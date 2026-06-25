export interface StorySetting {
  id: string;
  category: string;
  title: string;
  content: string;
  entities: string[];
  /** 관련 표현/개념 동의어. 의역된 원고와의 의미 매칭(recall)을 높이는 chunk 보강용. */
  aliases?: string[];
}

export interface SettingsFixture {
  projectId: string;
  title: string;
  genre: string;
  settings: StorySetting[];
}

export interface SettingChunkMetadata {
  schemaVersion: 1;
  sourceType: "setting";
  projectId: string;
  settingId: string;
  category: string;
  title: string;
  content: string;
  entities: string[];
  language: "ko";
  chunkIndex: 0;
  settingOrder: number;
}

export interface SettingChunk {
  id: string;
  pageContent: string;
  metadata: SettingChunkMetadata;
}

export interface RetrievalMatch {
  chunk: SettingChunk;
  rank: number;
  score: number;
  matchedTerms: string[];
  matchedEntities: string[];
}

export interface EmbeddingRetrievalMatch {
  pageContent: string;
  metadata: SettingChunkMetadata;
  rank: number;
  score: number;
}
