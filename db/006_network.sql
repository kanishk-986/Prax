-- Network intelligence from the LinkedIn data export (zip, parsed in the browser).
-- Stores connections and message metadata (counts and dates, never message text), the profile's own posts
-- and comments for topics, and one row per upload. Re-runnable.

-- Company names compared loosely: lower case, brackets dropped, letters and digits only, one legal suffix dropped.
-- src/lib/network.ts has the same function (normCompany); keep them identical.
create or replace function net_norm(c text) returns text language sql immutable as $$
  select regexp_replace(
    regexp_replace(regexp_replace(lower(coalesce(c,'')), '\([^)]*\)', ' ', 'g'), '[^a-z0-9 ]', ' ', 'g'),
    '\s+(inc|llc|ltd|limited|plc|pjsc|psc|corp|corporation|co|gmbh|ag|sa|bv|pte|pvt|private|group|holdings)\s*$', '')
$$;

create table if not exists network_people (
  workspace_id uuid references workspaces(id) on delete cascade,
  key text not null,                     -- profile URL without query or trailing slash, or 'name:' + name
  url text default '',
  name text not null default '',
  company text default '',
  position text default '',
  company_norm text generated always as (replace(net_norm(company), ' ', '')) stored,
  is_connection boolean not null default false,
  connected_on date,
  msg_count int not null default 0,
  msg_last date,
  msg_last_from text default '',         -- 'them' or 'us'
  invite text default '',                -- 'sent' or 'received' (pending invitations in the export)
  invite_at date,
  segment_manual text default '',        -- set by hand; otherwise the segment comes from the rules
  prospect_id uuid references prospects(id) on delete set null,
  not_prospects uuid[] not null default '{}',  -- suggested matches the user said are someone else
  first_export date,
  last_export date,
  primary key (workspace_id, key)
);
create index if not exists network_people_company on network_people(workspace_id, company_norm);
create index if not exists network_people_prospect on network_people(prospect_id);

create table if not exists network_posts (
  workspace_id uuid references workspaces(id) on delete cascade,
  kind text not null check (kind in ('post','comment')),
  key text not null,                     -- link, or date + start of text when there is no link
  day date,
  url text default '',
  text text default '',
  primary key (workspace_id, kind, key)
);

create table if not exists network_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  file_name text default '',
  export_date date,
  counts jsonb not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

-- Segment and topic rules per profile. Empty means the defaults in src/lib/network.ts.
create table if not exists network_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  segments jsonb not null default '[]',
  topics jsonb not null default '[]',
  updated_at timestamptz default now()
);

do $$ declare t text; begin
  foreach t in array array['network_people','network_posts','network_imports','network_settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
  end loop;
end $$;

-- Merge one batch of people from an export. Keeps hand-set segments, prospect links and first_export.
-- Returns how many keys were new.
drop function if exists network_merge(uuid, jsonb, date);
create or replace function network_merge(ws uuid, batch jsonb, export_day date) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not has_role(ws, 'editor') then raise exception 'Editors only'; end if;
  with src as (
    select * from jsonb_to_recordset(batch) as x(key text, url text, name text, company text, position text, is_connection boolean,
      connected_on date, msg_count int, msg_last date, msg_last_from text, invite text, invite_at date)
  ), up as (
    insert into network_people as p (workspace_id, key, url, name, company, position, is_connection, connected_on,
      msg_count, msg_last, msg_last_from, invite, invite_at, first_export, last_export)
    select ws, key, coalesce(url,''), coalesce(name,''), coalesce(company,''), coalesce(position,''), coalesce(is_connection,false), connected_on,
      coalesce(msg_count,0), msg_last, coalesce(msg_last_from,''), coalesce(invite,''), invite_at, export_day, export_day from src
    on conflict (workspace_id, key) do update set
      url = coalesce(nullif(excluded.url,''), p.url),
      name = coalesce(nullif(excluded.name,''), p.name),
      company = case when excluded.is_connection then excluded.company else p.company end,
      position = case when excluded.is_connection then excluded.position else p.position end,
      is_connection = p.is_connection or excluded.is_connection,
      connected_on = coalesce(excluded.connected_on, p.connected_on),
      msg_count = greatest(p.msg_count, excluded.msg_count),
      msg_last = greatest(p.msg_last, excluded.msg_last),
      msg_last_from = case when excluded.msg_last >= coalesce(p.msg_last, excluded.msg_last) then excluded.msg_last_from else p.msg_last_from end,
      invite = excluded.invite,
      invite_at = excluded.invite_at,
      last_export = greatest(p.last_export, excluded.last_export)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into n from up;
  return n;
end $$;

-- Owners can wipe everything imported for a profile. Prospects are not touched.
create or replace function network_wipe(ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role(ws, 'owner') then raise exception 'Owners only'; end if;
  delete from network_people where workspace_id = ws;
  delete from network_posts where workspace_id = ws;
  delete from network_imports where workspace_id = ws;
end $$;

-- Dashboard count: open prospects with a linked connection, a message history, or a connection at their company.
create or replace function network_warm_count(ws uuid) returns int
language sql stable security invoker set search_path = public as $$
  select count(*)::int from prospects pr
  where pr.workspace_id = ws and pr.stage not in ('Won','Parked')
    and exists (
      select 1 from network_people np where np.workspace_id = ws and (
        np.prospect_id = pr.id
        or (np.is_connection and np.company_norm <> '' and np.company_norm = replace(net_norm(pr.company), ' ', ''))
      )
    )
$$;

select 'ok' as status, (select count(*) from network_people) as people;
