# Supabase Migration Log

StoryGuard uses Supabase Postgres behind the Express backend.

The frontend must not call Supabase directly for MVP app tables. The backend reads the HttpOnly session cookie, identifies the current app user, and queries Supabase with the server-only secret key.

## 2026-06-20

### `20260620070222_init_storyguard_schema`

**Reason**

The backend needed a first persistent schema for the MVP flow:

- simple email/password app user
- custom backend session
- project ownership
- story document storage
- analysis result storage

This migration was created so the auth API and later Project/Story CRUD can share the same table names and ownership model.

**Changed**

- Enabled `pgcrypto` for `gen_random_uuid()`.
- Created `app_users`.
- Created `app_sessions`.
- Created `projects`.
- Created `story_documents`.
- Created `analysis_results`.
- Added indexes on `app_sessions.user_id` and `app_sessions.expires_at`.

**Error Or Warning Context**

No runtime error caused this migration. It was the first DB baseline after the team decided that MVP integration should still prioritize `AnalyzeResponse`, while DB tables prepare v1 persistence.

**Verification**

- Supabase project accepted the migration.
- Table list later showed all five app tables in `public`.

**Notes**

This migration did not finish the security model by itself. RLS was handled in the next migration.

---

### `20260620070652_enable_rls_for_app_tables`

**Reason**

Supabase security checks reported app tables in the exposed `public` schema without RLS. Even though the frontend should not call Supabase directly, tables in `public` should be protected as defense in depth.

**Changed**

- Enabled RLS on:
  - `app_users`
  - `app_sessions`
  - `projects`
  - `story_documents`
  - `analysis_results`
- Revoked all table privileges from:
  - `anon`
  - `authenticated`

**Error Or Warning Context**

Supabase advisor reported RLS-related security warnings after the initial schema migration.

**Verification**

- RLS was enabled on all MVP app tables.
- `anon` and `authenticated` no longer have table access to these backend-owned tables.

**Notes**

Supabase may still show an info-level warning like `RLS Enabled No Policy`. For this MVP, that is intentional because:

- the app is not using Supabase Auth for these tables
- the frontend does not query Supabase directly
- the Express backend enforces ownership with `user_id` filters
- the backend uses the server-only secret key

If the frontend later calls Supabase directly, this decision must be revisited and proper RLS policies must be added before exposing data.

---

### `20260620073033_grant_app_table_access_to_service_role`

**Reason**

The signup API returned:

```json
{
  "error": {
    "code": "SIGNUP_FAILED",
    "message": "Failed to create user."
  }
}
```

The backend could reach the server, but it could not create rows in `app_users` / `app_sessions`.

**Changed**

- Granted `usage` on schema `public` to `service_role`.
- Granted `select`, `insert`, `update`, `delete` on all MVP app tables to `service_role`.

**Error Or Warning Context**

The Supabase project had automatic table exposure disabled, and the previous migration revoked access from public API roles. The backend is intentionally using a server-only secret key, so `service_role` needed explicit table privileges for app CRUD.

**Verification**

- Table grants were checked after applying the migration.
- `service_role` has CRUD privileges on:
  - `app_users`
  - `app_sessions`
  - `projects`
  - `story_documents`
  - `analysis_results`

**Notes**

This does not mean the frontend can use the secret key. `SUPABASE_SERVICE_ROLE_KEY` must stay only in the backend runtime, currently loaded from `C:\Secrets\storyguard.env`.

The backend must still filter every project, story, and analysis query with the current session user id.

