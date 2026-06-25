# Role 4 모델 비교표

이 문서는 Prompt / LangGraph / Demo 담당자가 발표 데모와 로컬 QA에 사용할 모델을 고르기 위한 기준입니다.
최종 목표는 "한국어 설정 붕괴 판단"보다 먼저 "깨지지 않는 JSON 반환"입니다.

기준일: 2026-06-20

## 결론

| 용도 | 권장 모델 | 이유 |
| --- | --- | --- |
| 배포 데모 | Groq `openai/gpt-oss-120b` | Groq strict structured outputs 지원 모델이라 JSON schema 안정성이 가장 중요할 때 우선 사용 |
| 배포 데모 대안 | Groq `llama-3.3-70b-versatile` | production model이고 한국어/추론 품질 후보로 적합하지만 strict schema 지원 여부는 별도 검증 필요 |
| 로컬 QA | Ollama `gpt-oss:20b` 또는 사용 가능한 `qwen3.5` 계열 | 로컬에서 structured JSON 테스트 가능, 비용 없이 반복 QA 가능 |
| fallback | `samples/mock-result.json` | 네트워크/API/model 실패 시 발표 흐름을 유지 |

## 판단 기준

| 기준 | 설명 | 우선순위 |
| --- | --- | --- |
| JSON 안정성 | `issues`, `nodes`, `edges`를 schema대로 반환하는 능력 | 가장 높음 |
| 한국어 이해 | 한국어 설정집과 원고의 충돌을 이해하는 능력 | 높음 |
| 속도 | 발표 중 응답 대기 시간이 길지 않은지 | 높음 |
| 비용/운영 | API 비용, rate limit, 로컬 실행 부담 | 중간 |
| 실패 대응 | 실패 시 mock fallback으로 전환 가능한지 | 높음 |

## Groq 후보

| 모델 | 장점 | 리스크 | 판단 |
| --- | --- | --- | --- |
| `openai/gpt-oss-120b` | Groq structured outputs strict mode 지원 모델. schema adherence가 중요할 때 유리 | 한국어 설정 붕괴 품질은 샘플로 확인 필요 | 배포 데모 1순위 |
| `openai/gpt-oss-20b` | strict mode 지원, 비용과 속도 부담이 낮음 | 복잡한 장문 추론은 120b보다 약할 수 있음 | 빠른 fallback 후보 |
| `llama-3.3-70b-versatile` | Groq production model, 긴 context와 좋은 추론 후보 | strict structured outputs 지원 모델 목록에는 없음. JSON mode/후검증 필요 | 품질 비교 후보 |
| `qwen/qwen3-32b` | reasoning 설정을 조정할 수 있는 후보 | Groq 문서상 preview model이므로 production 데모 기본값으로는 조심 | 실험 후보 |

## Ollama 후보

| 모델 | 장점 | 리스크 | 판단 |
| --- | --- | --- | --- |
| `gpt-oss:20b` | Ollama structured output 예시에서 사용되는 계열. 로컬 JSON QA에 적합 | 머신 성능에 따라 느릴 수 있음 | 로컬 QA 1순위 |
| `qwen3.5` 계열 | Ollama library에 최신 계열로 제공, reasoning/도구 계열 후보 | 설치 가능한 size는 개발 머신 성능에 맞춰 선택 필요 | 로컬 비교 후보 |
| `gemma4` 계열 | Ollama library에 reasoning/agentic workflow 후보로 제공 | 한국어/JSON 안정성은 샘플 검증 필요 | 보조 후보 |

## 사용 방침

1. 배포 데모에서는 Groq structured outputs를 우선 사용한다.
2. 모델 출력은 API로 바로 넘기지 않는다.
3. 항상 `validateOutput` 단계에서 다음을 검사한다.
   - `issues[].evidenceIds`가 실제 `evidence[].id`에 존재하는지
   - `issues[].relatedNodeIds`가 실제 `nodes[].id`에 존재하는지
   - `edges[].source`, `edges[].target`이 실제 `nodes[].id`에 존재하는지
4. 실패하면 `samples/mock-result.json`을 반환해 발표 흐름을 유지한다.

## 근거

- [Groq supported models](https://console.groq.com/docs/models) 문서 기준으로 production model과 preview model을 구분한다.
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs) 문서 기준으로 strict mode는 schema를 강하게 보장하지만 지원 모델이 제한된다.
- [Groq API reference](https://console.groq.com/docs/api-reference) 문서 기준으로 `json_schema`가 가능하면 structured outputs를 사용하고, 아니면 `json_object` JSON mode와 후검증을 사용한다.
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs) 문서 기준으로 로컬 API에서 `format: "json"` 또는 JSON schema를 줄 수 있다.
- [Ollama library](https://ollama.com/library) 기준으로 로컬 후보 모델은 실제 개발 머신에서 설치 가능한 크기로 골라야 한다.
