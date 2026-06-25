# LangGraph 노드 초안

Role 4의 LangGraph는 처음부터 복잡하게 만들 필요가 없습니다.
MVP에서는 아래 5개 노드만 있으면 RAG 근거를 충돌 카드와 그래프 데이터로 바꿀 수 있습니다.

## 최소 노드 구성

```text
normalizeInput
      ↓
selectEvidence
      ↓
detectConflicts
      ↓
buildGraph
      ↓
validateOutput
```

## 1. normalizeInput

입력 텍스트와 RAG 결과를 분석하기 좋은 형태로 정리합니다.

입력:
- `request.settingsText`
- `request.manuscriptText`
- `evidence`
- `relatedSettings`

출력:
- trim 처리된 설정/원고
- 빈 evidence 제거
- 중복 evidence 제거

실패 시:
- 설정 또는 원고가 비어 있으면 빈 분석 결과로 종료할 수 있습니다.

## 2. selectEvidence

모델 또는 규칙 분석에 넣을 근거를 고릅니다.

역할:
- score가 높은 evidence 우선
- 원고 문장과 단어가 겹치는 evidence 우선
- 너무 많은 근거를 모델에 넣지 않도록 top-k 제한

권장:
- MVP top-k: 3-5개
- evidence가 없으면 issue를 만들지 않음

## 3. detectConflicts

선택된 evidence와 원고 문장을 비교해서 issue 후보를 만듭니다.

출력 후보:
- `type`
- `severity`
- `manuscriptQuote`
- `conflictingSetting`
- `reason`
- `suggestion`
- `evidenceIds`

이 단계에서 graph node/edge를 완성하려고 하지 않습니다.
먼저 충돌 카드 후보만 안정적으로 만듭니다.

## 4. buildGraph

issue 후보에서 Story Graph용 `nodes`, `edges`를 만듭니다.

노드 예시:
- 인물: `char_harin`
- 규칙: `rule_no_resurrection`
- 사건: `event_palace_fire`
- 장소: `place_capital`
- 복선: `foreshadow_blue_compass`
- 이슈: `issue_001`

edge 예시:
- issue -> rule: `violates`
- issue -> character: `relationship`
- event -> place: `located_at`
- foreshadow -> place: `foreshadows`

## 5. validateOutput

최종 반환 전에 깨진 id를 제거합니다.

필수 검증:
- 모든 `issue.evidenceIds`는 입력 `evidence.id`에 존재해야 합니다.
- 모든 `issue.relatedNodeIds`는 출력 `nodes.id`에 존재해야 합니다.
- 모든 `edge.source`, `edge.target`은 출력 `nodes.id`에 존재해야 합니다.
- `summary`는 Backend에서 계산하므로 이 함수에서는 만들지 않습니다.

## fallback 흐름

모델 호출, JSON parse, schema 검증 중 하나라도 실패하면 아래 순서로 대응합니다.

1. 규칙 기반 `runStoryAnalysis.ts` 결과 사용
2. 그래도 실패하면 `{ issues: [], nodes: [], edges: [] }` 반환
3. Backend가 필요하면 `samples/mock-result.json`으로 발표 fallback 처리

