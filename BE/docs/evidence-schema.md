# RAG Evidence — 구현 노트 (Role3)

> 계약 자체는 팀 문서 [docs/02-rag-interface.md](02-rag-interface.md)와 `src/shared/types.ts`가 단일 출처(SSOT).
> 이 문서는 그 계약을 **embedding으로 구현한 내용**과 운영 메모만 담는다.

## 두 가지 구현, 하나의 계약

`retrieveEvidence` 계약(`(input: RetrievalInput) => Promise<RetrievalResult>`)을 만족하는 구현이 둘:

| 파일 | 방식 | 외부 의존 | 용도 |
|---|---|---|---|
| `src/rag/retrieveEvidence.ts` | keyword (`text.includes`) | 없음(오프라인) | 기본/CI 안전 |
| `src/rag/embeddingRetrieveEvidence.ts` | embedding (bge-m3) | Ollama | 품질 업그레이드 |

둘 다 `{ chunks, evidence, relatedSettings }`를 동일하게 반환하므로 Backend/LangGraph는
**어느 것을 쓰든 코드 변경이 없다**(계약 문서가 명시한 "embedding can come later"의 구현).

```ts
// 함수 시그니처 (embedding 버전, 계약 동일 + 옵션)
retrieveEvidenceWithEmbeddings(
  input: RetrievalInput,
  options?: { embeddings?: EmbeddingsInterface; topK?: number },
): Promise<RetrievalResult>
```

- `options.embeddings` 미주입 → Ollama `bge-m3`(무료 로컬, [[storyguard-rag-embedding-decision]]).
- 테스트는 fake 임베딩을 주입해 오프라인 결정적 검증.
- 실패/빈 입력 → throw 없이 빈 배열(계약 규칙 준수).

## 왜 embedding인가 (실측 근거)

`npm run eval:compare`로 keyword vs 무료 임베딩 3종 비교: bge-m3가 Hit@3 0.75 / Recall@3 0.61로 1위(keyword 0.63/0.49).
특히 단어가 안 겹치는 **의역 장면**을 keyword는 놓치고 embedding은 잡는다 — 설정 붕괴 탐지의 핵심.
예) `npm run demo:evidence -- scene-008`: "관자놀이 통증/머릿속 뿌예짐" → '회귀의 대가'(두통/기억) 설정을 evidence 1순위로 회수.

## 운영 메모

- **top-k**: 기본 5 (계약 권장 3~5). `options.topK`로 조정.
- **threshold**: bge-m3 score 분포상 관련 0.5+, 약한 매칭 0.4대. 현재는 컷오프 없이 top-k 전부 반환하고
  점수를 함께 내보내 소비측이 거르도록 함. 데이터 늘면 재측정해 컷오프 도입 검토.
- **저장소 독립**: 지금은 in-memory(MemoryVectorStore). Supabase pgvector로 가도 계약/반환은 그대로.
  벡터 저장 위치는 Backend의 Supabase 채택 여부에 종속.

## 연동 체크 (다른 role)

- **Role2 Backend**: `retrieveEvidence`/`retrieveEvidenceWithEmbeddings` 중 택해 호출 → 결과의
  `evidence`·`relatedSettings`를 `runStoryAnalysis`에 전달.
- **Role4 LangGraph**: `issue.evidenceIds`가 `evidence[].id`(`ev_...`)를 참조하도록 연결.
- **Role1 Frontend**: `relatedSettings[].chunkId`/`title`/`quote`로 근거 카드·그래프 노드 표시.
