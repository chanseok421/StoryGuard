# Supabase Schema Direction

Supabase is used as the backend database. The MVP uses custom email/password auth with HttpOnly session cookies. Supabase Auth and RLS may be adopted later, but the first MVP keeps auth inside the Express backend.

The main integration contract is still `AnalyzeResponse`.

## Required Direction

- Use `app_users` and `app_sessions` for MVP custom session auth.
- Store user-owned data with `user_id` and `project_id`.
- Backend API must force `user_id = currentSession.user.id` in every user-data query.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend.
- Store future embeddings in `story_chunks` with pgvector.
- Vector search must filter by `user_id` and `project_id`.

## Tables

The runnable SQL lives in `src/db/schema.sql`.

### app_users

```sql
create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  password_hash text not null,
  created_at timestamptz not null default now()
);
```

### app_sessions

```sql
create table app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

### projects

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  title text not null,
  genre text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### story_documents

```sql
create table story_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  document_type text not null check (document_type in ('settings', 'manuscript')),
  content text not null,
  source_type text not null default 'manual' check (source_type in ('manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### story_chunks

```sql
create extension if not exists vector;

create table story_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  document_id uuid references story_documents(id) on delete cascade,
  chunk_index integer not null,
  source_type text not null check (source_type in ('setting', 'manuscript')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
```

`story_chunks` can be added when RAG moves beyond keyword/in-memory retrieval.

### analysis_results

```sql
create table analysis_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  story_id uuid not null references story_documents(id) on delete cascade,
  settings_story_id uuid references story_documents(id) on delete set null,
  provider text not null check (provider in ('groq', 'ollama', 'mock')),
  fallback_used boolean not null default false,
  summary jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
```

## MVP Access Pattern

The Express backend reads `storyguard_session`, resolves the current user, and adds `user_id` filters to every query. Supabase Auth `auth.uid()` is not used in the MVP custom session flow.

Example:

```sql
select *
from projects
where user_id = current_user_id;
```

All app tables have RLS enabled, and no policies are created for `anon` or `authenticated` roles in the MVP. That is intentional: the frontend must go through the Express API, and the backend uses the service role key.

## Vector Search Safety

Vector search functions must include both ownership filters:

```sql
where story_chunks.user_id = current_user_id
  and story_chunks.project_id = target_project_id
```

Never search all chunks across users.

## Security Warnings

- Never expose a `service_role` key to the frontend.
- Do not store manuscripts in the server database without login.
- Do not query manuscripts or vectors without `user_id` filters.
- Do not let anonymous users query stored vectors from other users.
- Do not add broad RLS policies for `anon` or `authenticated` unless the frontend architecture changes.
- Supabase Auth and RLS can be revisited after the hackathon MVP.
