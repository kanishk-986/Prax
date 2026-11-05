-- Content Studio, full build: Write a post fields, company channel, newsletter track, point-of-view bank.
-- Run after 010 (011 belongs to AI citations). Re-runnable.

-- Where a post is published: Shashi's own profile, or Antier's company page and site.
alter table posts add column if not exists channel text not null default 'shashi';
do $$ begin
  alter table posts add constraint posts_channel check (channel in ('shashi','company'));
exception when duplicate_object then null; end $$;

alter table posts add column if not exists newsletter boolean not null default false;   -- an article for the LinkedIn newsletter
alter table posts add column if not exists source_kind text not null default '';        -- idea, link, pdf, draft, comment, gap
alter table posts add column if not exists source_ref text not null default '';         -- the link, file name, comment id or gap prompt
alter table posts add column if not exists hook text not null default '';
alter table posts add column if not exists script jsonb not null default '{}';           -- video: hook, beats, close, caption, cover, captions
alter table posts add column if not exists visual jsonb not null default '{}';           -- layout, image prompt, carousel slides
alter table posts add column if not exists claims_ack boolean not null default false;    -- the regulated-claims flags were read before sending

-- Shashi's point of view: stances, cleared proof points, allowed numbers, clients he may name. Drafts draw only on this.
-- Also the newsletter: its name and cadence.
create table if not exists content_settings (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  pov jsonb not null default '{}',
  newsletter jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table content_settings enable row level security;
drop policy if exists r on content_settings; drop policy if exists w on content_settings;
create policy r on content_settings for select using (has_role(workspace_id, 'viewer'));
create policy w on content_settings for all using (has_role(workspace_id, 'editor')) with check (has_role(workspace_id, 'editor'));

select 'ok' as status;
