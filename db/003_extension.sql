-- Chrome extension: per-person tokens, the profile's comment voice, auto-logging and pipeline moves.
-- The extension never touches LinkedIn on its own; it only sends what the user clicked to log or capture.

create extension if not exists pgcrypto with schema extensions;

alter table workspaces add column if not exists voice text not null default '';
alter table comment_log add column if not exists prospect_id uuid references prospects(id) on delete set null;
alter table comment_log add column if not exists author_url text not null default '';
alter table comment_log add column if not exists post_text text not null default '';

-- A token is shown once in Settings; only its sha256 is stored.
create table if not exists ext_tokens (
  token_hash text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  label text not null default 'Chrome',
  created_at timestamptz default now(),
  last_used timestamptz
);
alter table ext_tokens enable row level security;
drop policy if exists own on ext_tokens;
create policy own on ext_tokens for all using (user_id = auth.uid() and has_role(workspace_id,'editor'))
  with check (user_id = auth.uid() and has_role(workspace_id,'editor'));

create or replace function has_role_of(ws uuid, u uuid, min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.workspace_id = ws and m.user_id = u and role_rank(m.role) >= role_rank(min_role))
$$;

-- Resolve a raw token to its workspace and user, or raise.
create or replace function ext_auth(tok text, out ws uuid, out uid uuid)
language plpgsql security definer set search_path = public, extensions as $$
begin
  update ext_tokens t set last_used = now()
  where t.token_hash = encode(extensions.digest(tok, 'sha256'), 'hex')
    and has_role_of(t.workspace_id, t.user_id, 'editor')
  returning t.workspace_id, t.user_id into ws, uid;
  if ws is null then raise exception 'invalid token' using errcode = '28000'; end if;
end $$;


