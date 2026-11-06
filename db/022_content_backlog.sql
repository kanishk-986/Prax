-- Content Studio backlog (CS6, CS28 to CS31). Run after 020 (021 belongs to the Strategy canvas). Re-runnable.
-- 1. Results per post (CS29): reposts and the day the numbers were measured, next to the impressions, reactions and
--    comments columns from schema.sql, plus where they came from (typed by hand, or read by the extension).
-- 2. Repurpose (CS30): an idea made from a posted piece keeps a link to it.
-- 3. First comment and reply prep (CS31): stored on the post so it is there after a reload.
-- 4. Generated images (CS6): a private Storage bucket "post-images", paths <workspace id>/<post id>/<file>,
--    read by any member of that workspace and written by its editors (has_role, as everywhere else).
-- 5. ext_post_results: the extension's door for numbers read on a post's own analytics page.

-- 1. Results.
alter table posts add column if not exists reposts int;
alter table posts add column if not exists results_at date;                         -- the day the numbers were read
alter table posts add column if not exists results_source text not null default '';  -- '', 'manual' or 'extension'
do $$ begin
  alter table posts add constraint posts_results_nonneg check (coalesce(impressions, 0) >= 0 and coalesce(reactions, 0) >= 0 and coalesce(comments, 0) >= 0 and coalesce(reposts, 0) >= 0);
exception when duplicate_object then null; end $$;

-- 2. Repurpose.
alter table posts add column if not exists repurposed_from uuid references posts(id) on delete set null;
create index if not exists posts_repurposed_from on posts(repurposed_from) where repurposed_from is not null;

-- 3. Prep: {"first": "...", "replies": [{"q": "...", "a": "..."}], "at": "..."}.
alter table posts add column if not exists prep jsonb not null default '{}';

-- 4. Images.
alter table posts add column if not exists image_path text not null default '';    -- object name in the post-images bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 8388608, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The workspace an object belongs to, from the first folder of its name; null when that is not a uuid.
create or replace function post_image_ws(name text) returns uuid
language plpgsql immutable set search_path = public, pg_catalog as $$
declare f text := split_part(name, '/', 1);
begin
  if f ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return f::uuid; end if;
  return null;
end $$;

drop policy if exists post_images_r on storage.objects;
drop policy if exists post_images_i on storage.objects;
drop policy if exists post_images_u on storage.objects;
drop policy if exists post_images_d on storage.objects;
create policy post_images_r on storage.objects for select to authenticated
  using (bucket_id = 'post-images' and has_role(post_image_ws(name), 'viewer'));
create policy post_images_i on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and has_role(post_image_ws(name), 'editor'));
create policy post_images_u on storage.objects for update to authenticated
  using (bucket_id = 'post-images' and has_role(post_image_ws(name), 'editor'))
  with check (bucket_id = 'post-images' and has_role(post_image_ws(name), 'editor'));
create policy post_images_d on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and has_role(post_image_ws(name), 'editor'));

-- 5. Post results from the extension. The post is found by its LinkedIn activity id (the number in
--    urn:li:activity:<id>, the same in the post link and its analytics page), in the token's workspace only.
--    Returns the post id, or null when no saved post has that link.
create or replace function ext_post_results(tok text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; act text; pid uuid;
  n_imp int := nullif(p->>'impressions', '')::int; n_rea int := nullif(p->>'reactions', '')::int;
  n_com int := nullif(p->>'comments', '')::int; n_rep int := nullif(p->>'reposts', '')::int;
begin
  select * into a from ext_auth(tok);
  act := substring(coalesce(p->>'url', '') from 'activity(?::|%3A|-)([0-9]{6,})');
  if act is null then return null; end if;
  update posts set
    impressions = coalesce(greatest(n_imp, 0), impressions), reactions = coalesce(greatest(n_rea, 0), reactions),
    comments = coalesce(greatest(n_com, 0), comments), reposts = coalesce(greatest(n_rep, 0), reposts),
    results_at = current_date, results_source = 'extension'
  where id = (select id from posts where workspace_id = a.ws and substring(url from 'activity(?::|%3A|-)([0-9]{6,})') = act order by created_at desc limit 1)
  returning id into pid;
  return pid;
end $$;
revoke execute on function ext_post_results(text, jsonb) from public;
grant execute on function ext_post_results(text, jsonb) to anon, authenticated;

select 'ok' as status,
  (select count(*) from information_schema.columns where table_name = 'posts' and column_name in ('reposts', 'results_at', 'results_source', 'repurposed_from', 'prep', 'image_path')) as new_columns,
  (select count(*) from storage.buckets where id = 'post-images') as bucket,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'post_images_%') as image_policies;
