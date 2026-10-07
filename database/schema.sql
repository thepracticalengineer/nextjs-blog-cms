-- ============================================
-- Blog CMS Schema
-- Run in Supabase SQL Editor
-- ============================================

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  email      text not null,
  full_name  text,
  avatar_url text,
  role       text not null default 'author' check (role in ('admin', 'author')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Categories
create table if not exists public.categories (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  slug        text not null unique,
  description text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Tags
create table if not exists public.tags (
  id         uuid default gen_random_uuid() primary key,
  name       text not null,
  slug       text not null unique,
  created_at timestamptz default now()
);

-- Posts
create table if not exists public.posts (
  id              uuid default gen_random_uuid() primary key,
  title           text not null,
  slug            text not null unique,
  excerpt         text,
  content         text,  -- TipTap JSON stringified
  cover_image     text,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  author_id       uuid references public.profiles(id) on delete set null,
  category_id     uuid references public.categories(id) on delete set null,
  seo_title       text,
  seo_description text,
  published_at    timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Post Tags (join table)
create table if not exists public.post_tags (
  post_id uuid references public.posts(id) on delete cascade,
  tag_id  uuid references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

-- ============================================
-- INDEXES
-- ============================================

create index if not exists posts_author_id_idx on public.posts(author_id);
create index if not exists posts_category_id_idx on public.posts(category_id);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists posts_slug_idx on public.posts(slug);
create index if not exists posts_published_at_idx on public.posts(published_at desc);
create index if not exists categories_slug_idx on public.categories(slug);
create index if not exists tags_slug_idx on public.tags(slug);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create profile on new user
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at on profiles
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-update updated_at on posts
drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.handle_updated_at();

-- Auto-update updated_at on categories
drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at
  before update on public.categories
  for each row execute function public.handle_updated_at();

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.post_tags enable row level security;

-- POST URL RESERVATIONS AND PERMANENT REDIRECTS
-- A single unique namespace for current URLs and former published URLs. Keeping
-- the reservation in the post transaction prevents redirect/creation races.

create table if not exists public.post_slug_routes (
  slug text primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  was_published boolean not null default false
);
create index if not exists post_slug_routes_post_id_idx on public.post_slug_routes(post_id);
insert into public.post_slug_routes (slug, post_id, was_published)
select slug, id, status = 'published' or published_at is not null from public.posts
on conflict (slug) do nothing;

alter table public.post_slug_routes enable row level security;
revoke all on public.post_slug_routes from anon, authenticated;
grant select on public.post_slug_routes to anon, authenticated;
grant all on public.post_slug_routes to service_role;
drop policy if exists "Read routes for published posts" on public.post_slug_routes;
create policy "Read routes for published posts" on public.post_slug_routes
for select to anon, authenticated using (
  exists (select 1 from public.posts where id = post_id and status = 'published')
);

-- Privilege is limited to this trigger: API callers cannot edit reservations.
create or replace function public.reserve_post_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' or new.slug is distinct from old.slug then
    if length(new.slug) > 200 or new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise check_violation using message = 'Invalid post slug', constraint = 'posts_slug_format';
    end if;
  end if;

  insert into public.post_slug_routes as routes (slug, post_id, was_published)
  values (new.slug, new.id, new.status = 'published')
  on conflict (slug) do update
    set was_published = routes.was_published or excluded.was_published
    where routes.post_id = excluded.post_id;
  if not found then
    raise unique_violation using message = 'Post slug is already reserved', constraint = 'post_slug_routes_pkey';
  end if;

  if TG_OP = 'UPDATE' and old.slug is distinct from new.slug then
    -- Draft-only URLs may be released; anything that was public stays reserved,
    -- including through unpublish/republish and subsequent URL changes.
    delete from public.post_slug_routes
    where slug = old.slug and post_id = new.id and not was_published;
  end if;
  return new;
end;
$$;
revoke all on function public.reserve_post_slug() from public, anon, authenticated;
drop trigger if exists posts_reserve_slug on public.posts;
create trigger posts_reserve_slug after insert or update of slug, status on public.posts
for each row execute function public.reserve_post_slug();
