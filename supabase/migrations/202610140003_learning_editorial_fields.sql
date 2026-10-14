-- Editorial fields used by the Learning Center author and article templates.
alter table public.learning_articles
  add column if not exists author_role text not null default '',
  add column if not exists author_avatar_url text not null default '',
  add column if not exists key_takeaways jsonb not null default '[]'::jsonb;

alter table public.learning_articles
  drop constraint if exists learning_articles_key_takeaways_array;
alter table public.learning_articles
  add constraint learning_articles_key_takeaways_array
  check (jsonb_typeof(key_takeaways) = 'array');
