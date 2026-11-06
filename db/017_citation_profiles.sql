-- AI citations, tracked profiles (Q107): a workspace can track more than one person, each with their company and
-- LinkedIn profile, and switch, archive, restore or delete them. Every citation row belongs to one profile.
-- Existing rows all move into one default profile per workspace, named after the person and company it tracks;
-- nothing is deleted. Each user keeps their own current choice. Run after 015 (and 016 when it exists). Re-runnable.

create table if not exists citation_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  archived_at timestamptz,                 -- archived profiles keep every row and are hidden from Switch
  sort int not null default 0,
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);
create index if not exists citation_profiles_ws on citation_profiles(workspace_id, sort);

-- Which profile each person is looking at. Per user, so one person switching never moves a colleague's view.
create table if not exists citation_profile_picks (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  profile_id uuid not null references citation_profiles(id) on delete cascade,
  updated_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

alter table citation_profiles enable row level security;
drop policy if exists r on citation_profiles; drop policy if exists i on citation_profiles;
drop policy if exists u on citation_profiles; drop policy if exists d on citation_profiles;
create policy r on citation_profiles for select using (has_role(workspace_id, 'viewer'));
create policy i on citation_profiles for insert with check (has_role(workspace_id, 'editor'));
create policy u on citation_profiles for update using (has_role(workspace_id, 'editor')) with check (has_role(workspace_id, 'editor'));
create policy d on citation_profiles for delete using (has_role(workspace_id, 'owner'));

alter table citation_profile_picks enable row level security;
drop policy if exists w on citation_profile_picks;
create policy w on citation_profile_picks for all using (user_id = auth.uid() and has_role(workspace_id, 'viewer'))
  with check (user_id = auth.uid() and has_role(workspace_id, 'viewer'));

-- The name of a default profile: "Person, Company" from its self entities, else the workspace name
-- (same rule as profileName in src/lib/citations.ts).
create or replace function citation_profile_name(ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(concat_ws(', ',
      (select nullif(trim(name), '') from citation_entities where workspace_id = ws and kind = 'self' and subject = 'person' order by sort limit 1),
      (select nullif(trim(name), '') from citation_entities where workspace_id = ws and kind = 'self' and subject <> 'person' order by sort limit 1)), ''),
    nullif(trim((select name from workspaces where id = ws)), ''), 'Tracked profile')
$$;

-- The workspace's default profile: the first live one, else the first archived one, else a new one.
create or replace function citation_default_profile(ws uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from citation_profiles where workspace_id = ws order by (archived_at is not null), sort, created_at limit 1;
  if pid is null then
    insert into citation_profiles(workspace_id, name, sort) values (ws, citation_profile_name(ws), 0) returning id into pid;
  end if;
  return pid;
end $$;
revoke execute on function citation_default_profile(uuid) from public, anon;
revoke execute on function citation_profile_name(uuid) from public, anon;

-- Scope every citation table to a profile. Deleting a profile removes its rows (sources go with their runs).
do $$ declare t text; begin
  foreach t in array array['citation_entities','citation_questions','citation_runs','citation_facts','citation_recs','citation_sets','citation_shares'] loop
    execute format('alter table %I add column if not exists profile_id uuid references citation_profiles(id) on delete cascade', t);
    execute format('create index if not exists %I on %I(profile_id)', t || '_profile', t);
  end loop;
end $$;

-- Existing rows: prompts and the rest go to the default profile, a run follows its prompt.
update citation_entities set profile_id = citation_default_profile(workspace_id) where profile_id is null and workspace_id is not null;
update citation_questions set profile_id = citation_default_profile(workspace_id) where profile_id is null and workspace_id is not null;
update citation_runs r set profile_id = q.profile_id from citation_questions q where r.question_id = q.id and r.profile_id is null;
update citation_runs set profile_id = citation_default_profile(workspace_id) where profile_id is null and workspace_id is not null;
update citation_facts set profile_id = citation_default_profile(workspace_id) where profile_id is null and workspace_id is not null;
update citation_recs set profile_id = citation_default_profile(workspace_id) where profile_id is null and workspace_id is not null;
update citation_sets set profile_id = citation_default_profile(workspace_id) where profile_id is null and workspace_id is not null;
update citation_shares set profile_id = citation_default_profile(workspace_id) where profile_id is null and workspace_id is not null;

-- The facts sheet was one row per workspace; it becomes one row per profile.
do $$ begin
  if exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
             where c.conrelid = 'citation_facts'::regclass and c.contype = 'p' and a.attname = 'workspace_id') then
    alter table citation_facts drop constraint citation_facts_pkey;
    alter table citation_facts add constraint citation_facts_pkey primary key (profile_id);
  end if;
end $$;

-- A row written without a profile (an older page, the extension) goes to the default one, a run to its prompt's.
-- A profile from another workspace is refused, since the row policies only check the workspace.
create or replace function citation_fill_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is null and new.workspace_id is not null then
    if tg_table_name = 'citation_runs' then
      if new.question_id is not null then select q.profile_id into new.profile_id from citation_questions q where q.id = new.question_id; end if;
    end if;
    if new.profile_id is null then new.profile_id := citation_default_profile(new.workspace_id); end if;
  end if;
  if new.profile_id is not null and not exists (select 1 from citation_profiles p where p.id = new.profile_id and p.workspace_id = new.workspace_id) then
    raise exception 'That tracked profile belongs to another workspace';
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['citation_entities','citation_questions','citation_runs','citation_facts','citation_recs','citation_sets','citation_shares'] loop
    execute format('drop trigger if exists citation_profile_fill on %I', t);
    execute format('create trigger citation_profile_fill before insert or update of profile_id on %I for each row execute function citation_fill_profile()', t);
  end loop;
end $$;

-- Content Studio ideas made from a gap remember their profile, so gap topics show for the profile in view.
-- The idea itself is kept when its profile is deleted.
alter table posts add column if not exists citation_profile_id uuid references citation_profiles(id) on delete set null;
update posts p set citation_profile_id = q.profile_id from citation_questions q where p.citation_question_id = q.id and p.citation_profile_id is null;
update posts set citation_profile_id = citation_default_profile(workspace_id)
where citation_profile_id is null and topic = 'AI citations' and workspace_id is not null
  and exists (select 1 from citation_profiles c where c.workspace_id = posts.workspace_id);

-- Delete is permanent and owner-only, and needs the profile's name typed out (letter case and end spaces ignored).
-- It removes that profile's people and companies, prompts, runs, sources, facts, recommendations, prompt groups
-- and share links, and nothing else.
create or replace function citation_profile_delete(pid uuid, confirm_name text) returns void
language plpgsql security definer set search_path = public as $$
declare p citation_profiles;
begin
  select * into p from citation_profiles where id = pid;
  if p.id is null then raise exception 'That tracked profile no longer exists'; end if;
  if not has_role(p.workspace_id, 'owner') then raise exception 'Only an owner can delete a tracked profile'; end if;
  if lower(trim(coalesce(confirm_name, ''))) <> lower(trim(p.name)) then raise exception 'The name typed does not match'; end if;
  delete from citation_profiles where id = pid;
end $$;
revoke execute on function citation_profile_delete(uuid, text) from public, anon;
grant execute on function citation_profile_delete(uuid, text) to authenticated;

do $$ begin alter publication supabase_realtime add table citation_profiles; exception when duplicate_object then null; end $$;

select 'ok' as status, (select count(*) from citation_profiles) as profiles,
  (select count(*) from citation_questions where profile_id is null) as unscoped_prompts;
