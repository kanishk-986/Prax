-- Content Studio campaigns: campaigns and templates, target accounts, resource requests, and post fields
-- for campaigns, planning and approval. Run after 008. Re-runnable.

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  kind text not null default 'standard' check (kind in ('standard','fast','event')),
  brief jsonb not null default '{}',     -- objective, topic, keywords, segments, start, weeks, posts per week, mix, message, CTA, measure, minutes, resource, colleagues, event
  template boolean not null default false,
  status text not null default 'active' check (status in ('active','paused','done')),
  paused_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

alter table posts add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table posts add column if not exists pillar text not null default '';
alter table posts add column if not exists phase text not null default '';
alter table posts add column if not exists planned_time text not null default '';
alter table posts add column if not exists requested_by uuid;
alter table posts add column if not exists requested_at timestamptz;
alter table posts add column if not exists decided_by uuid;
alter table posts add column if not exists decided_at timestamptz;
alter table posts add column if not exists decision text not null default '';     -- 'approved' or 'changes'
alter table posts add column if not exists decision_note text not null default '';
alter table posts add column if not exists created_at timestamptz default now();
alter table posts add column if not exists hold_status text not null default '';   -- status before On hold, restored on Resume

-- Status words used by Content Studio: Idea, Drafting, In review, Ready, Posted, On hold.
update posts set status = case status when 'Approved' then 'Ready' when 'Scheduled' then 'Ready' when 'Published' then 'Posted' else status end
where status in ('Approved','Scheduled','Published');

-- People a campaign is aimed at: prospects from Pipeline or people from the Network export.
create table if not exists campaign_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  prospect_id uuid references prospects(id) on delete set null,
  person_key text default '',
  name text not null default '',
  company text default '',
  linkedin text default '',
  engaged_at timestamptz,
  engaged_reason text default '',
  created_at timestamptz default now()
);
create index if not exists campaign_targets_campaign on campaign_targets(campaign_id);

-- Someone asked for the campaign's resource.
create table if not exists resource_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  post_id uuid references posts(id) on delete set null,
  prospect_id uuid references prospects(id) on delete set null,
  name text not null default '',
  company text default '',
  linkedin text default '',
  sent boolean not null default false,
  created_at timestamptz default now()
);

do $$ declare t text; begin
  foreach t in array array['campaigns','campaign_targets','resource_requests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
  end loop;
end $$;
do $$ begin alter publication supabase_realtime add table campaigns; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table campaign_targets; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table resource_requests; exception when duplicate_object then null; end $$;

select 'ok' as status;
