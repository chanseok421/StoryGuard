import { getSupabase } from "../../db/supabase.js";
import type {
  StoredChunk,
  VectorMatch,
  VectorSearchOptions,
  VectorStore,
} from "./types.js";

type MatchRow = {
  id: string;
  story_id: string;
  source_type: VectorMatch["sourceType"];
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

/** Supabase pgvector 기반 VectorStore 구현. */
export class PgVectorStore implements VectorStore {
  async upsertChunks(chunks: StoredChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const rows = chunks.map((chunk) => ({
      user_id: chunk.userId,
      project_id: chunk.projectId,
      story_id: chunk.storyId,
      source_type: chunk.sourceType,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      metadata: chunk.metadata,
      embedding: chunk.embedding,
    }));

    const { error } = await getSupabase().from("document_chunks").insert(rows);
    if (error) {
      throw new Error(`document_chunks insert failed: ${error.message}`);
    }
  }

  async deleteByStory(storyId: string): Promise<void> {
    const { error } = await getSupabase()
      .from("document_chunks")
      .delete()
      .eq("story_id", storyId);
    if (error) {
      throw new Error(`document_chunks delete failed: ${error.message}`);
    }
  }

  async search(options: VectorSearchOptions): Promise<VectorMatch[]> {
    const { data, error } = await getSupabase().rpc("match_document_chunks", {
      query_embedding: options.queryEmbedding,
      p_project_id: options.projectId,
      p_source_type: options.sourceType,
      match_count: options.topK,
    });

    if (error) {
      throw new Error(`match_document_chunks failed: ${error.message}`);
    }

    return ((data as MatchRow[] | null) ?? []).map((row) => ({
      id: row.id,
      storyId: row.story_id,
      sourceType: row.source_type,
      chunkIndex: row.chunk_index,
      content: row.content,
      metadata: row.metadata ?? {},
      similarity: row.similarity,
    }));
  }
}
