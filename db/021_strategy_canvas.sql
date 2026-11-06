-- Strategy canvas (Q108, Q109). Run after 020. Re-runnable, deletes nothing.
-- 1. strategies: several per profile, exactly one active (a partial unique index). strategy_activate() swaps it.
-- 2. strategy_nodes: one row per node on the canvas: type, name, parent and branch (a condition's 'yes' or 'no' lane;
--    parent null is the main flow), sort (order in its lane), config (jsonb, typed per node in src/lib/strategy.ts),
--    editor_only (hidden from viewers and commenters, like the "Who does what" notes).
-- 3. Two settings the canvas writes through to, read by the app: workspaces.segment_weights (Audience weights:
--    Today's order and Discovery's buyer fit) and content_settings.plan (Content system: posts a week, days, formats).
-- 4. Each profile's existing Strategy notes (notes.kind = 'strategy') become Note nodes in a first strategy,
--    "Current plan", set active, with the text kept. The notes themselves stay as they are.

-- ---------- 1. strategies ----------
create table if not exists strategies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  template text not null default 'blank',
  status text not null default 'draft' check (status in ('active', 'draft', 'archived')),
  sort int not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists strategies_ws on strategies(workspace_id, sort);
create unique index if not exists strategies_one_active on strategies(workspace_id) where status = 'active';

-- ---------- 2. nodes ----------
create table if not exists strategy_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  strategy_id uuid not null references strategies(id) on delete cascade,
  type text not null check (type in ('goal', 'audience', 'pillars', 'regions', 'quota', 'content', 'comments', 'condition', 'action', 'note')),
  title text not null default '',
  parent_id uuid references strategy_nodes(id) on delete cascade,
  branch text not null default '' check (branch in ('', 'yes', 'no')),
  sort int not null default 0,
  config jsonb not null default '{}',
  editor_only boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists strategy_nodes_strategy on strategy_nodes(strategy_id, parent_id, sort);

do $$ declare t text; begin
  foreach t in array array['strategies', 'strategy_nodes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
  end loop;
end $$;

-- Realtime, so every open canvas follows edits (skipped when already added).
do $$ declare t text; begin
  foreach t in array array['strategies', 'strategy_nodes'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Set one strategy active and the profile's other active one back to draft, in one step.
-- Invoker rights: RLS applies, so only editors and owners of that profile can do it.
create or replace function strategy_activate(p_id uuid) returns void
language plpgsql set search_path = public, pg_catalog as $$
declare ws uuid;
begin
  select workspace_id into ws from strategies where id = p_id;
  if ws is null then raise exception 'Strategy not found'; end if;
  if not has_role(ws, 'editor') then raise exception 'Only editors and owners can change the active strategy'; end if;
  update strategies set status = 'draft', updated_at = now() where workspace_id = ws and status = 'active' and id <> p_id;
  update strategies set status = 'active', updated_at = now() where id = p_id;
end $$;
revoke all on function strategy_activate(uuid) from public, anon;
grant execute on function strategy_activate(uuid) to authenticated;

-- ---------- 3. settings the canvas writes through to ----------
alter table workspaces add column if not exists segment_weights jsonb not null default '{}';
alter table content_settings add column if not exists plan jsonb not null default '{}';

-- ---------- 4. the existing Strategy notes become a first strategy ----------
-- Only for profiles that have strategy notes and no strategy yet, so a second run adds nothing.
do $$ declare w record; sid uuid; begin
  for w in select distinct n.workspace_id from notes n
           where n.kind = 'strategy' and n.workspace_id is not null
             and not exists (select 1 from strategies s where s.workspace_id = n.workspace_id) loop
    insert into strategies (workspace_id, name, template, status, created_by)
      values (w.workspace_id, 'Current plan', 'migrated', 'active', null) returning id into sid;
    insert into strategy_nodes (workspace_id, strategy_id, type, title, sort, config, editor_only, created_by, created_at)
      select n.workspace_id, sid, 'note', coalesce(nullif(trim(n.title), ''), 'Note'),
             (row_number() over (order by n.sort, n.created_at))::int * 1024,
             jsonb_build_object('text', coalesce(n.body, ''), 'note_id', n.id),
             trim(coalesce(n.title, '')) ~* '^who does what',
             n.created_by, coalesce(n.created_at, now())
        from notes n where n.workspace_id = w.workspace_id and n.kind = 'strategy';
  end loop;
end $$;

select 'ok' as status;
