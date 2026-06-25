-- analysis_results.provider 의 CHECK 제약이 초기 스키마에서 ('groq','ollama','mock')만
-- 허용했다. 그 뒤 openai / deepagent provider가 추가됐는데 제약이 갱신되지 않아,
-- 이 provider들이 성공해도 INSERT가 거부되어 분석 결과 저장이 실패했다.
-- (deepagent가 성공 -> provider='deepagent' -> 제약 위반 -> ANALYSIS_CREATE_FAILED)
-- 허용 목록에 'openai','deepagent'를 추가한다.

alter table analysis_results
  drop constraint if exists analysis_results_provider_check;

alter table analysis_results
  add constraint analysis_results_provider_check
  check (provider in ('groq', 'ollama', 'mock', 'openai', 'deepagent'));
