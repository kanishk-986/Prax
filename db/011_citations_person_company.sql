-- AI citations, person and company: Shashi (person) and Antier (company) tracked separately, peer experts and
-- peer firms in separate pools, prompt audiences and keywords, a one-click review for loose person matches,
-- and gap topics sent to Content Studio with their channel. Run after 010. Re-runnable.

-- Who an entity is: a person or a company. Tracked self entities are one of each; competitors are peer experts or
-- peer firms. Suggested peer experts are not tracked until approved.
alter table citation_entities add column if not exists subject text not null default 'company';
alter table citation_entities add column if not exists status text not null default 'active';
do $$ begin
  alter table citation_entities add constraint citation_entities_subject check (subject in ('person','company'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table citation_entities add constraint citation_entities_status check (status in ('active','suggested'));
exception when duplicate_object then null; end $$;

-- Split an existing mixed self entity: the person keeps his name and LinkedIn; the company keeps the rest.
do $$ declare r record; li text[]; begin
  for r in select * from citation_entities e where e.kind = 'self' and e.subject = 'company'
    and not exists (select 1 from citation_entities p where p.workspace_id = e.workspace_id and p.kind = 'self' and p.subject = 'person') loop
    select coalesce(array_agg(d), '{}') into li from unnest(r.domains) d where d ilike '%linkedin.com/in/%';
    insert into citation_entities(workspace_id, kind, subject, name, aliases, domains, sort)
    values (r.workspace_id, 'self', 'person', 'Shashi Pal', array['Shashi Pal'], li, 0);
    update citation_entities set name = 'Antier', aliases = coalesce((select array_agg(a) from unnest(r.aliases) a where a !~* '^\s*shashi'), array['Antier']),
      domains = coalesce((select array_agg(d) from unnest(r.domains) d where d not ilike '%linkedin.com/in/%'), '{}'), sort = 1
    where id = r.id;
  end loop;
end $$;

-- Who a prompt is for: expert (about people), vendor (about firms) or leadership (both). Keywords it tracks.
alter table citation_questions add column if not exists audience text not null default 'vendor';
alter table citation_questions add column if not exists keywords text[] not null default '{}';
do $$ begin
  alter table citation_questions add constraint citation_questions_audience check (audience in ('expert','vendor','leadership'));
exception when duplicate_object then null; end $$;
update citation_questions set audience = 'expert'
where audience = 'vendor' and question ~* '(expert|voices?|speaker|thought leader|who writes|who should i (hear|follow)|leaders? on|people)';
update citation_questions set audience = 'leadership' where audience = 'vendor' and question ~* '(who leads|who is behind|founder of|leadership)';

-- A full-name match with no context needs a person to confirm it: '' (not reviewed), 'confirmed' or 'rejected'.
alter table citation_runs add column if not exists person_review text not null default '';

-- Gap topics sent to Content Studio: which channel they are for and which prompt they came from.
alter table posts add column if not exists channel text not null default 'shashi';
alter table posts add column if not exists citation_question_id uuid references citation_questions(id) on delete set null;
do $$ begin
  alter table posts add constraint posts_channel check (channel in ('shashi','company'));
exception when duplicate_object then null; end $$;

select 'ok' as status;
