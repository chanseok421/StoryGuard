# Database Architecture

StoryGuard MVP uses Supabase Postgres as the database, but it does not expose Supabase directly to the frontend.

Frontend calls the Express API. The Express API authenticates the user with an HttpOnly cookie, then queries Supabase with the backend-only service role key. Real secrets live outside the repository in `C:\Secrets\storyguard.env`.

## Access Model

```mermaid
flowchart LR
  FE["Frontend"] -->|credentials included| API["Express API"]
  API -->|reads HttpOnly cookie| Session["storyguard_session"]
  API -->|service_role only| DB["Supabase Postgres"]
  DB --> Users["app_users"]
  DB --> Sessions["app_sessions"]
  DB --> Projects["projects"]
  DB --> Stories["story_documents"]
  DB --> Analyses["analysis_results"]
```

## ERD

```mermaid
erDiagram
  app_users ||--o{ app_sessions : "has sessions"
  app_users ||--o{ projects : "owns"
  app_users ||--o{ story_documents : "owns"
  app_users ||--o{ analysis_results : "owns"

  projects ||--o{ story_documents : "contains"
  projects ||--o{ analysis_results : "has analyses"

  story_documents ||--o{ analysis_results : "manuscript story"
  story_documents ||--o{ analysis_results : "settings story optional"

  app_users {
    uuid id PK
    text email UK
    text name
    text password_hash
    timestamptz created_at
  }

  app_sessions {
    uuid id PK
    uuid user_id FK
    text session_token_hash UK
    timestamptz expires_at
    timestamptz created_at
  }

  projects {
    uuid id PK
    uuid user_id FK
    text title
    text genre
    text description
    timestamptz created_at
    timestamptz updated_at
  }

  story_documents {
    uuid id PK
    uuid user_id FK
    uuid project_id FK
    text title
    text document_type
    text content
    text source_type
    timestamptz created_at
    timestamptz updated_at
  }

  analysis_results {
    uuid id PK
    uuid user_id FK
    uuid project_id FK
    uuid story_id FK
    uuid settings_story_id FK
    text provider
    boolean fallback_used
    jsonb summary
    jsonb response
    timestamptz created_at
  }
```

## Security Notes

- RLS is enabled on all app tables.
- No RLS policies are created for `anon` or `authenticated` roles in the MVP.
- `anon` and `authenticated` privileges are revoked from app tables.
- `service_role` has explicit table access for backend-only CRUD.
- The frontend must not call Supabase directly for these tables.
- The backend must add `user_id = currentUser.id` filters to every project, story, and analysis query.
- The `SUPABASE_SERVICE_ROLE_KEY` must stay server-side only.

Supabase may show `RLS Enabled No Policy` as an info-level advisor. For this MVP architecture, that is intentional because custom session auth is enforced by the Express backend.

## Useful SQL

Postgres does not support MySQL-style `show tables;`. Use this instead in Supabase SQL Editor:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

To inspect columns:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```
