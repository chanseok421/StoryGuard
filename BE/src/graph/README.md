# Role 4: Prompt / LangGraph / Demo

이 폴더는 RAG가 찾아준 근거를 받아서 프론트엔드가 보여줄 분석 결과로 바꾸는 부분입니다.
현재 핵심 파일은 `runStoryAnalysis.ts`입니다.

## Role 4 산출물 위치

| 산출물 | 파일 |
| --- | --- |
| 모델 비교표 | `src/graph/model-decision.md` |
| 모델 QA 체크리스트 | `src/graph/model-qa-checklist.md` |
| prompt 초안 | `src/graph/prompt-draft.md` |
| LangGraph 노드 목록 | `src/graph/langgraph-nodes.md` |
| 샘플 작품/설정/원고 | `samples/role4-demo-story.md` |
| mock JSON | `samples/mock-result.json` |
| graph 분석 함수 | `src/graph/runStoryAnalysis.ts` |
| 계약 테스트 | `src/graph/runStoryAnalysis.test.mjs`, `src/graph/mockResultContract.test.mjs` |

## runStoryAnalysis가 하는 일

`runStoryAnalysis(input)`은 아래 입력을 받습니다.

- `request`: 사용자가 입력한 설정집과 원고
- `evidence`: RAG가 찾은 근거 문장
- `relatedSettings`: RAG가 찾은 관련 설정

그리고 아래 결과를 반환합니다.

- `issues`: 충돌 카드
- `nodes`: Story Graph에 표시할 노드
- `edges`: 노드 사이의 관계선

즉 전체 흐름에서 이 폴더는 다음 위치입니다.

```text
settingsText / manuscriptText
        ↓
RAG: 관련 근거 검색
        ↓
runStoryAnalysis: 근거를 충돌 카드와 그래프 데이터로 변환
        ↓
Backend: AnalyzeResponse로 합치기
        ↓
Frontend: 카드와 그래프 렌더링
```

## 지금 구현이 하드코딩처럼 보이는 이유

현재 `runStoryAnalysis.ts`에는 `ISSUE_TEMPLATES`라는 규칙 묶음이 있습니다.
여기에는 데모에서 사용할 충돌 유형, 키워드, 제목, 이유, 제안 문구, graph node/edge가 들어 있습니다.

예를 들면 이런 방식입니다.

```text
원고에 "부활", "되살", "죽었던" 같은 말이 있고
설정/RAG 근거에 "죽은 사람", "부활", "되돌리기" 같은 말이 있으면
→ world_rule_conflict issue를 만든다
```

이 방식은 최종 분석기가 아닙니다. 해커톤 중에 RAG, Backend, Frontend가 동시에 작업할 수 있도록
먼저 결과 JSON의 모양과 연결 규칙을 고정하기 위한 데모용 구현입니다.

## 지금 만든 것의 의미

현재 코드는 진짜 AI 분석 능력을 완성한 것이 아니라, 아래 약속을 코드로 고정한 것입니다.

```text
RAG가 evidence를 준다
        ↓
Role 4가 issues / nodes / edges를 만든다
        ↓
모든 issue는 evidenceIds로 근거와 연결된다
        ↓
모든 issue는 relatedNodeIds로 그래프 노드와 연결된다
        ↓
모든 edge는 실제 존재하는 node id만 사용한다
```

이 약속이 있어야 프론트엔드는 카드와 그래프를 만들 수 있고, 백엔드는 RAG/LangGraph 결과를
`AnalyzeResponse`로 합칠 수 있습니다.

## 나중에 하드코딩을 줄이는 방법

외부에서 지켜야 하는 함수 계약은 유지합니다.

```ts
runStoryAnalysis(input) -> { issues, nodes, edges }
```

대신 내부 구현을 단계적으로 바꿉니다.

1. 현재 단계: 데모용 키워드 규칙으로 issue 생성
2. 다음 단계: `input.evidence`와 원고 문장을 비교해서 issue 후보 생성
3. 그 다음 단계: Groq/Ollama가 실제 충돌을 판단하도록 prompt 추가
4. 최종 단계: LangGraph 노드를 `normalize -> detect -> build -> validate`로 분리

중요한 점은 모델이 만든 결과를 바로 API로 넘기면 안 된다는 것입니다.
항상 마지막에 id 검증을 해서 깨진 `evidenceIds`, `relatedNodeIds`, `edges`를 제거해야 합니다.

## 수정할 때 지켜야 할 것

- `runStoryAnalysis(input)` 함수 이름과 반환 구조는 유지합니다.
- 반환 타입은 `GraphAnalysisResult`와 맞아야 합니다.
- `issues[].evidenceIds`는 실제 `input.evidence[].id`에 있는 값만 넣습니다.
- `issues[].relatedNodeIds`는 실제 `nodes[].id`에 있는 값만 넣습니다.
- `edges[].source`, `edges[].target`도 실제 `nodes[].id`여야 합니다.
- 새로운 충돌 유형이나 필드를 추가하려면 `src/shared/types.ts`와 문서 계약을 먼저 확인해야 합니다.

## 테스트

Role 4 결과 연결이 깨지지 않는지 확인하려면 repository root에서 실행합니다.

```bash
node --test src/graph/runStoryAnalysis.test.mjs
node --test src/graph/mockResultContract.test.mjs
```
