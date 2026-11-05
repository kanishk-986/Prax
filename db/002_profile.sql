-- Profile Studio: uploaded or pasted LinkedIn profiles, and the profile's target topics.
alter table workspaces add column if not exists topics text[] not null default '{}';

create table if not exists profile_docs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  subject text not null default 'self' check (subject in ('self','prospect')),
  prospect_id uuid references prospects(id) on delete set null,
  source text not null default 'pdf' check (source in ('pdf','paste','capture','export')),
  file_name text default '',
  raw_text text not null default '',
  parsed jsonb not null default '{}',
  audit jsonb not null default '{}',
  score int,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
alter table profile_docs enable row level security;
drop policy if exists r on profile_docs; drop policy if exists w on profile_docs;
create policy r on profile_docs for select using (has_role(workspace_id,'viewer'));
create policy w on profile_docs for all using (has_role(workspace_id,'editor')) with check (has_role(workspace_id,'editor'));
do $$ begin alter publication supabase_realtime add table profile_docs; exception when duplicate_object then null; end $$;

update workspaces set topics = array['stablecoins','payment rails','cross-border payments','tokenisation','RWA','settlement','compliance','digital assets','agentic payments','banks']
where name ilike 'shashi%' and topics = '{}';

select 'ok' as status, (select count(*) from profile_docs) as docs;
