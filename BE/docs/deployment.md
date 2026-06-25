# StoryGuard 배포 가이드 (Render + Vercel)

## 구성
```
Frontend (Vite/React)  ──HTTPS──▶  Backend (Express/Docker)  ──▶  Supabase (이미 클라우드)
   Vercel (정적)                      Render (컨테이너)              + OpenAI API (deepagent)
```
- VectorStore = **memory** (외부 벡터DB 없음). deepagent는 settingsText 키워드 검색으로 동작.
- 임베딩 = **OpenAI** (클라우드엔 Ollama 없음).
- 분석 모델 = **gpt-4o-mini** (배포본 요청 타임아웃 안전. gpt-4o는 1~3분이라 위험).

> ⚠️ memory 스토어는 프로세스 재시작 시 사라진다(임베딩 인덱스 한정). 분석 자체는 매 요청마다
> settingsText로 검색하므로 영향 없음. 영구 RAG가 필요하면 나중에 pgvector/Qdrant로 교체.

---

## 순서 (도메인 의존성 때문에 이 순서가 중요)

### 1. 백엔드 → Render
**A. Blueprint로(권장)**
1. Render 대시보드 → **New → Blueprint** → 이 GitHub 레포 선택 (`render.yaml` 자동 인식)
2. `sync:false` 값들을 입력:
   - `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGIN` → **아직 프론트 URL을 모르니 임시로** `https://example.com` 넣고, 3단계 후 교체
3. Deploy → 빌드 완료되면 백엔드 URL 확보: `https://storyguard-be-xxxx.onrender.com`
4. 헬스 체크: 브라우저에서 `…onrender.com/health` → `{"ok":true}` 확인

**B. 수동으로**
- New → **Web Service** → 레포 선택 → Root Directory `BE`, Runtime `Docker`, Health Check Path `/health`
- Environment 탭에서 `render.yaml`의 envVars를 동일하게 입력

### 2. 프론트엔드 → Vercel
1. Vercel → **Add New → Project** → 같은 레포 선택
2. **Root Directory = `FE`** (Vercel이 Vite 자동 감지)
3. Environment Variables:
   - `VITE_STORYGUARD_API_BASE_URL` = 1단계의 백엔드 URL (`https://storyguard-be-xxxx.onrender.com`)
4. Deploy → 프론트 URL 확보: `https://storyguard-xxxx.vercel.app`

### 3. 백엔드 CORS 교체 (필수)
1. Render → storyguard-be → Environment → `CORS_ORIGIN` = **2단계의 프론트 URL**
2. Save → 자동 재배포

이제 프론트 URL로 접속 → 회원가입/로그인 → 분석하기 동작.

---

## 배포 전 체크리스트
- [ ] Supabase 마이그레이션 적용됨 (특히 `provider` CHECK에 deepagent 포함 — 이미 SQL 실행함)
- [ ] `OPENAI_API_KEY` 가 결제 가능한 계정 (deepagent는 실제 OpenAI 호출)
- [ ] `CORS_ORIGIN` = 정확한 프론트 도메인 (끝 슬래시 없이)
- [ ] `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none` (크로스도메인 로그인 유지)

## 자주 막히는 곳
| 증상 | 원인 | 해결 |
|---|---|---|
| 로그인해도 바로 풀림 | 크로스도메인 쿠키 미전송 | `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` (코드 반영됨) |
| CORS 에러 | `CORS_ORIGIN` 불일치 | 프론트 실제 도메인으로, 끝 슬래시 제거 |
| 분석이 503/타임아웃 | gpt-4o가 너무 김 | `DEEPAGENT_MODEL=gpt-4o-mini` 유지 |
| 분석 결과 저장 실패 | DB `provider` CHECK | `20260625120000_allow_openai_deepagent_provider.sql` 적용 |
| 첫 요청이 느림 | Render free 콜드스타트 | 정상(슬립 후 첫 깨어남). 유료 플랜이면 없음 |

## 추후 업그레이드(선택)
- **영구 RAG**: `VECTOR_STORE=pgvector`(Supabase 재사용) 또는 Qdrant Cloud + `EMBEDDING_PROVIDER`/차원 정합
- **품질↑**: OpenAI 티어 상향 후 `DEEPAGENT_MODEL=gpt-4o` + `DEEPAGENT_REQUESTS_PER_SECOND` 상향
- **비동기 분석**: 긴 분석을 작업 큐로 빼고 결과 폴링(타임아웃 회피)
