-- Prax schema v1. Every table is scoped to a workspace (one LinkedIn profile).
-- Roles: owner > editor > commenter > viewer.

create extension if not exists pgcrypto;

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  headline text default '',
  linkedin_url text default '',
  start_date date not null default current_date,
  quotas jsonb not null default '{"comment":8,"request":15,"dm":5,"inmail":1,"reply":1}',
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('owner','editor','commenter','viewer')),
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- Invitations by email, claimed on first sign-in.
create table if not exists invites (
  workspace_id uuid references workspaces(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','editor','commenter','viewer')),
  created_at timestamptz default now(),
  primary key (workspace_id, email)
);

create or replace function role_rank(r text) returns int language sql immutable as $$
  select case r when 'owner' then 4 when 'editor' then 3 when 'commenter' then 2 when 'viewer' then 1 else 0 end
$$;

create or replace function has_role(ws uuid, min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.workspace_id = ws and m.user_id = auth.uid()
                 and role_rank(m.role) >= role_rank(min_role))
$$;

-- Daily checklist items, generated from quotas per day.
create table if not exists daily_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('comment','request','dm','inmail','reply','post','custom')),
  idx int not null default 1,
  title text not null default '',
  done boolean not null default false,
  link text default '',
  note text default '',
  prospect_id uuid,
  done_by uuid,
  done_at timestamptz,
  created_at timestamptz default now(),
  unique (workspace_id, day, kind, idx)
);

create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  role text default '', company text default '',
  segment text default '', region text default '',
  stage text not null default 'Target',
  warmth text default 'cold',
  value int default 0,
  next_action text default '', next_date date,
  linkedin text default '', why text default '', notes text default '',
  stage_changed_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  title text not null, format text default 'Article', publish_date date,
  status text default 'Idea', topic text default '', resource text default '',
  draft text default '', url text default '', impressions int, reactions int, comments int,
  created_at timestamptz default now()
);

create table if not exists comment_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  day date not null default current_date,
  author text default '', segment text default '', url text default '',
  mode text default '', text text default '', reply boolean default false,
  source text default 'manual',
  created_at timestamptz default now()
);

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null, kind text default 'note', body text default '', sort int default 0
);

create table if not exists citation_questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  question text not null, topic text default '', region text default '', sort int default 0
);

create table if not exists citation_results (
  workspace_id uuid references workspaces(id) on delete cascade,
  question_id uuid references citation_questions(id) on delete cascade,
  week_start date not null, tool text not null, cited boolean default false,
  primary key (question_id, week_start, tool)
);

-- Analytics captured from LinkedIn pages the user opens (extension Capture), or typed in.
create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  captured_at timestamptz default now(),
  metric text not null, value numeric not null, period text default '', source text default 'manual'
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  kind text default 'note', title text default '', body text default '', sort int default 0,
  created_at timestamptz default now()
);

-- Discussion threads on any record (for commenters).
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  ref_table text not null, ref_id uuid not null,
  author uuid default auth.uid(), author_email text default '', body text not null,
  created_at timestamptz default now()
);

-- Activity feed for the dashboard.
create table if not exists activity (
  id bigserial primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  at timestamptz default now(), actor uuid default auth.uid(),
  kind text not null, label text default '', ref_id uuid
);

-- RLS
do $$ declare t text; begin
  foreach t in array array['daily_items','prospects','posts','comment_log','templates','citation_questions','citation_results','snapshots','notes','activity'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
  end loop;
end $$;

alter table threads enable row level security;
drop policy if exists r on threads; drop policy if exists w on threads; drop policy if exists d on threads;
create policy r on threads for select using (has_role(workspace_id,'viewer'));
create policy w on threads for insert with check (has_role(workspace_id,'commenter'));
create policy d on threads for delete using (author = auth.uid() or has_role(workspace_id,'owner'));

alter table workspaces enable row level security;
drop policy if exists r on workspaces; drop policy if exists u on workspaces; drop policy if exists i on workspaces;
create policy r on workspaces for select using (has_role(id,'viewer') or created_by = auth.uid());
create policy u on workspaces for update using (has_role(id,'owner'));
create policy i on workspaces for insert with check (created_by = auth.uid());

alter table members enable row level security;
drop policy if exists r on members; drop policy if exists w on members;
create policy r on members for select using (has_role(workspace_id,'viewer'));
create policy w on members for all using (has_role(workspace_id,'owner')) with check (has_role(workspace_id,'owner'));

alter table invites enable row level security;
drop policy if exists r on invites; drop policy if exists w on invites;
create policy r on invites for select using (has_role(workspace_id,'owner'));
create policy w on invites for all using (has_role(workspace_id,'owner')) with check (has_role(workspace_id,'owner'));

-- Creating a workspace makes the creator its owner.
create or replace function on_workspace_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into members(workspace_id, user_id, email, role)
  values (new.id, new.created_by, (select email from auth.users where id = new.created_by), 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists ws_owner on workspaces;
create trigger ws_owner after insert on workspaces for each row execute function on_workspace_created();

-- Claim pending invites when a user signs in.
create or replace function claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into members(workspace_id, user_id, email, role)
  select i.workspace_id, auth.uid(), i.email, i.role from invites i
  where lower(i.email) = lower((select email from auth.users where id = auth.uid()))
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  get diagnostics n = row_count;
  delete from invites where lower(email) = lower((select email from auth.users where id = auth.uid()));
  return n;
end $$;

-- Prospect stage changes stamp the time and log activity.
create or replace function on_prospect_stage() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    insert into activity(workspace_id, kind, label, ref_id) values (new.workspace_id, 'stage', new.name || ' → ' || new.stage, new.id);
  end if;
  return new;
end $$;
drop trigger if exists prospect_stage on prospects;
create trigger prospect_stage before update on prospects for each row execute function on_prospect_stage();

create or replace function on_item_done() returns trigger language plpgsql as $$
begin
  if new.done and not coalesce(old.done,false) then
    new.done_at := now(); new.done_by := auth.uid();
    insert into activity(workspace_id, kind, label, ref_id) values (new.workspace_id, new.kind, coalesce(nullif(new.title,''), new.kind), new.id);
  elsif not new.done then
    new.done_at := null;
  end if;
  return new;
end $$;
drop trigger if exists item_done on daily_items;
create trigger item_done before update on daily_items for each row execute function on_item_done();

-- Realtime
do $$ declare t text; begin
  foreach t in array array['daily_items','prospects','posts','comment_log','activity','snapshots','threads'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;
