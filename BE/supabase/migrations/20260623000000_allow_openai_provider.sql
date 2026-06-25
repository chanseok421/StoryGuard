-- 분석 provider에 openai 추가 (analysis_results.provider CHECK 확장)
alter table public.analysis_results
  drop constraint if exists analysis_results_provider_check;

alter table public.analysis_results
  add constraint analysis_results_provider_check
  check (provider in ('groq', 'ollama', 'mock', 'openai'));
