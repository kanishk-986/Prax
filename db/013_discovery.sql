-- Discovery Studio: what Shashi should post about, comment on or watch this week, and why.
-- AI search runs in the browser with the user's own keys (they never reach the server); Crawl reads the
-- uploaded link lists on the server, by hand or every Monday from the Vercel cron. LinkedIn items only arrive
-- when the user presses Send to Discovery on the Prax bar. Run after 012. Re-runnable.

-- Criteria: article weights, bands, topic priority weights, penalties, geography order, exclusions, cadence.
-- Empty means the defaults in src/lib/discovery.ts.
create table if not exists discovery_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  settings jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Uploaded link lists (Excel or CSV) and their links.
create table if not exists discovery_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  file_name text not null default '',
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);
create table if not exists discovery_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  list_id uuid references discovery_lists(id) on delete cascade,
  url text not null,
  name text not null default '',
  type text not null default '',
  priority text not null default '',
  access text not null default '',
  region text not null default '',
  notes text not null default '',
  status text not null default 'new',      -- new, read, list, gated, blocked, failed
  articles int not null default 0,         -- articles taken on the last read
  error text not null default '',
  last_read timestamptz,
  created_at timestamptz default now()
);
do $$ begin
  alter table discovery_links add constraint discovery_links_status check (status in ('new','read','list','gated','blocked','failed'));
exception when duplicate_object then null; end $$;
create unique index if not exists discovery_links_unique on discovery_links(list_id, url);
create index if not exists discovery_links_ws on discovery_links(workspace_id);

-- One AI search or crawl run, with its live log (search, group, tool, results, cited, confirmed; or link and status).
create table if not exists discovery_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  kind text not null check (kind in ('ai','crawl')),
  trigger text not null default 'manual',  -- manual, auto (opened on run day), cron (Monday on the server)
  status text not null default 'running' check (status in ('running','done','failed','cancelled')),
  window_days int not null default 7,
  stats jsonb not null default '{}',
  log jsonb not null default '[]',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid default auth.uid()
);
create index if not exists discovery_runs_ws on discovery_runs(workspace_id, started_at desc);

-- Single articles, scored on the seven-dimension rubric. found_by holds every route that found it: ai, crawl, linkedin.
create table if not exists discovery_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  run_id uuid references discovery_runs(id) on delete set null,
  url text not null,
  title text not null default '',
  publisher text not null default '',
  source_type text not null default '',    -- Regulator, Major media, Publication, Research, Company, Blog, LinkedIn
  published date,
  confirmed boolean not null default false, -- the date was read on the page itself
  excerpt text not null default '',
  found_by text[] not null default '{}',
  found jsonb not null default '{}',        -- ai: {engine, pack, query}, crawl: {list, link}, linkedin: {author}
  scores int[] not null default '{}',       -- Buyer, Pillar, Geo, Service, Freshness, Evidence, Shashi angle, 0 to 5
  scored_by text not null default '',       -- rules or ai
  pillar text not null default '',
  geo text not null default '',
  service text not null default '',
  kind text not null default '',            -- Fact, Analysis, Signal, Speculation
  why text not null default '',
  angle text not null default '',
  orgs text[] not null default '{}',        -- organisations named, checked against Network for the warm line
  target boolean not null default false,    -- written by a target account or VIP
  competitor text not null default '',
  opp jsonb not null default '{}',          -- {kind: pitch, press or sales, due, ask}
  gap boolean not null default false,       -- linked to an AI citations gap
  status text not null default 'new',       -- new, sent, watched, dismissed
  dismiss_reason text not null default '',
  comment_target boolean not null default false,
  post_id uuid,
  found_at timestamptz not null default now()
);
do $$ begin
  alter table discovery_findings add constraint discovery_findings_status check (status in ('new','sent','watched','dismissed'));
exception when duplicate_object then null; end $$;
create unique index if not exists discovery_findings_url on discovery_findings(workspace_id, url);

-- Digest topics: every article about the same story merged into one, ranked per week.
create table if not exists discovery_topics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  week date not null,                       -- Monday of the digest week
  key text not null,                        -- stable key: the lead article's URL
  title text not null,
  finding_ids uuid[] not null default '{}',
  score int not null default 0,
  rank int,                                 -- 1 to 10 in the Digest; null for Rising and the rest
  rising boolean not null default false,
  parts jsonb not null default '{}',        -- the priority maths, kept for Why it ranks
  merge_with uuid,                          -- a possible merge waiting for Merge or Keep separate
  merge_state text not null default '',     -- '', possible, kept, merged
  campaign_id uuid references campaigns(id) on delete set null,
  post_id uuid,
  sent_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists discovery_topics_key on discovery_topics(workspace_id, week, key);

-- Posts: the chosen angle (every starting point) and what Discovery sent with the idea.
alter table posts add column if not exists angle text not null default '';
alter table posts add column if not exists discovery jsonb not null default '{}';  -- topic_id, rank, score, sources, service, angle, campaign

do $$ declare t text; begin
  foreach t in array array['discovery_settings','discovery_lists','discovery_links','discovery_runs','discovery_findings','discovery_topics'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

-- Warm line: connections at each organisation a finding names. Same normalising as Network (net_norm).
create or replace function discovery_warm(ws uuid, names text[]) returns table(name text, people int)
language sql stable security invoker set search_path = public as $$
  select n, (select count(*)::int from network_people np
             where np.workspace_id = ws and np.is_connection and np.company_norm <> ''
               and np.company_norm = replace(net_norm(n), ' ', ''))
  from unnest(names) as n
$$;
grant execute on function discovery_warm(uuid, text[]) to authenticated;

-- A LinkedIn post the user sent from the Prax bar while reading it. Nothing is read in the background.
create or replace function ext_discovery_add(tok text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; fid uuid; u text := left(coalesce(p->>'url',''), 1000);
begin
  select * into a from ext_auth(tok);
  if u = '' then u := 'linkedin:' || md5(coalesce(p->>'text','')); end if;
  insert into discovery_findings(workspace_id, url, title, publisher, source_type, published, confirmed, excerpt, found_by, found, orgs)
  values (a.ws, u, left(coalesce(nullif(p->>'title',''), split_part(coalesce(p->>'text',''), E'\n', 1)), 300),
          'LinkedIn, sent from the Prax bar', 'LinkedIn', current_date, true, left(coalesce(p->>'text',''), 6000),
          array['linkedin'], jsonb_build_object('linkedin', jsonb_build_object('author', coalesce(p->>'author',''), 'author_url', coalesce(p->>'author_url',''))),
          case when coalesce(p->>'company','') <> '' then array[p->>'company'] else '{}' end)
  on conflict (workspace_id, url) do update set found_by = (select array(select distinct unnest(discovery_findings.found_by || array['linkedin']))),
    excerpt = excluded.excerpt
  returning id into fid;
  return fid;
end $$;
grant execute on function ext_discovery_add(text, jsonb) to anon, authenticated;

select 'ok' as status;
