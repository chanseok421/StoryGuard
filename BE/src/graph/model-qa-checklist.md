# 모델 QA 체크리스트

이 문서는 Groq/Ollama 후보 모델의 한국어 설정 붕괴 탐지 품질을 같은 기준으로 비교하기 위한 체크리스트입니다.
API key나 로컬 Ollama 환경이 있는 팀원이 이 문서대로 실행하면 모델 비교표를 갱신할 수 있습니다.

## 테스트 입력

입력은 `samples/role4-demo-story.md`의 설정집과 원고를 사용합니다.

기대 issue:

| 기대 id | type | severity | 반드시 찾아야 하는 근거 |
| --- | --- | --- | --- |
| `issue_001` | `world_rule_conflict` | `high` | 완전 부활 금지 vs 죽었던 민준이 되살아남 |
| `issue_002` | `timeline_conflict` | `medium` | 민준은 화재 사흘 뒤 복귀 vs 화재 다음 날 함께 조사 |
| `issue_003` | `foreshadowing_gap` | `low` | 푸른 나침반 복선 vs 단서 없이 동쪽 문 발견 |

## 평가 기준

총점 10점으로 평가합니다.

| 항목 | 점수 | 기준 |
| --- | ---: | --- |
| JSON 유효성 | 2 | JSON parse 가능, markdown/설명문 없음 |
| schema 일치 | 2 | `issues`, `nodes`, `edges` 필드와 필수 하위 필드 존재 |
| 충돌 탐지 | 3 | 의도된 오류 3개를 모두 찾음 |
| 근거 연결 | 2 | `evidenceIds`, `relatedNodeIds`, `edges`가 실제 id와 연결됨 |
| 한국어 품질 | 1 | reason/suggestion이 발표에서 읽을 수 있을 정도로 자연스러움 |

## 통과 기준

- 배포 데모 모델: 8점 이상
- 로컬 QA 모델: 7점 이상
- 6점 이하: fallback 또는 prompt 수정 필요

## 기록 양식

| 날짜 | 실행자 | 모델 | 환경 | 점수 | 실패 내용 | 결정 |
| --- | --- | --- | --- | ---: | --- | --- |
| 2026-06-20 | - | `openai/gpt-oss-120b` | Groq | 미실행 | API key 필요 | 후보 |
| 2026-06-20 | - | `llama-3.3-70b-versatile` | Groq | 미실행 | API key 필요 | 비교 후보 |
| 2026-06-20 | - | `gpt-oss:20b` | Ollama local | 미실행 | 로컬 설치 필요 | 로컬 QA 후보 |

## 실패 시 수정 순서

1. prompt에 "JSON 외 문장 금지"를 더 강하게 넣는다.
2. JSON schema 또는 `format: "json"`을 사용한다.
3. evidence 수를 3-5개로 줄인다.
4. issue type/severity 기준을 prompt에 더 짧게 넣는다.
5. 그래도 실패하면 `samples/mock-result.json` fallback을 사용한다.

