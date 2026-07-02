<div align="center">

# 📖 StoryGuard

### 소설 설정 붕괴 검출기 · *Continuity Guardian for Fiction*

원고를 읽고 **세계관·타임라인·캐릭터·복선**의 모순을 찾아내는 AI 분석 엔진.
작가가 놓친 설정 충돌을 근거 인용과 함께 짚어 줍니다.

[![Live Demo](https://img.shields.io/badge/demo-story--guard--two.vercel.app-000?logo=vercel&logoColor=white)](https://story-guard-two.vercel.app)
![Frontend](https://img.shields.io/badge/frontend-Vite%20%2B%20React%2019-61DAFB?logo=react&logoColor=black)
![Backend](https://img.shields.io/badge/backend-Express%20%2B%20TypeScript-3178C6?logo=typescript&logoColor=white)
![Agent](https://img.shields.io/badge/engine-LangGraph%20deep%20agent-1C3C3C?logo=langchain&logoColor=white)

</div>

---

## ✨ 무엇을 하나요

작가가 긴 원고를 쓰다 보면 초반 설정과 후반 전개가 어긋나기 쉽습니다.
StoryGuard는 **설정집 + 원고**를 함께 받아, 아래 유형의 모순을 자동으로 찾아냅니다.

| 유형 | 예시 |
| --- | --- |
| 🌍 **세계관 규칙 충돌** | "마법은 밤에만 쓸 수 있다"고 해놓고 대낮에 마법을 씀 |
| ⏳ **타임라인 충돌** | 3일 전 죽은 인물이 오늘 대화에 등장 |
| 👤 **캐릭터 충돌** | 파란 눈으로 소개된 인물이 나중에 갈색 눈으로 묘사됨 |
| 🔗 **인과 충돌** | 원인 없이 결과만 등장하는 전개 |
| 🎯 **복선 회수 누락** | 심어둔 복선이 끝까지 회수되지 않음 |

각 이슈는 **원고 인용 · 충돌하는 설정 · 이유 · 수정 제안**과 함께 반환되며,
등장인물·사건·규칙을 잇는 **월드 그래프**로도 시각화됩니다.

---

## 🧠 핵심: 두 갈래 분석 엔진

StoryGuard의 분석기는 하나의 `StoryAnalysisProvider` 인터페이스 뒤에서 두 방식으로 동작합니다.
덕분에 라우트·검증·폴백 로직은 어떤 엔진을 쓰든 그대로입니다.

### 1. 단일 프롬프트 RAG 파이프라인 (`groq` / `openai` / `ollama`)
근거를 한 번 검색(RAG)한 뒤, LLM 한 번 호출로 JSON 결과를 생성하는 가볍고 빠른 경로. 짧은 입력에 적합.

### 2. LangGraph Deep Agent (`deepagent`)
긴 원고·복잡한 검토를 위한 다중 에이전트 오케스트레이션.

```
Orchestrator  ──write_todos──▶  원고를 장 단위로 계획
     │
     ├─▶ world-rule-checker  ─┐
     ├─▶ timeline-checker     │   각 서브에이전트가 필요할 때
     ├─▶ character-checker    ├─  search_settings 툴로 RAG 검색
     └─▶ foreshadow-checker  ─┘
     │
     └─▶ 종합 → toolStrategy 구조화 출력
              └─ afterModel 미들웨어: 인용이 실제 원고에 있는지
                 groundedness 검사 → 환각이면 jumpTo:"model" 재실행
```

- **툴로서의 RAG** — 고정 top-K를 미리 넘기지 않고, 에이전트가 필요할 때 `search_settings`를 호출
- **자기 교정 루프** — 인용의 근거성(groundedness)을 검사해 환각을 발견하면 스스로 다시 돎
- **호출 스로틀링** — 오케스트레이터+서브에이전트가 하나의 게이트를 공유해 낮은 TPM 티어에서도 429 없이 완주
- **안전한 폴백** — 에이전트 실패 시 규칙 기반 결과로 자동 대체 (다른 프로바이더와 동일)

> 검증: `gpt-4o` + 스로틀링으로 tier-1 OpenAI 계정에서 심어둔 충돌 3/3 검출, 환각·429·폴백 없음 (~99초).

---

## 🏗 아키텍처

```
┌─────────────┐        ┌──────────────────┐        ┌──────────────┐
│  FE (React) │──HTTP─▶│  BE (Express/TS) │──────▶ │  AI Provider │
│  Vercel     │        │  Render          │        │  RAG · Agent │
└─────────────┘        └────────┬─────────┘        └──────────────┘
                                │
                        ┌───────┴────────┐
                        │  Supabase (DB) │  프로젝트·원고·분석 결과
                        │  Qdrant (벡터) │  임베딩 검색
                        └────────────────┘
```

모든 프로바이더는 동일한 `AnalyzeResponse` 계약을 반환합니다 — AI가 실패해도 JSON 형태는 동일.

---

## 📂 모노레포 구성

| 폴더 | 스택 | 배포 |
| --- | --- | --- |
| [`BE/`](BE) | Express · TypeScript · LangGraph · Supabase · Qdrant | Render |
| [`FE/`](FE) | Vite · React 19 · TypeScript | Vercel |

각 폴더의 `README` / `package.json`에 상세 실행법이 있습니다.

---

## 🚀 빠른 시작

```bash
# 백엔드
cd BE
npm install
npm run dev            # /health 만 (시크릿 없이)
npm run dev:secrets    # Supabase/AI 시크릿 포함 (C:\Secrets\storyguard.env)

# 프론트엔드
cd FE
npm install
npm run dev            # http://127.0.0.1:5173
```

AI 프로바이더는 환경변수로 전환합니다:

```env
AI_ANALYSIS_PROVIDER=deepagent   # mock | groq | ollama | openai | deepagent
```

> 시크릿은 저장소 밖(`C:\Secrets\storyguard.env`)에 두며, 커밋하지 않습니다.
> 팀 QA는 워크스페이스 루트에서 `docker compose up --build` 권장.

---

## 🧪 테스트

```bash
cd BE && npm test      # 계약·그래프·RAG 유닛 테스트
cd FE && npm test      # Vitest
```

---

<div align="center">
<sub>Backend · Frontend · RAG · LangGraph — 하나의 <code>AnalyzeResponse</code> 계약 위에서.</sub>
</div>
