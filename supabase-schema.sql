-- ============================================================
-- BULLDOG BRACKET — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- BRACKETS table
create table if not exists brackets (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  category text,
  contenders jsonb not null,
  bracket_data jsonb,
  vote_count integer default 0,
  created_at timestamptz default now()
);

-- VOTES table
create table if not exists votes (
  id uuid default gen_random_uuid() primary key,
  bracket_id uuid references brackets(id) on delete cascade,
  voter_name text not null,
  picks_data jsonb not null,
  champion text,
  created_at timestamptz default now()
);

-- Index for fast vote lookups
create index if not exists votes_bracket_id_idx on votes(bracket_id);

-- Function to increment vote count
create or replace function increment_vote_count(bracket_id uuid)
returns void as $$
  update brackets set vote_count = vote_count + 1 where id = bracket_id;
$$ language sql;

-- Enable Row Level Security (allow public reads, service key for writes)
alter table brackets enable row level security;
alter table votes enable row level security;

-- Public can read everything
create policy "Public read brackets" on brackets for select using (true);
create policy "Public read votes" on votes for select using (true);

-- Service key (used by API) can do everything
create policy "Service insert brackets" on brackets for insert with check (true);
create policy "Service insert votes" on votes for insert with check (true);
create policy "Service update brackets" on brackets for update using (true);
