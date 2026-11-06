-- Step 4: the Inbox (X7), the weekly report (D10) and the multi-profile overview (D11).
-- Re-runnable; run after 025. Nothing is deleted or rewritten.
--
-- 1. inbox_messages: LinkedIn messages the user records by hand ("Add message") or sends from the extension
--    on a click (POST /api/ext/inbox). Prax never reads LinkedIn messages on its own.
-- 2. inbox_state: Done and Snooze for every Inbox item, whatever its source, keyed by the item key
--    (src/lib/inbox.ts itemKey: "lead:<prospect id>:<due date>", "reply:<comment_log id>", "dm:<message id>").
-- 3. comment_log.replied_at: when a reply to a logged comment was first seen, so the Inbox can say how long
--    the person has waited and the weekly report can count replies in the week they came in.
-- 4. ext_inbox_add: the extension's door for a captured message (token checked like every ext_* function).
-- The weekly report and the profiles overview read existing tables only; they need nothing else here.

-- ---------- 1. captured messages ----------
create table if not exists inbox_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  person text not null,
  company text not null default '',
  linkedin text not null default '',     -- their profile URL, used to match a lead
  thread_url text not null default '',   -- the LinkedIn conversation, opened by the user
  body text not null default '',         -- the last message they sent, as the user pasted or captured it
  received_at timestamptz not null default now(),
  prospect_id uuid references prospects(id) on delete set null,
  source text not null default 'manual',
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
do $$ begin
  alter table inbox_messages add constraint inbox_messages_source check (source in ('manual','extension'));
exception when duplicate_object then null; end $$;
create index if not exists inbox_messages_ws on inbox_messages(workspace_id, received_at desc);

-- ---------- 2. done and snooze ----------
create table if not exists inbox_state (
  workspace_id uuid references workspaces(id) on delete cascade,
  key text not null,
  done_at timestamptz,
  snoozed_until date,
  updated_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  primary key (workspace_id, key)
);

do $$ declare t text; begin
  foreach t in array array['inbox_messages','inbox_state'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

-- A message typed in Prax is always recorded as the signed-in user.
create or replace function inbox_message_author() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists inbox_message_author on inbox_messages;
create trigger inbox_message_author before insert on inbox_messages for each row execute function inbox_message_author();

-- ---------- 3. when a reply came in ----------
alter table comment_log add column if not exists replied_at timestamptz;
create or replace function comment_replied_at() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.reply and new.replied_at is null and (tg_op = 'INSERT' or not coalesce(old.reply, false)) then new.replied_at := now(); end if;
  return new;
end $$;
drop trigger if exists comment_replied_at on comment_log;
create trigger comment_replied_at before insert or update of reply on comment_log for each row execute function comment_replied_at();

-- ---------- 4. the extension's door ----------
-- p: { name, company, url (their profile), thread_url, text (their last message), received_at (ISO, optional) }.
-- Called only when the user presses the extension's own "Send to Prax Inbox" on a conversation they have open.
create or replace function ext_inbox_add(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare a record; pid uuid; mid uuid; nm text := left(trim(coalesce(p->>'name','')), 200); at timestamptz;
begin
  select * into a from ext_auth(tok);
  if nm = '' then raise exception 'A name is needed'; end if;
  begin at := coalesce(nullif(p->>'received_at','')::timestamptz, now()); exception when others then at := now(); end;
  if at > now() then at := now(); end if;
  pid := match_prospect(a.ws, p->>'url', nm);
  insert into inbox_messages(workspace_id, person, company, linkedin, thread_url, body, received_at, prospect_id, source, created_by)
  values (a.ws, nm, left(coalesce(p->>'company', (select company from prospects where id = pid), ''), 200), left(coalesce(p->>'url',''), 500),
          left(coalesce(p->>'thread_url',''), 500), left(coalesce(p->>'text',''), 4000), at, pid, 'extension', a.uid)
  returning id into mid;
  return jsonb_build_object('id', mid, 'prospect', (select name from prospects where id = pid));
end $$;
grant execute on function ext_inbox_add(text, jsonb) to anon, authenticated;

select 'ok' as status, (select count(*) from inbox_messages) as messages, (select count(*) from inbox_state) as states;
