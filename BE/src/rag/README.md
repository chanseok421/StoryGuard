# RAG: retrieveEvidence

이 폴더는 설정집과 원고를 받아서 LangGraph/Role 4가 사용할 근거를 찾아주는 부분입니다.
현재 핵심 파일은 `retrieveEvidence.ts`입니다.

## retrieveEvidence가 하는 일

`retrieveEvidence(input)`은 아래 입력을 받습니다.

- `projectId`: 선택 값
- `settingsText`: 사용자가 입력한 설정집
- `manuscriptText`: 새로 검사할 원고

그리고 아래 결과를 반환합니다.

- `chunks`: 설정집을 나눈 조각
- `evidence`: Role 4가 issue에 연결할 근거 문장
- `relatedSettings`: 원고와 관련 있어 보이는 설정 조각

이 함수는 최종 issue를 만들지 않습니다. issue, graph node, graph edge는
`src/graph/runStoryAnalysis.ts`에서 만듭니다.

## 현재 구현 방식

현재는 embedding/vector DB가 아니라 해커톤 통합을 위한 keyword 기반 stub입니다.

```text
settingsText를 문단 단위로 chunk로 나눈다
        ↓
manuscriptText에서 검색어를 뽑는다
        ↓
검색어가 많이 겹치는 설정 chunk를 고른다
        ↓
chunks / evidence / relatedSettings 형태로 반환한다
```

이 구현의 목적은 RAG 담당 구현이 완성되기 전에 Backend와 Role 4가 같은 인터페이스로
작업할 수 있게 만드는 것입니다.

## Role 4와 맞춰야 하는 약속

- `evidence[].id`는 Role 4의 `issues[].evidenceIds`에 들어갈 수 있어야 합니다.
- `evidence[].chunkId`는 가능하면 `chunks[].id`와 연결되어야 합니다.
- `relatedSettings`는 top 3-5개 정도만 반환합니다.
- 검색 실패나 빈 입력에서는 throw하지 않고 빈 배열을 반환합니다.

반환 실패 예시는 아래 형태입니다.

```ts
{
  chunks: [],
  evidence: [],
  relatedSettings: []
}
```

## 나중에 바꿀 방향

외부 함수 계약은 유지합니다.

```ts
retrieveEvidence(input) -> { chunks, evidence, relatedSettings }
```

내부 구현만 단계적으로 바꿉니다.

1. 현재 단계: keyword 기반 in-memory 검색
2. 다음 단계: chunking 규칙 개선과 score 계산 개선
3. 그 다음 단계: embedding 기반 검색
4. 최종 단계: Supabase pgvector나 별도 vector store 연결

Backend와 Role 4는 내부 검색 방식에 의존하면 안 됩니다.

## 테스트

repository root에서 실행합니다.

```bash
node --test src/rag/retrieveEvidence.test.mjs
```

