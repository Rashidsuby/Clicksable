-- Restore Learning Center table privileges without changing the MFA-protected RLS policies.
grant usage on schema public to anon, authenticated;
grant select on table public.learning_articles to anon, authenticated;
grant insert, update, delete on table public.learning_articles to authenticated;

-- Ask PostgREST to reload its schema and privilege metadata.
notify pgrst, 'reload schema';
