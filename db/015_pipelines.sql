-- Pipelines: several per profile, each with its own stages; every lead sits in exactly one.
-- Adds lost reasons, an owner per lead, and a stage history (moves and Done, each with the next action),
-- then moves every existing prospect into a default "Outreach" pipeline with today's nine stages.
-- Nothing is deleted. Re-runnable (run after 014). src/lib/pipeline.ts holds the same templates and stage mapping.

create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  template text not null default 'blank',
  stages text[] not null,
  won_stage text not null default '',    -- the stage that means success; '' if none
  lost_stage text not null default '',   -- Parked, Passed or Declined; moving here asks for a lost reason
  sort int not null default 0,
  created_at timestamptz default now()
);
create index if not exists pipelines_ws on pipelines(workspace_id, sort);

create table if not exists lost_reasons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  label text not null,
  sort int not null default 0,
  created_at timestamptz default now(),
  unique (workspace_id, label)
);

-- One row per stage move (written by the prospect trigger) and per Done (written by the app).
create table if not exists stage_moves (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  prospect_id uuid references prospects(id) on delete cascade,
  pipeline_id uuid references pipelines(id) on delete set null,
  kind text not null default 'move' check (kind in ('move','done','backfill')),
  from_stage text not null default '',
  to_stage text not null,
  prev_action text not null default '',  -- the next action that was in place before
  next_action text not null default '',
  next_date date,
  reason text not null default '',
  actor uuid default auth.uid(),
  at timestamptz default now()
);
create index if not exists stage_moves_prospect on stage_moves(prospect_id, at);

alter table prospects add column if not exists pipeline_id uuid references pipelines(id) on delete set null;
alter table prospects add column if not exists lost_reason text not null default '';
alter table prospects add column if not exists owner uuid references auth.users(id) on delete set null;

