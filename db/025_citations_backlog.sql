-- AI citations backlog (AC15): suggested peer experts. Prax suggests the people AI answers name most often on expert
-- and leadership prompts; the suggestions are worked out on the page from the runs, so nothing is stored for them.
-- Approve adds a normal peer expert row. Dismiss keeps the name here, per tracked profile, so it is not offered again.
-- Run after 017. Re-runnable; deletes nothing.

alter table citation_profiles add column if not exists dismissed_peers text[] not null default '{}';

select 'ok' as status;