create or replace function ext_me(tok text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record; w workspaces;
begin
  select * into a from ext_auth(tok);
  select * into w from workspaces where id = a.ws;
  return jsonb_build_object('workspace', w.name, 'slug', w.slug, 'headline', w.headline, 'topics', w.topics, 'voice', w.voice,
    'email', (select email from auth.users where id = a.uid),
    'today', (select count(*) filter (where done) || '/' || count(*) from daily_items where workspace_id = a.ws and day = current_date and kind = 'comment'));
end $$;

-- Match a LinkedIn person to a prospect by profile URL slug, then by exact name.
create or replace function match_prospect(ws uuid, url text, nm text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from prospects p where p.workspace_id = ws and (
    (coalesce(url,'') <> '' and p.linkedin <> '' and lower(p.linkedin) like '%' || lower(substring(url from 'linkedin\.com/in/([^/?#]+)')) || '%')
    or (coalesce(nm,'') <> '' and lower(p.name) = lower(nm)))
  order by (p.linkedin <> '') desc limit 1
$$;

-- Log a comment the user has posted, tick one of today's comment items, warm the prospect.
create or replace function ext_log_comment(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record; pid uuid; cid uuid; item uuid;
begin
  select * into a from ext_auth(tok);
  pid := match_prospect(a.ws, p->>'author_url', p->>'author');
  insert into comment_log(workspace_id, author, author_url, url, mode, text, post_text, source, prospect_id, segment)
  values (a.ws, coalesce(p->>'author',''), coalesce(p->>'author_url',''), coalesce(p->>'url',''), coalesce(p->>'mode',''),
          coalesce(p->>'text',''), left(coalesce(p->>'post_text',''), 6000), 'extension', pid,
          coalesce((select segment from prospects where id = pid), ''))
  returning id into cid;
  select id into item from daily_items where workspace_id = a.ws and day = current_date and kind = 'comment' and not done order by idx limit 1;
  if item is not null then
    update daily_items set done = true, link = coalesce(p->>'url',''), note = coalesce(p->>'author',''), prospect_id = pid where id = item;
  end if;
  return jsonb_build_object('id', cid, 'prospect', (select name from prospects where id = pid), 'ticked', item is not null);
end $$;

-- Prospect Capture: store the profile text the user captured, create or link the prospect.
create or replace function ext_capture(tok text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record; pid uuid; did uuid; made boolean := false;
begin
  select * into a from ext_auth(tok);
  pid := match_prospect(a.ws, p->>'url', p->'parsed'->>'name');
  if pid is null and coalesce((p->>'create')::boolean, true) and coalesce(p->'parsed'->>'name','') <> '' then
    insert into prospects(workspace_id, name, role, linkedin, stage, why)
    values (a.ws, p->'parsed'->>'name', left(coalesce(p->'parsed'->>'headline',''), 200), coalesce(p->>'url',''), 'Target', 'Captured from LinkedIn')
    returning id into pid; made := true;
  end if;
  insert into profile_docs(workspace_id, subject, prospect_id, source, file_name, raw_text, parsed, audit, score, created_by)
  values (a.ws, case when coalesce((p->>'self')::boolean, false) then 'self' else 'prospect' end, pid, 'capture', coalesce(p->>'url',''),
          left(coalesce(p->>'raw',''), 60000), coalesce(p->'parsed','{}'), coalesce(p->'audit','{}'), (p->'audit'->>'score')::int, a.uid)
  returning id into did;
  return jsonb_build_object('doc', did, 'prospect', pid, 'created', made);
end $$;

-- Analytics capture: numbers read from the user's own analytics page.
create or replace function ext_snapshot(tok text, metrics jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare a record; k text; n int := 0;
begin
  select * into a from ext_auth(tok);
  for k in select jsonb_object_keys(metrics) loop
    insert into snapshots(workspace_id, metric, value, source) values (a.ws, k, (metrics->>k)::numeric, 'extension'); n := n + 1;
  end loop;
  return n;
end $$;

-- Reply tracking: mark logged comments on a post as replied when the user checks the thread.
create or replace function ext_replies(tok text, post_url text) returns int
language plpgsql security definer set search_path = public as $$
declare a record; n int;
begin
  select * into a from ext_auth(tok);
  update comment_log set reply = true
  where workspace_id = a.ws and not reply and url <> '' and split_part(url, '?', 1) = split_part(post_url, '?', 1);
  get diagnostics n = row_count;
  return n;
end $$;

-- Pipeline moves: a comment on a Target's post warms them; a reply marks them warm.
create or replace function on_comment_logged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.prospect_id is not null then
    if tg_op = 'INSERT' then
      update prospects set stage = 'Warming' where id = new.prospect_id and stage = 'Target';
      insert into activity(workspace_id, kind, label, ref_id) values (new.workspace_id, 'comment', 'Commented on ' || new.author, new.prospect_id);
    elsif new.reply and not coalesce(old.reply, false) then
      update prospects set warmth = 'warm' where id = new.prospect_id;
      insert into activity(workspace_id, kind, label, ref_id) values (new.workspace_id, 'reply', new.author || ' replied', new.prospect_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comment_logged on comment_log;
create trigger comment_logged after insert or update of reply on comment_log for each row execute function on_comment_logged();

revoke all on function ext_auth(text) from public, anon;
grant execute on function ext_me(text), ext_log_comment(text, jsonb), ext_capture(text, jsonb), ext_snapshot(text, jsonb), ext_replies(text, text) to anon, authenticated;

update workspaces set voice = $v$You write LinkedIn comments as Shashi Pal, Co-Founder and COO of Antier, for senior people in institutional finance (banks, payment firms, stablecoin issuers, regulators' ecosystems). The goal is that the reader thinks "this person knows something I did not", never "this person wants something from me".

Rules:
- 50 to 70 words, 3 to 4 sentences of varied length. Never a one-liner, never incomplete.
- Add a value layer, never a summary of the post: a consequence, a cause, a second gate, an overlooked clause, or arithmetic on their own number.
- Give Shashi's view in plain words with "I think", "In my view" or "In my perspective". Never "My read is".
- Do not repeat any angle already taken in the existing comments.
- End with one short, specific question when it can start a conversation.
- Agree first, then add. Use the author's first name where natural. Write like the humans in the thread: plain spoken sentences, no punchy hook lines.
- Never criticise a regulator or government. Never correct the author in public. No praise ("great post", "thanks for sharing").
- No invented experience: no clients, builds, committees or conversations. No pitching Antier.
- Only state facts that appear in the post text provided. Do not invent numbers, dates or names.
- No em or en dashes, no contractions, no statute or paragraph numbers.
- Banned words: just, must, now, sit, sits, delve, pivotal, crucial, testament, tapestry, landscape, underscore, showcase, vibrant, fostering, key, vital, leverage, robust, seamless, game-changer. No openers that point at the post ("What stands out", "The part that").$v$
where name ilike 'shashi%' and voice = '';

select 'ok' as status, (select count(*) from ext_tokens) as tokens, (select length(voice) from workspaces where name ilike 'shashi%' limit 1) as voice_len;
