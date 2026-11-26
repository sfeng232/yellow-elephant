-- White Elephant — Supabase schema.
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to re-run.

create table if not exists public.games (
  id              uuid primary key,
  code            text not null unique,
  host_token_hash text not null,
  settings        jsonb not null,
  status          text not null default 'lobby' check (status in ('lobby', 'live', 'ended')),
  state           jsonb,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);

create table if not exists public.players (
  id            uuid primary key,
  game_id       uuid not null references public.games (id) on delete cascade,
  name          text not null,
  token_hash    text not null,
  challenge     jsonb not null,
  rerolls_left  integer not null default 1,
  is_host       boolean not null default false,
  joined_at     timestamptz not null default now()
);

create unique index if not exists players_unique_name on public.players (game_id, lower(name));
create index if not exists players_game_id on public.players (game_id);
create index if not exists games_expires_at on public.games (expires_at);

-- Lock both tables. With RLS on and no policies, the public (anon/publishable) key can't
-- read or write anything. Only the Next.js server, using the service-role key, can.
-- That's what keeps everyone's challenge secret.
alter table public.games enable row level security;
alter table public.players enable row level security;

-- Bumps a game's version so phones know to refresh (used when the player list changes).
create or replace function public.touch_game(game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.games set version = version + 1 where id = game_id;
$$;
revoke all on function public.touch_game(uuid) from public, anon, authenticated;

-- Delete games 48h after creation (players cascade). Needs the pg_cron extension:
-- Dashboard → Database → Extensions → enable "pg_cron", then run the block below.
-- If you skip this, expired games are still hidden by the app; they just aren't deleted.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'elephant-expire-games';
    perform cron.schedule('elephant-expire-games', '17 * * * *',
      $cron$ delete from public.games where expires_at < now() $cron$);
  end if;
end $$;
