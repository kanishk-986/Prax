-- Reply tracking (I1) and the Monday review (I2). Re-runnable; run after 026. Nothing is deleted or rewritten.
--
-- 1. replies: one row per reply, comment or mention the extension read on a LinkedIn page the user had open,
--    when they pressed a Prax "Check replies" button (the notifications page, or a post). Prax never reads
--    LinkedIn on its own. Each row is matched to the logged comment (comment_log) or the profile's own post
--    (posts) it answers, and to a Pipeline lead (prospects). Duplicates are kept out by a key per person, post
--    and the start of the text, so pressing the button twice, or seeing the same reply in a notification and
--    then on the post, gives one row.
-- 2. posts.replied_at: when someone first replied on the profile's own post (comment_log.replied_at came in 026).
-- 3. ext_replies_add: the extension's door (POST /api/ext/replies). Token checked by ext_auth like every ext_*
--    function. It stamps comment_log.reply (the 003 trigger warms the lead, the 026 trigger stamps replied_at),
--    stamps posts.replied_at, and adds a "Reply back" task on Today for each new reply from a Pipeline lead.
-- 4. weekly_reviews: the Monday review of a week (Keep, Change, Stop and next week's plan with checkboxes),
--    one row per profile and week, so past reviews can be reopened.
-- Security definer is used only for ext_replies_add (the extension has no signed-in user); it checks the token,
-- writes only to the token's own profile and has a fixed search_path.

-- ---------- 1. replies ----------
create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  kind text not null default 'comment_reply',   -- comment_reply: to the profile's comment; post_comment: on the profile's post; mention
  person text not null,
  person_url text not null default '',          -- their LinkedIn profile
  body text not null default '',                -- what they wrote, as far as the page showed it
  post_url text not null default '',
  activity text not null default '',            -- the post's LinkedIn activity id, used for matching
  replied_at timestamptz not null default now(),-- when LinkedIn says they wrote it (approximate: "2h", "3d")
  seen_at timestamptz not null default now(),   -- when the user pressed Check replies
  comment_log_id uuid references comment_log(id) on delete set null,
  post_id uuid references posts(id) on delete set null,
  prospect_id uuid references prospects(id) on delete set null,
  source text not null default 'extension',
  dedupe text not null,
  created_by uuid default auth.uid()
);
do $$ begin
  alter table replies add constraint replies_kind check (kind in ('comment_reply','post_comment','mention'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table replies add constraint replies_source check (source in ('extension','manual'));
exception when duplicate_object then null; end $$;
create unique index if not exists replies_dedupe on replies(workspace_id, dedupe);
create index if not exists replies_ws_seen on replies(workspace_id, seen_at desc);

-- ---------- 4. weekly reviews ----------
create table if not exists weekly_reviews (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  week date not null,                           -- the Monday of the week reviewed
  keep text not null default '',
  change text not null default '',
  stop text not null default '',
  plan jsonb not null default '[]',             -- next week's plan: [{ "id", "text", "source", "href", "done" }]
  summary text not null default '',             -- the three sentences as they read when saved
  saved_by uuid default auth.uid(),
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (workspace_id, week)
);
do $$ begin
  alter table weekly_reviews add constraint weekly_reviews_monday check (extract(isodow from week) = 1);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table weekly_reviews add constraint weekly_reviews_plan_array check (jsonb_typeof(plan) = 'array');
exception when duplicate_object then null; end $$;

-- Viewers read, editors write, for both tables (has_role from schema.sql).
do $$ declare t text; begin
  foreach t in array array['replies','weekly_reviews'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists r on %I', t);
    execute format('drop policy if exists w on %I', t);
    execute format('create policy r on %I for select using (has_role(workspace_id, ''viewer''))', t);
    execute format('create policy w on %I for all using (has_role(workspace_id, ''editor'')) with check (has_role(workspace_id, ''editor''))', t);
    begin execute format('alter publication supabase_realtime add table %I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

-- A review saved in Prax is always saved as the signed-in user, at the time of saving.
create or replace function weekly_review_saved() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if auth.uid() is not null then new.saved_by := auth.uid(); end if;
  new.saved_at := now();
  return new;
end $$;
drop trigger if exists weekly_review_saved on weekly_reviews;
create trigger weekly_review_saved before insert or update on weekly_reviews for each row execute function weekly_review_saved();

-- A reply typed in by hand is recorded as the signed-in user.
create or replace function reply_author() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists reply_author on replies;
create trigger reply_author before insert on replies for each row execute function reply_author();

-- ---------- 2. when a reply first came in on the profile's own post ----------
alter table posts add column if not exists replied_at timestamptz;

-- ---------- helpers (plain functions, no special rights) ----------
-- The LinkedIn activity id in a post link: /feed/update/urn:li:activity:<id>/, /posts/<slug>-activity-<id>-xxxx, or encoded.
create or replace function li_activity(url text) returns text
language sql immutable set search_path = public, pg_catalog as $$
  select coalesce(substring(coalesce(url, '') from 'activity(?::|%3A|-)([0-9]{6,})'), '')
$$;

-- Who wrote it: their profile slug, else their name.
create or replace function reply_who(person_url text, person text) returns text
language sql immutable set search_path = public, pg_catalog as $$
  select coalesce(nullif(lower(substring(coalesce(person_url, '') from 'linkedin\.com/in/([^/?#]+)')), ''), lower(trim(coalesce(person, ''))))
$$;
-- Which post: the activity id, else the link without its query.
create or replace function reply_where(activity text, post_url text) returns text
language sql immutable set search_path = public, pg_catalog as $$
  select coalesce(nullif(activity, ''), lower(split_part(split_part(coalesce(post_url, ''), '?', 1), '#', 1)))
$$;
-- What they wrote, for comparing: lower case, letters and digits only, without the "…" a notification ends a cut reply with.
create or replace function reply_text(body text) returns text
language sql immutable set search_path = public, pg_catalog as $$
  select regexp_replace(lower(regexp_replace(coalesce(body, ''), '(…|\.\.\.)\s*$', '')), '[^[:alnum:]]+', '', 'g')
$$;
-- The exact duplicate key (the unique index). Cut-short copies are caught in ext_replies_add by their start.
create or replace function reply_dedupe(person_url text, person text, activity text, post_url text, body text) returns text
language sql immutable set search_path = public, pg_catalog as $$
  select md5(reply_who(person_url, person) || '|' || reply_where(activity, post_url) || '|' || reply_text(body))
$$;
-- Two texts are the same reply when they are equal, one is empty, or one starts the other (at least 12 letters).
create or replace function reply_same_text(a text, b text) returns boolean
language sql immutable set search_path = public, pg_catalog as $$
  select a = b or a = '' or b = '' or (least(length(a), length(b)) >= 12 and (starts_with(a, b) or starts_with(b, a)))
$$;

-- ---------- 3. the extension's door ----------
-- p: { replies: [{ kind, name, url (their profile), text, post_url, at (ISO, optional), mine (the profile's own
--      comment text the reply sits under, optional) }], day (the user's local YYYY-MM-DD, for the Today task) }.
-- Called only when the user presses the extension's own Check replies. At most 50 replies per call.
create or replace function ext_replies_add(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  a record; r jsonb; me text; nm text; purl text; txt text; kd text; post text; act text; at timestamptz;
  cid uuid; pid uuid; lid uuid; rid uuid; dkey text; d date; nidx int;
  added int := 0; known int := 0; skipped int := 0; on_comments int := 0; on_posts int := 0; tasks int := 0;
  leads text[] := '{}';
begin
  select * into a from ext_auth(tok);
  select lower(trim(name)) into me from workspaces where id = a.ws;
  -- Today's task goes on the user's own day, which can differ from the server's by a day.
  begin d := nullif(p->>'day', '')::date; exception when others then d := null; end;
  if d is null or d < current_date - 1 or d > current_date + 1 then d := current_date; end if;

  for r in select x from jsonb_array_elements(case when jsonb_typeof(p->'replies') = 'array' then p->'replies' else '[]'::jsonb end) with ordinality as e(x, n) where n <= 50 loop
    nm := left(trim(coalesce(r->>'name', '')), 200);
    txt := left(trim(coalesce(r->>'text', '')), 4000);
    purl := left(coalesce(r->>'url', ''), 500);
    post := left(split_part(coalesce(r->>'post_url', ''), '#', 1), 1000);
    kd := case when r->>'kind' in ('comment_reply','post_comment','mention') then r->>'kind' else 'comment_reply' end;
    -- Nothing to record, or the profile answering itself.
    if nm = '' or (txt = '' and post = '') or lower(nm) = me then skipped := skipped + 1; continue; end if;
    if purl !~ '^https://([a-z]+\.)?linkedin\.com/in/' then purl := ''; end if;
    if post !~ '^https://([a-z]+\.)?linkedin\.com/' then post := ''; end if;
    act := li_activity(post);
    begin at := coalesce(nullif(r->>'at', '')::timestamptz, now()); exception when others then at := now(); end;
    if at > now() then at := now(); end if;
    if at < now() - interval '400 days' then at := now(); end if;

    -- The logged comment it answers (newest on that post; the one whose text starts the same, when sent), else the profile's own post.
    cid := null; lid := null;
    if act <> '' then
      if kd <> 'post_comment' then
        select c.id into cid from comment_log c
        where c.workspace_id = a.ws and li_activity(c.url) = act
        order by (coalesce(r->>'mine', '') <> '' and left(lower(c.text), 40) = left(lower(r->>'mine'), 40)) desc, c.created_at desc limit 1;
      end if;
      if cid is null then
        select x.id into lid from posts x where x.workspace_id = a.ws and li_activity(x.url) = act order by x.created_at desc limit 1;
      end if;
    end if;
    pid := match_prospect(a.ws, purl, nm);
    dkey := reply_dedupe(purl, nm, act, post, txt);

    -- Seen before (pressed twice, or first in a notification that cut it short): same person, same post, same start.
    select x.id into rid from replies x
    where x.workspace_id = a.ws and reply_where(x.activity, x.post_url) = reply_where(act, post)
      and (lower(x.person) = lower(nm) or (purl <> '' and x.person_url <> '' and reply_who(x.person_url, '') = reply_who(purl, '')))
      and reply_same_text(reply_text(x.body), reply_text(txt))
    order by x.seen_at limit 1;
    if rid is not null then
      -- Keep the longer text, fill what was missing, keep the first times.
      update replies x set
        body = case when length(txt) > length(x.body) then txt else x.body end,
        person_url = coalesce(nullif(x.person_url, ''), purl),
        post_url = coalesce(nullif(x.post_url, ''), post),
        comment_log_id = coalesce(x.comment_log_id, cid), post_id = coalesce(x.post_id, lid), prospect_id = coalesce(x.prospect_id, pid)
      where x.id = rid;
      known := known + 1; continue;
    end if;

    insert into replies(workspace_id, kind, person, person_url, body, post_url, activity, replied_at, comment_log_id, post_id, prospect_id, source, dedupe, created_by)
    values (a.ws, kd, nm, purl, txt, post, act, at, cid, lid, pid, 'extension', dkey, a.uid)
    on conflict (workspace_id, dedupe) do nothing
    returning id into rid;
    if rid is null then known := known + 1; continue; end if;
    added := added + 1;
    if cid is not null then
      update comment_log set reply = true where id = cid and not coalesce(reply, false);
      on_comments := on_comments + 1;
    end if;
    if lid is not null then
      update posts set replied_at = coalesce(replied_at, now()) where id = lid;
      on_posts := on_posts + 1;
    end if;
    if pid is not null then
      update prospects set warmth = 'warm' where id = pid and coalesce(warmth, '') <> 'warm';
      leads := array_append(leads, (select name from prospects where id = pid));
      -- A "Reply back" task on Today (kind reply, index 500 and up, after the quota rows), once per reply.
      if not exists (select 1 from daily_items where workspace_id = a.ws and note in ('replyback:' || rid, 'skip:replyback:' || rid)) then
        select greatest(499, coalesce(max(idx), 499)) + 1 into nidx from daily_items where workspace_id = a.ws and day = d and kind = 'reply' and idx >= 500;
        insert into daily_items(workspace_id, day, kind, idx, title, link, note, prospect_id)
        values (a.ws, d, 'reply', nidx, 'Reply back to ' || nm, post, 'replyback:' || rid, pid)
        on conflict (workspace_id, day, kind, idx) do nothing;
        if found then tasks := tasks + 1; end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object('added', added, 'known', known, 'skipped', skipped, 'comments', on_comments, 'posts', on_posts, 'tasks', tasks,
    'leads', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from unnest(leads) x where x is not null));
end $$;
revoke all on function ext_replies_add(text, jsonb) from public;
grant execute on function ext_replies_add(text, jsonb) to anon, authenticated;

select 'ok' as status, (select count(*) from replies) as replies, (select count(*) from weekly_reviews) as reviews;
