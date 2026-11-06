-- Security review fixes (P2-a, P2-b). Run after 019. Re-runnable.
-- 1. The citation profile helpers from 017 are internal: only their security definer callers (the 017 trigger,
--    the 017 backfill) use them, so no API role may call them directly.
-- 2. The 017 profile trigger also fires when a row's workspace_id changes, so a row cannot be moved to another
--    workspace while keeping a profile from the old one.
-- 3. notes.created_by is always the signed-in author on insert (a client cannot claim someone else wrote it).
--    Inserts with no auth.uid() (SQL editor, seeds such as 019) keep the value they give.
-- 4. The 018 text repair functions get a fixed search_path; prax_mojibake_columns is not callable by anon.
-- 5. invite_log: one row per invite sent, for the per-user limit in /api/invite (20 an hour).

-- 1. Internal helpers.
revoke execute on function citation_default_profile(uuid), citation_profile_name(uuid) from public, anon, authenticated;

-- 2. The profile trigger from 017, now also on workspace_id.
do $$ declare t text; begin
  foreach t in array array['citation_entities','citation_questions','citation_runs','citation_facts','citation_recs','citation_sets','citation_shares'] loop
    execute format('drop trigger if exists citation_profile_fill on %I', t);
    execute format('create trigger citation_profile_fill before insert or update of profile_id, workspace_id on %I for each row execute function citation_fill_profile()', t);
  end loop;
end $$;

-- 3. Notes author.
create or replace function notes_set_author() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists notes_set_author on notes;
create trigger notes_set_author before insert on notes for each row execute function notes_set_author();

-- 4. Text repair functions (signatures as defined in 018).
alter function public.prax_mac_roman_high() set search_path = public, pg_catalog;
alter function public.prax_mac_roman_byte(text) set search_path = public, pg_catalog;
alter function public.prax_mojibake_pattern() set search_path = public, pg_catalog;
alter function public.prax_repair_mojibake(text) set search_path = public, pg_catalog;
alter function public.prax_mojibake_columns() set search_path = public, pg_catalog;
revoke execute on function public.prax_mojibake_columns() from public, anon;

-- 5. Invite log for the rate limit. Each person reads and adds only their own rows; nobody updates or deletes.
create table if not exists invite_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists invite_log_user_time on invite_log(user_id, created_at);
alter table invite_log enable row level security;
drop policy if exists r on invite_log; drop policy if exists i on invite_log;
create policy r on invite_log for select using (user_id = auth.uid());
create policy i on invite_log for insert with check (user_id = auth.uid());

select 'ok' as status,
  (select count(*) from pg_trigger where tgname = 'citation_profile_fill') as profile_triggers,
  (select count(*) from pg_trigger where tgname = 'notes_set_author') as notes_triggers,
  (select count(*) from invite_log) as invites_logged;
