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
-- After this base schema, execute
-- supabase/migrations/20261007055822_post_slug_routes.sql.
-- That migration is the single source for reservation tables, policies and
-- triggers, so manual setup and CLI migrations use identical definitions.
