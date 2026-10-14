-- Learning Center CMS, newsletter capture, and HQ authorization.
-- Run in Supabase SQL Editor after creating the owner's Auth user and replacing
-- the UUID below with that user's auth.users.id.

create table if not exists public.clicksable_hq_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_clicksable_hq_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clicksable_hq_admins a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_clicksable_hq_admin() from public;
grant execute on function public.is_clicksable_hq_admin() to authenticated;
create or replace function public.is_clicksable_hq_admin_mfa()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_clicksable_hq_admin()
    and (auth.jwt() ->> 'aal') = 'aal2';
$$;
revoke all on function public.is_clicksable_hq_admin_mfa() from public;
grant execute on function public.is_clicksable_hq_admin_mfa() to authenticated;

alter table public.clicksable_hq_admins enable row level security;
revoke all on public.clicksable_hq_admins from anon, authenticated;
grant select on public.clicksable_hq_admins to authenticated;
drop policy if exists "HQ admins can read own allowlist row" on public.clicksable_hq_admins;
create policy "HQ admins can read own allowlist row" on public.clicksable_hq_admins
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.learning_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 5 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt text not null default '' check (char_length(excerpt) <= 360),
  body_html text not null default '',
  cover_image_url text not null default '',
  category text not null default 'Insights',
  tags text[] not null default '{}',
  author_name text not null default 'Clicksable',
  seo_title text not null default '',
  seo_description text not null default '' check (char_length(seo_description) <= 320),
  canonical_url text not null default '',
  geo_faq jsonb not null default '[]'::jsonb check (jsonb_typeof(geo_faq) = 'array'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists learning_articles_public_order on public.learning_articles (published_at desc, sort_order) where status = 'published';
alter table public.learning_articles enable row level security;
revoke all on public.learning_articles from anon, authenticated;
grant select on public.learning_articles to anon, authenticated;
grant insert, update, delete on public.learning_articles to authenticated;
drop policy if exists "Anyone can read published learning articles" on public.learning_articles;
create policy "Anyone can read published learning articles" on public.learning_articles
  for select to anon, authenticated using (status = 'published' and published_at <= now());
drop policy if exists "HQ admins can manage learning articles" on public.learning_articles;
create policy "HQ admins can manage learning articles" on public.learning_articles
  for all to authenticated using ((select public.is_clicksable_hq_admin_mfa()))
  with check ((select public.is_clicksable_hq_admin_mfa()));

create table if not exists public.learning_settings (
  setting_key text primary key check (setting_key in ('youtube_channel_url','youtube_video_urls','newsletter_label')),
  setting_value text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.learning_settings enable row level security;
revoke all on public.learning_settings from anon, authenticated;
grant select on public.learning_settings to anon, authenticated;
grant insert, update, delete on public.learning_settings to authenticated;
drop policy if exists "Anyone can read learning settings" on public.learning_settings;
create policy "Anyone can read learning settings" on public.learning_settings
  for select to anon, authenticated using (true);
drop policy if exists "HQ admins can manage learning settings" on public.learning_settings;
create policy "HQ admins can manage learning settings" on public.learning_settings
  for all to authenticated using ((select public.is_clicksable_hq_admin_mfa()))
  with check ((select public.is_clicksable_hq_admin_mfa()));

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(trim(email)) and email ~* '^[A-Z0-9._%+%-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  consented_at timestamptz not null,
  source text not null default 'learning-center' check (source = 'learning-center'),
  status text not null default 'pending' check (status in ('pending','subscribed','unsubscribed')),
  created_at timestamptz not null default now()
);
alter table public.newsletter_subscribers enable row level security;
revoke all on public.newsletter_subscribers from anon, authenticated;
grant insert on public.newsletter_subscribers to anon, authenticated;
grant select, update on public.newsletter_subscribers to authenticated;
drop policy if exists "Public can request newsletter subscription" on public.newsletter_subscribers;
create policy "Public can request newsletter subscription" on public.newsletter_subscribers
  for insert to anon, authenticated with check (status = 'pending' and source = 'learning-center' and consented_at <= now());
drop policy if exists "HQ admins can review subscribers" on public.newsletter_subscribers;
create policy "HQ admins can review subscribers" on public.newsletter_subscribers
  for select to authenticated using ((select public.is_clicksable_hq_admin_mfa()));
drop policy if exists "HQ admins can update subscriber status" on public.newsletter_subscribers;
create policy "HQ admins can update subscriber status" on public.newsletter_subscribers
  for update to authenticated using ((select public.is_clicksable_hq_admin_mfa()))
  with check ((select public.is_clicksable_hq_admin_mfa()));

-- Initial owner allowlist. Replace the UUID and run once:
-- insert into public.clicksable_hq_admins(user_id) values ('YOUR-AUTH-USER-UUID');

-- Replace legacy policies on the existing HQ tables. This keeps the creator
-- portal's required self-service reads/writes while reserving HQ operations
-- for an allowlisted account with verified MFA (aal2).
do $$
declare t text; p record;
begin
  foreach t in array array['campaigns','creators','video_submissions','announcements','support_messages','leads'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy %I on public.%I', p.policyname, t);
      end loop;
    end if;
  end loop;
end $$;

-- Campaigns are public only while active; only an HQ account with MFA edits them.
grant select on public.campaigns to anon, authenticated;
grant insert, update, delete on public.campaigns to authenticated;
create policy "Visitors can read active campaigns" on public.campaigns for select to anon, authenticated using (status = 'Active');
create policy "MFA HQ admins manage campaigns" on public.campaigns for all to authenticated using ((select public.is_clicksable_hq_admin_mfa())) with check ((select public.is_clicksable_hq_admin_mfa()));

-- Creator records are isolated by their Supabase Auth user id.
grant select, insert, update, delete on public.creators to authenticated;
create policy "Creators read own profile" on public.creators for select to authenticated using (creator_id::text = (select auth.uid())::text);
create policy "Creators create own profile" on public.creators for insert to authenticated with check (creator_id::text = (select auth.uid())::text);
create policy "Creators update own profile" on public.creators for update to authenticated using (creator_id::text = (select auth.uid())::text) with check (creator_id::text = (select auth.uid())::text);
create policy "MFA HQ admins manage creator profiles" on public.creators for all to authenticated using ((select public.is_clicksable_hq_admin_mfa())) with check ((select public.is_clicksable_hq_admin_mfa()));

-- Creators can submit and view only their own pending submissions; payment,
-- approval, and other moderation updates are restricted to MFA-enabled HQ.
grant select, insert, update, delete on public.video_submissions to authenticated;
create policy "Creators read own video submissions" on public.video_submissions for select to authenticated using (creator_id::text = (select auth.uid())::text);
create policy "Creators submit own unpaid videos" on public.video_submissions for insert to authenticated with check (creator_id::text = (select auth.uid())::text and status = 'Pending' and coalesce(views,0) = 0 and coalesce(earnings,0) = 0);
create policy "MFA HQ admins manage video submissions" on public.video_submissions for all to authenticated using ((select public.is_clicksable_hq_admin_mfa())) with check ((select public.is_clicksable_hq_admin_mfa()));

-- Published announcements are readable in the creator portal; administration
-- is reserved for HQ.
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
create policy "Anyone can read published announcements" on public.announcements for select to anon, authenticated using (published = true);
create policy "MFA HQ admins manage announcements" on public.announcements for all to authenticated using ((select public.is_clicksable_hq_admin_mfa())) with check ((select public.is_clicksable_hq_admin_mfa()));

-- Creator support messages are private to their owner and the MFA-protected HQ.
grant select, insert, update, delete on public.support_messages to authenticated;
create policy "Creators read own support messages" on public.support_messages for select to authenticated using (creator_id::text = (select auth.uid())::text);
create policy "Creators send own support messages" on public.support_messages for insert to authenticated with check (creator_id::text = (select auth.uid())::text and sender = 'creator');
create policy "MFA HQ admins manage support messages" on public.support_messages for all to authenticated using ((select public.is_clicksable_hq_admin_mfa())) with check ((select public.is_clicksable_hq_admin_mfa()));

-- Lead submissions remain insert-only for public project forms. No public
-- reader can retrieve another person's contact information.
grant insert on public.leads to anon, authenticated;
grant select, update, delete on public.leads to authenticated;
create policy "Visitors can submit project inquiries" on public.leads for insert to anon, authenticated with check (true);
create policy "MFA HQ admins can review project inquiries" on public.leads for select to authenticated using ((select public.is_clicksable_hq_admin_mfa()));
create policy "MFA HQ admins can update project inquiries" on public.leads for update to authenticated using ((select public.is_clicksable_hq_admin_mfa())) with check ((select public.is_clicksable_hq_admin_mfa()));
create policy "MFA HQ admins can remove project inquiries" on public.leads for delete to authenticated using ((select public.is_clicksable_hq_admin_mfa()));
