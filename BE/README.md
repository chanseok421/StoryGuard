# StoryGuard Backend

StoryGuard backend is contract-first for the hackathon MVP. The first goal is not a finished AI backend. The first goal is to let Frontend, RAG, and LangGraph work against one stable `AnalyzeResponse`.

## Current MVP Rule

- The real contract is `AnalyzeResponse`, not the database schema.
- Frontend should build from `samples/mock-result.json` first.
- API must return the same JSON shape even when an AI provider fails.
- RAG may start with keyword retrieval.
- LangGraph may start with a simple workflow.
- Supabase is used as the backend database, but the MVP still keeps `AnalyzeResponse` as the main integration contract.
- Real secrets live outside this repository.

## Ownership

| Area | Owner | Paths |
| --- | --- | --- |
| Backend/API | Backend | `src/api`, `src/shared`, `src/providers`, `src/db`, `docs/01-contract.md`, `docs/04-supabase-schema.md` |
| LangChain/RAG | RAG | `src/rag`, `docs/02-rag-interface.md` |
| Prompt/LangGraph | Prompt+LangGraph | `src/graph`, `docs/03-graph-interface.md` |
| Shared contract | Everyone, change carefully | `src/shared/types.ts`, `samples/mock-result.json` |

Before changing the shared contract, check with Frontend, RAG, and LangGraph owners.

## First Integration Flow

1. Frontend reads `samples/mock-result.json`.
2. Backend exposes `analyze(request)` from `src/api/analyze.ts`.
3. RAG implements `retrieveEvidence(input)` against `docs/02-rag-interface.md`.
4. LangGraph implements `runStoryAnalysis(input)` against `docs/03-graph-interface.md`.
5. Backend merges RAG and LangGraph outputs into `AnalyzeResponse`.

## Local Secrets

Do not put a real `.env` file in this repository.

Use this local file for secrets:

```txt
C:\Secrets\storyguard.env
```

Copy `.env.template` as a reference and fill the real values only in `C:\Secrets\storyguard.env`.

For local browser QA, make sure the secret file includes the frontend origin:

```env
CORS_ORIGIN=http://localhost:5173
```

Run without secrets for `/health`:

```bash
npm.cmd run dev
```

Run with Supabase/Auth secrets:

```bash
npm.cmd run dev:secrets
```

`dev:secrets` is a Windows convenience script that reads `C:\Secrets\storyguard.env`. For team QA across Windows and macOS, prefer Docker Compose from the workspace root:

```bash
# Windows default
docker compose up --build

# macOS/Linux
STORYGUARD_ENV_FILE="$HOME/Secrets/storyguard.env" docker compose up --build
```

Do not edit committed paths just for one machine. Each developer should keep their own secret file path outside the repository.

## Docker Compose Local QA

From the workspace root, run:

```bash
docker compose up --build
```

This compose setup injects `C:\Secrets\storyguard.env` only into the backend container. The frontend receives only `VITE_STORYGUARD_API_BASE_URL=http://localhost:4000`.

Current compose QA covers Auth, Project CRUD, Story CRUD, and saved Analysis APIs. The following endpoints should not return `404` in the current MVP:

- `POST /api/projects`
- `GET /api/projects?limit=20&offset=0`
- `GET /api/projects/:projectId/world-graph`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`
- `POST /api/projects/:projectId/stories`
- `GET /api/projects/:projectId/stories?documentType=manuscript&limit=20&offset=0`
- `GET /api/stories/:storyId`
- `PATCH /api/stories/:storyId`
- `DELETE /api/stories/:storyId`
- `POST /api/stories/:storyId/analyses`
- `GET /api/stories/:storyId/analyses?limit=20&offset=0`
- `GET /api/analyses/:analysisId`

When auth or env issues occur, inspect backend logs:

```bash
docker compose logs --tail 120 storyguard-be
```

On startup, the backend prints safe runtime diagnostics. `supabaseKeyStatus` must be `secret`; if it is `legacy_or_publishable`, the backend is probably using a publishable/anon-style key instead of the server secret.

## Logging

The backend writes structured one-line logs to stdout/stderr. Every HTTP response includes an `X-Request-Id` header, and request completion logs include `requestId`, `method`, `path`, `statusCode`, and `durationMs`.

Set `LOG_LEVEL` to control verbosity:

```env
LOG_LEVEL=info
```

Supported values are `debug`, `info`, `warn`, `error`, and `silent`. Use `debug` temporarily while investigating local issues, and keep `info` for normal local or compose QA.

## AI Analysis Provider

Story analysis can run in mock fallback mode or through an AI provider:

```env
AI_ANALYSIS_PROVIDER=mock
```

Supported values are `mock`, `groq`, and `ollama`. `mock` keeps the local rule-based fallback. For Groq, set `GROQ_API_KEY` and optionally `GROQ_ANALYSIS_MODEL=openai/gpt-oss-120b`. For local Ollama QA, set `AI_ANALYSIS_PROVIDER=ollama` and `OLLAMA_ANALYSIS_MODEL`.

Do not paste or share `docker compose config`, `docker inspect`, or container environment output because those commands can print secrets from `env_file`.
