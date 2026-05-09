-- ============================================================
-- StudyRank — Initial Schema
-- Run this in Supabase SQL Editor or via supabase db push
-- ============================================================

-- Profiles table
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text unique,
  display_name   text,
  rank_tier      text check (rank_tier in ('bronze','silver','gold','platinum','diamond','master','grandmaster')),
  rank_division  int check (rank_division between 1 and 3),
  rank_points    int not null default 0,
  weekly_hours   numeric(6,2) not null default 0,
  streak_days    int not null default 0,
  created_at     timestamptz not null default now()
);

-- Sessions table
create table if not exists public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  duration_seconds    int,
  verified_seconds    int,
  distraction_count   int,
  rank_points_earned  int,
  subject             text
);

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    split_part(new.email, '@', 1)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

-- Profiles: users can only see and update their own row
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Sessions: users can only read/write their own sessions
create policy "sessions_select_own"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "sessions_insert_own"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "sessions_update_own"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_started_at_idx on public.sessions(started_at desc);
create index if not exists profiles_rank_tier_idx on public.profiles(rank_tier);
