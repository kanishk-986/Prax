-- Video recorded or uploaded inside Prax (I6). Run after 022 (it reuses post_image_ws). Re-runnable.
-- 1. posts.video_path: the object name in the post-videos bucket, '' when the post has no video.
-- 2. A private Storage bucket "post-videos" (200 MB, WebM, MP4 and MOV), paths <workspace id>/<post id>/<file>,
--    read by any member of that workspace and written by its editors (has_role, as for post-images in 022).
--    The project's own upload limit (Storage settings) must be at least 200 MB too, or larger files are refused there.

-- 1. The column.
alter table posts add column if not exists video_path text not null default '';

-- 2. The bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-videos', 'post-videos', false, 209715200, array['video/webm', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The workspace an object belongs to, from the first folder of its name; null when that is not a uuid.
-- Same function as in 022, repeated so this file also runs on its own.
create or replace function post_image_ws(name text) returns uuid
language plpgsql immutable set search_path = public, pg_catalog as $$
declare f text := split_part(name, '/', 1);
begin
  if f ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return f::uuid; end if;
  return null;
end $$;

drop policy if exists post_videos_r on storage.objects;
drop policy if exists post_videos_i on storage.objects;
drop policy if exists post_videos_u on storage.objects;
drop policy if exists post_videos_d on storage.objects;
create policy post_videos_r on storage.objects for select to authenticated
  using (bucket_id = 'post-videos' and has_role(post_image_ws(name), 'viewer'));
create policy post_videos_i on storage.objects for insert to authenticated
  with check (bucket_id = 'post-videos' and has_role(post_image_ws(name), 'editor'));
create policy post_videos_u on storage.objects for update to authenticated
  using (bucket_id = 'post-videos' and has_role(post_image_ws(name), 'editor'))
  with check (bucket_id = 'post-videos' and has_role(post_image_ws(name), 'editor'));
create policy post_videos_d on storage.objects for delete to authenticated
  using (bucket_id = 'post-videos' and has_role(post_image_ws(name), 'editor'));

select 'ok' as status,
  (select count(*) from information_schema.columns where table_name = 'posts' and column_name = 'video_path') as new_columns,
  (select count(*) from storage.buckets where id = 'post-videos') as bucket,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'post_videos_%') as video_policies;
