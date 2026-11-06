-- Network, Discovery and extension backlog (N11, N12, DS15, DS16). Run after 023. Re-runnable, deletes nothing.
-- 1. Mutual connections and location on prospects and network people, read by the extension from a profile the
--    user has open, only when they press the Prax bar (N11, N12). Never read in the background.
-- 2. ext_profile_save: the extension's door for that click. Token checked by ext_auth (editors only).
-- 3. ext_discovery_add also takes a profile the user has open (DS15): kind 'profile'.
-- 4. A target account in a Discovery finding adds a dated note on that prospect in Pipeline (DS16).

-- 1. Columns. RLS on both tables is unchanged (006 and schema.sql: viewers read, editors write via has_role).
alter table prospects add column if not exists location text not null default '';
alter table prospects add column if not exists mutual_count int;
alter table prospects add column if not exists mutual_names text[] not null default '{}';
alter table prospects add column if not exists profile_read_at timestamptz;
alter table network_people add column if not exists location text not null default '';
alter table network_people add column if not exists mutual_count int;
alter table network_people add column if not exists mutual_names text[] not null default '{}';
alter table network_people add column if not exists profile_read_at timestamptz;
-- network_merge (006) updates only the export's own columns, so a re-import keeps what the extension saved.

-- 2. Save what the profile shows. p: url, key (normUrl from src/lib/network.ts), name, location,
--    mutual_count (null when no mutual line was shown), mutual_names (up to 10).
--    Matches the prospect by profile URL then exact name (match_prospect, 003), and the network person by key,
--    or by the prospect they are linked to. Empty values never overwrite saved ones.
create or replace function ext_profile_save(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare a record; pid uuid; n int := 0;
  loc text := left(btrim(coalesce(p->>'location','')), 200);
  cnt int := case when jsonb_typeof(p->'mutual_count') = 'number' then greatest(0, (p->>'mutual_count')::int) end;
  names text[] := coalesce((select array_agg(left(x, 120)) from (select jsonb_array_elements_text(case when jsonb_typeof(p->'mutual_names') = 'array' then p->'mutual_names' else '[]' end) x limit 10) s), '{}');
begin
  select * into a from ext_auth(tok);  -- raises unless the token belongs to an editor of its workspace
  pid := match_prospect(a.ws, p->>'url', p->>'name');
  if pid is not null then
    update prospects set
      location = case when loc <> '' then loc else location end,
      mutual_count = coalesce(cnt, mutual_count),
      mutual_names = case when cnt is not null then names else mutual_names end,
      profile_read_at = now()
    where id = pid and workspace_id = a.ws;
  end if;
  update network_people set
    location = case when loc <> '' then loc else location end,
    mutual_count = coalesce(cnt, mutual_count),
    mutual_names = case when cnt is not null then names else mutual_names end,
    profile_read_at = now()
  where workspace_id = a.ws and ((coalesce(p->>'key','') <> '' and key = p->>'key') or (pid is not null and prospect_id = pid));
  get diagnostics n = row_count;
  return jsonb_build_object('prospect', (select name from prospects where id = pid), 'prospect_id', pid, 'person', n > 0);
end $$;
revoke execute on function ext_profile_save(text, jsonb) from public;
grant execute on function ext_profile_save(text, jsonb) to anon, authenticated;

-- 3. Send to Discovery, now also from a profile (p.kind = 'profile'). Same as 013 for posts.
create or replace function ext_discovery_add(tok text, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_catalog as $$
declare a record; fid uuid; u text := left(coalesce(p->>'url',''), 1000);
  prof boolean := coalesce(p->>'kind','') = 'profile';
begin
  select * into a from ext_auth(tok);
  if u = '' then u := 'linkedin:' || md5(coalesce(p->>'text','')); end if;
  insert into discovery_findings(workspace_id, url, title, publisher, source_type, published, confirmed, excerpt, found_by, found, orgs)
  values (a.ws, u, left(coalesce(nullif(p->>'title',''), split_part(coalesce(p->>'text',''), E'\n', 1)), 300),
          case when prof then 'LinkedIn profile, sent from the Prax bar' else 'LinkedIn, sent from the Prax bar' end, 'LinkedIn', current_date, true, left(coalesce(p->>'text',''), 6000),
          array['linkedin'], jsonb_build_object('linkedin', jsonb_build_object('author', coalesce(p->>'author',''), 'author_url', coalesce(p->>'author_url',''), 'kind', case when prof then 'profile' else 'post' end)),
          case when coalesce(p->>'company','') <> '' then array[left(p->>'company', 200)] else '{}' end)
  on conflict (workspace_id, url) do update set found_by = (select array(select distinct unnest(discovery_findings.found_by || array['linkedin']))),
    excerpt = excluded.excerpt,
    title = case when prof then excluded.title else discovery_findings.title end,
    found_at = case when prof then now() else discovery_findings.found_at end
  returning id into fid;
  return fid;
end $$;
grant execute on function ext_discovery_add(text, jsonb) to anon, authenticated;

-- 4. Target account in the news. When a finding names a target account (the company of a prospect not Parked,
--    the same list Discovery Studio searches), the prospect gets a note in Pipeline: "In the news: <title>, <link>".
--    The note is a thread on the prospect (its date is created_at) and is added once per finding (same link, or the same text for a post sent from the Prax bar). Matching:
--    an organisation the finding names equals the company (net_norm, as in Network), or the company name of 4+
--    characters appears as whole words in the title. src/lib/discovery.ts targetNews() mirrors it for Needs you.
--    Skipped: dismissed findings and profiles sent from the Prax bar (people, not news).
--    security definer so the server crawl (service role) and the browser runs write the same note; the trigger
--    only fires on rows that already passed discovery_findings RLS (editors) and only touches that workspace.
create or replace function discovery_target_news() returns trigger
language plpgsql security definer set search_path = public, pg_catalog as $$
declare pr record; link text; note_text text;
begin
  if new.status = 'dismissed' or coalesce(new.found->'linkedin'->>'kind','') = 'profile' then return new; end if;
  link := case when new.url like 'linkedin:%' then 'sent from the Prax bar' else new.url end;
  note_text := left('In the news: ' || coalesce(nullif(new.title,''), link), 400) || ', ' || link;
  for pr in
    select p.id from prospects p
    where p.workspace_id = new.workspace_id and p.stage <> 'Parked' and coalesce(p.company,'') <> ''
      and replace(net_norm(p.company), ' ', '') <> ''
      and (exists (select 1 from unnest(new.orgs) o where replace(net_norm(o), ' ', '') = replace(net_norm(p.company), ' ', ''))
           or (length(btrim(p.company)) >= 4 and new.title ~* ('\m' || regexp_replace(btrim(p.company), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M')))
      and not exists (select 1 from threads t where t.workspace_id = new.workspace_id and t.ref_table = 'prospects' and t.ref_id = p.id
                        and t.author_email = 'Discovery Studio'
                        and (t.body = note_text or (link = new.url and position(new.url in t.body) > 0)))
  loop
    insert into threads(workspace_id, ref_table, ref_id, author, author_email, body)
    values (new.workspace_id, 'prospects', pr.id, null, 'Discovery Studio', note_text);
  end loop;
  return new;
end $$;
revoke execute on function discovery_target_news() from public, anon, authenticated;
drop trigger if exists discovery_target_news on discovery_findings;
create trigger discovery_target_news after insert or update of orgs, title, status on discovery_findings
  for each row execute function discovery_target_news();

select 'ok' as status,
  (select count(*) from information_schema.columns where table_name in ('prospects','network_people') and column_name in ('location','mutual_count','mutual_names','profile_read_at')) as new_columns,
  (select count(*) from pg_trigger where tgname = 'discovery_target_news') as news_trigger;
