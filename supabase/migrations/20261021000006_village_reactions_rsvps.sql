-- =====================================================================
-- Global Village one-tap support, circle RSVPs, and a fuller safety plan
--
--  1. Three one-tap reactions on a post: "Sending strength" (the old
--     support), "Me too" and "This helped me". One of each per person.
--  2. Circle RSVPs: say you're going to the next circle, so others can see
--     how many people will be there. Only the number is shared, never who.
--  3. Safety plan: "reasons to keep going" and "safe places".
-- =====================================================================

-- 1. Reactions --------------------------------------------------------

alter table public.village_support
  add column kind text not null default 'strength' check (kind in ('strength', 'metoo', 'helped'));

alter table public.village_support drop constraint village_support_pkey;
alter table public.village_support add primary key (post_id, user_id, kind);

alter table public.village_posts
  add column metoo_count  integer not null default 0,
  add column helped_count integer not null default 0;

-- Keep all the counters on each post correct.
create or replace function public.village_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := coalesce(new.post_id, old.post_id);
begin
  perform public.begin_system_update();
  if tg_table_name = 'village_support' then
    update public.village_posts set
      support_count = (select count(*) from public.village_support s where s.post_id = pid and s.kind = 'strength'),
      metoo_count   = (select count(*) from public.village_support s where s.post_id = pid and s.kind = 'metoo'),
      helped_count  = (select count(*) from public.village_support s where s.post_id = pid and s.kind = 'helped')
    where id = pid;
  else
    update public.village_posts set reply_count = (select count(*) from public.village_replies r where r.post_id = pid and not r.hidden) where id = pid;
  end if;
  perform public.end_system_update();
  return coalesce(new, old);
end $$;

-- 2. Circle RSVPs -----------------------------------------------------

create table public.circle_rsvps (
  circle_id  text not null references public.village_circles (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- the date of the session (Ghana time), so each week starts fresh
  session_on date not null,
  created_at timestamptz not null default now(),
  primary key (circle_id, user_id, session_on)
);

alter table public.circle_rsvps enable row level security;

create policy "rsvps: read own"  on public.circle_rsvps for select to authenticated using (user_id = auth.uid());
create policy "rsvps: say going" on public.circle_rsvps for insert to authenticated
  with check (user_id = auth.uid() and session_on between current_date - 1 and current_date + 8);
create policy "rsvps: take back" on public.circle_rsvps for delete to authenticated using (user_id = auth.uid());

-- How many people are going to a session. Only the count leaves the database.
create or replace function public.circle_going_count(cid text, day date)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.circle_rsvps r where r.circle_id = cid and r.session_on = day;
$$;

revoke all on function public.circle_going_count(text, date) from public;
grant execute on function public.circle_going_count(text, date) to authenticated;

-- 3. Safety plan: two more parts the person fills in themselves -------
-- (warning signs, coping steps and support people already exist; the
--  person's counsellor can see and help with the plan, as before)
alter table public.safety_plans
  add column reasons     text not null default '' check (char_length(reasons) <= 1000),
  add column safe_places text not null default '' check (char_length(safe_places) <= 600);
