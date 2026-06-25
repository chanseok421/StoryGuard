grant usage on schema public to service_role;

grant select, insert, update, delete on table public.app_users to service_role;
grant select, insert, update, delete on table public.app_sessions to service_role;
grant select, insert, update, delete on table public.projects to service_role;
grant select, insert, update, delete on table public.story_documents to service_role;
grant select, insert, update, delete on table public.analysis_results to service_role;