do $$ declare t text; begin
  foreach t in array array['pipelines','lost_reasons','stage_moves'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
  end loop;
end $$;

-- The profile's first pipeline, created as Outreach when it has none.
create or replace function default_pipeline(ws uuid) returns uuid language plpgsql set search_path = public as $$
declare pid uuid;
begin
  select id into pid from pipelines where workspace_id = ws order by sort, created_at limit 1;
  if pid is null then
    insert into pipelines(workspace_id, name, template, stages, won_stage, lost_stage, sort)
    values (ws, 'Outreach', 'outreach', array['Target','Warming','Requested','Connected','In conversation','Resource sent','Call booked','Won','Parked'], 'Won', 'Parked', 0)
    returning id into pid;
  end if;
  return pid;
end $$;

-- An old stage name matched to the nine Outreach stages, ignoring case and spaces; anything else becomes Target.
create or replace function map_outreach_stage(s text) returns text language sql immutable as $$
  select coalesce((select x from unnest(array['Target','Warming','Requested','Connected','In conversation','Resource sent','Call booked','Won','Parked']) x
                   where lower(replace(x, ' ', '')) = lower(regexp_replace(coalesce(s, ''), '\s+', '', 'g')) limit 1), 'Target')
$$;

-- ---------- existing data ----------
do $$ declare w uuid; begin
  for w in select id from workspaces loop perform default_pipeline(w); end loop;
end $$;

-- Leads not in a pipeline yet go into their profile's Outreach pipeline. A stage outside the nine is kept in the
-- notes before it is mapped. Triggers are paused so days in stage and the activity feed stay as they were.
alter table prospects disable trigger prospect_stage;
update prospects set notes = trim(both from coalesce(notes, '') || E'\n\nStage before pipelines: ' || stage), stage = map_outreach_stage(stage)
where pipeline_id is null and stage is distinct from map_outreach_stage(stage);
update prospects set pipeline_id = default_pipeline(workspace_id) where pipeline_id is null;
alter table prospects enable trigger prospect_stage;

-- Stage history from the activity feed, for leads that have none yet.
insert into stage_moves(workspace_id, prospect_id, pipeline_id, kind, from_stage, to_stage, actor, at)
select workspace_id, ref_id, pipeline_id, 'backfill', coalesce(lag(to_stage) over (partition by ref_id order by at), ''), to_stage, actor, at
from (
  select a.workspace_id, a.ref_id, p.pipeline_id, regexp_replace(a.label, '^.* → ', '') as to_stage, a.actor, a.at
  from activity a join prospects p on p.id = a.ref_id
  where a.kind = 'stage' and not exists (select 1 from stage_moves m where m.prospect_id = a.ref_id)
) x;

-- Starting lost reasons for profiles that have none.
insert into lost_reasons(workspace_id, label, sort)
select w.id, r.label, r.n from workspaces w
cross join (values ('Timing: budget next year', 1), ('No need right now', 2), ('Chose another vendor', 3), ('No reply after three touches', 4), ('Not the decision maker', 5)) as r(label, n)
where not exists (select 1 from lost_reasons l where l.workspace_id = w.id)
on conflict do nothing;

-- ---------- from now on ----------
-- New leads without a pipeline (extension, Network, older screens) land in the profile's first pipeline.
create or replace function on_prospect_insert() returns trigger language plpgsql set search_path = public as $$
begin
  if new.pipeline_id is null then new.pipeline_id := default_pipeline(new.workspace_id); end if;
  return new;
end $$;
drop trigger if exists prospect_pipeline on prospects;
create trigger prospect_pipeline before insert on prospects for each row execute function on_prospect_insert();

-- Stage changes stamp the time, log activity (as before) and write the stage history with the next action.
-- A stage rename (rename_pipeline_stage below) is not a move, so it is skipped.
create or replace function on_prospect_stage() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage and coalesce(current_setting('prax.rename', true), '') <> 'on' then
    new.stage_changed_at := now();
    insert into activity(workspace_id, kind, label, ref_id) values (new.workspace_id, 'stage', new.name || ' → ' || new.stage, new.id);
    insert into stage_moves(workspace_id, prospect_id, pipeline_id, kind, from_stage, to_stage, prev_action, next_action, next_date, reason)
    values (new.workspace_id, new.id, new.pipeline_id, 'move', coalesce(old.stage, ''), new.stage, coalesce(old.next_action, ''), coalesce(new.next_action, ''), new.next_date,
            case when new.stage = (select lost_stage from pipelines where id = new.pipeline_id) then coalesce(new.lost_reason, '') else '' end);
  end if;
  return new;
end $$;
drop trigger if exists prospect_stage on prospects;
create trigger prospect_stage before update on prospects for each row execute function on_prospect_stage();

-- Rename one stage of a pipeline everywhere: the pipeline, its leads and their history. Runs with the caller's rights (RLS applies).
create or replace function rename_pipeline_stage(pid uuid, old_name text, new_name text) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if coalesce(trim(new_name), '') = '' or new_name = old_name then return 0; end if;
  if exists (select 1 from pipelines where id = pid and new_name = any(stages)) then raise exception 'A stage called % already exists', new_name; end if;
  perform set_config('prax.rename', 'on', true);
  update pipelines set stages = array_replace(stages, old_name, new_name),
    won_stage = case when won_stage = old_name then new_name else won_stage end,
    lost_stage = case when lost_stage = old_name then new_name else lost_stage end
  where id = pid;
  update prospects set stage = new_name where pipeline_id = pid and stage = old_name;
  get diagnostics n = row_count;
  update stage_moves set to_stage = new_name where pipeline_id = pid and to_stage = old_name;
  update stage_moves set from_stage = new_name where pipeline_id = pid and from_stage = old_name;
  perform set_config('prax.rename', '', true);
  return n;
end $$;
grant execute on function rename_pipeline_stage(uuid, text, text) to authenticated;

do $$ declare t text; begin
  foreach t in array array['pipelines','stage_moves','lost_reasons'] loop
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

select 'ok' as status;
