alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.projects enable row level security;
alter table public.story_documents enable row level security;
alter table public.analysis_results enable row level security;

revoke all on table public.app_users from anon, authenticated;
revoke all on table public.app_sessions from anon, authenticated;
revoke all on table public.projects from anon, authenticated;
revoke all on table public.story_documents from anon, authenticated;
revoke all on table public.analysis_results from anon, authenticated;

