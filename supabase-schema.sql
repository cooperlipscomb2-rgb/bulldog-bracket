-- ============================================================
-- BULLDOG BRACKET — Full Schema (run in Supabase SQL Editor)
-- ============================================================

-- USER PROFILES
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- BRACKETS
create table if not exists brackets (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text,
  contenders jsonb not null,
  bracket_data jsonb,
  vote_count integer default 0,
  recent_vote_count integer default 0,
  published boolean default false,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- VOTES
create table if not exists votes (
  id uuid default gen_random_uuid() primary key,
  bracket_id uuid references brackets(id) on delete cascade,
  user_id uuid references auth.users(id),
  voter_name text not null,
  picks_data jsonb not null,
  champion text,
  created_at timestamptz default now()
);

create index if not exists votes_bracket_id_idx on votes(bracket_id);
create index if not exists votes_created_at_idx on votes(created_at);
create index if not exists brackets_published_idx on brackets(published);

-- Increment vote count + recent vote count
create or replace function increment_vote_count(bracket_id uuid)
returns void as $$
  update brackets
  set
    vote_count = vote_count + 1,
    recent_vote_count = recent_vote_count + 1
  where id = bracket_id;
$$ language sql;

-- Scheduled function to reset recent_vote_count daily (call via cron or pg_cron)
-- If you have pg_cron enabled:
-- select cron.schedule('reset-recent-votes', '0 0 * * *', 'update brackets set recent_vote_count = 0');

-- RLS
alter table user_profiles enable row level security;
alter table brackets enable row level security;
alter table votes enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Public read brackets" on brackets;
drop policy if exists "Public read votes" on votes;
drop policy if exists "Public read profiles" on user_profiles;
drop policy if exists "Service insert brackets" on brackets;
drop policy if exists "Service insert votes" on votes;
drop policy if exists "Service update brackets" on brackets;
drop policy if exists "Service upsert profiles" on user_profiles;

-- Public reads
create policy "Public read brackets" on brackets for select using (true);
create policy "Public read votes" on votes for select using (true);
create policy "Public read profiles" on user_profiles for select using (true);

-- Service role writes
create policy "Service insert brackets" on brackets for insert with check (true);
create policy "Service insert votes" on votes for insert with check (true);
create policy "Service update brackets" on brackets for update using (true);
create policy "Service upsert profiles" on user_profiles for all using (true);

-- ── MAKE YOURSELF ADMIN ──
-- After signing up, run this with your email:
-- update user_profiles set is_admin = true where email = 'youremail@msstate.edu';
