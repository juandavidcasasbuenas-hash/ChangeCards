create extension if not exists pgcrypto;

create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_user_id uuid not null,
  status text not null default 'lobby' check (status in ('lobby', 'round', 'between', 'ended')),
  round_number integer not null default 0 check (round_number >= 0),
  target_rounds integer not null default 4 check (target_rounds = 4),
  submitted_count integer not null default 0 check (submitted_count >= 0),
  round_started_at timestamptz,
  round_ends_at timestamptz,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (workshop_id, user_id)
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  owner_participant_id uuid not null unique references public.participants(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  card_id integer not null check (card_id between 1 and 16),
  source_text text not null,
  response text check (response is null or char_length(response) between 1 and 1000),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workshop_id, round_number, participant_id),
  unique (workshop_id, round_number, idea_id)
);

create index if not exists participants_workshop_idx on public.participants(workshop_id);
create index if not exists ideas_workshop_idx on public.ideas(workshop_id);
create index if not exists assignments_workshop_round_idx on public.assignments(workshop_id, round_number);
create index if not exists assignments_idea_idx on public.assignments(idea_id, round_number);

alter table public.workshops enable row level security;
alter table public.participants enable row level security;
alter table public.ideas enable row level security;
alter table public.assignments enable row level security;

create or replace function public.is_change_cards_member(p_workshop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.participants
    where workshop_id = p_workshop_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_read_change_cards_assignment(
  p_workshop_id uuid,
  p_participant_id uuid,
  p_idea_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_change_cards_member(p_workshop_id) and (
    exists (
      select 1 from public.participants
      where id = p_participant_id and user_id = auth.uid()
    )
    or exists (
      select 1
      from public.workshops workshop
      join public.ideas idea on idea.workshop_id = workshop.id
      join public.participants owner on owner.id = idea.owner_participant_id
      where workshop.id = p_workshop_id
        and workshop.status = 'ended'
        and idea.id = p_idea_id
        and owner.user_id = auth.uid()
    )
  );
$$;

drop policy if exists "Members can read workshops" on public.workshops;
create policy "Members can read workshops" on public.workshops
for select to authenticated
using (public.is_change_cards_member(id));

drop policy if exists "Members can read participants" on public.participants;
create policy "Members can read participants" on public.participants
for select to authenticated
using (public.is_change_cards_member(workshop_id));

drop policy if exists "Members can read ideas" on public.ideas;
create policy "Members can read ideas" on public.ideas
for select to authenticated
using (public.is_change_cards_member(workshop_id));

drop policy if exists "Members can read assignments" on public.assignments;
drop policy if exists "Players can read their passes" on public.assignments;
create policy "Players can read their passes" on public.assignments
for select to authenticated
using (public.can_read_change_cards_assignment(workshop_id, participant_id, idea_id));

create or replace function public.create_change_cards_workshop(p_display_name text, p_idea text)
returns table (workshop_id uuid, code text, participant_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workshop_id uuid;
  v_participant_id uuid;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt integer;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a workshop.'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'Enter a name under 40 characters.'; end if;
  if char_length(trim(p_idea)) not between 1 and 1000 then raise exception 'Enter an idea under 1,000 characters.'; end if;

  for v_attempt in 1..12 loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * char_length(v_alphabet))::integer, 1), '')
      into v_code from generate_series(1, 6);
    begin
      insert into public.workshops (code, host_user_id)
      values (v_code, auth.uid())
      returning id into v_workshop_id;
      exit;
    exception when unique_violation then
      v_workshop_id := null;
    end;
  end loop;
  if v_workshop_id is null then raise exception 'Could not make a room code. Try again.'; end if;

  insert into public.participants (workshop_id, user_id, display_name, is_host)
  values (v_workshop_id, auth.uid(), trim(p_display_name), true)
  returning id into v_participant_id;

  insert into public.ideas (workshop_id, owner_participant_id, body)
  values (v_workshop_id, v_participant_id, trim(p_idea));

  return query select v_workshop_id, v_code, v_participant_id;
end;
$$;

create or replace function public.join_change_cards_workshop(p_code text, p_display_name text)
returns table (workshop_id uuid, code text, participant_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workshop public.workshops%rowtype;
  v_participant_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before joining a workshop.'; end if;
  if char_length(trim(p_display_name)) not between 1 and 40 then raise exception 'Enter a name under 40 characters.'; end if;

  select w.* into v_workshop
  from public.workshops w
  where w.code = upper(trim(p_code));
  if not found then raise exception 'That workshop link is not valid.'; end if;

  select p.id into v_participant_id
  from public.participants p
  where p.workshop_id = v_workshop.id and p.user_id = auth.uid();

  if v_participant_id is null then
    if v_workshop.status <> 'lobby' then raise exception 'This workshop has already started.'; end if;
    insert into public.participants (workshop_id, user_id, display_name)
    values (v_workshop.id, auth.uid(), trim(p_display_name))
    returning id into v_participant_id;
  else
    update public.participants set display_name = trim(p_display_name) where id = v_participant_id;
  end if;

  return query select v_workshop.id, v_workshop.code, v_participant_id;
end;
$$;

create or replace function public.save_change_cards_idea(p_workshop_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant_id uuid;
begin
  if char_length(trim(p_body)) not between 1 and 1000 then raise exception 'Enter an idea under 1,000 characters.'; end if;
  if not exists (select 1 from public.workshops where id = p_workshop_id and status = 'lobby') then
    raise exception 'Ideas are locked because this workshop has started.';
  end if;
  select id into v_participant_id from public.participants
  where workshop_id = p_workshop_id and user_id = auth.uid();
  if v_participant_id is null then raise exception 'You are not part of this workshop.'; end if;

  insert into public.ideas (workshop_id, owner_participant_id, body)
  values (p_workshop_id, v_participant_id, trim(p_body))
  on conflict (owner_participant_id) do update
  set body = excluded.body, updated_at = now();
end;
$$;

create or replace function public.start_change_cards_round(p_workshop_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workshop public.workshops%rowtype;
  v_count integer;
  v_idea_count integer;
  v_round integer;
  v_shift integer;
begin
  select * into v_workshop from public.workshops where id = p_workshop_id for update;
  if not found or v_workshop.host_user_id <> auth.uid() then raise exception 'Only the host can start a round.'; end if;
  if v_workshop.status = 'ended' then raise exception 'This workshop has ended.'; end if;
  if v_workshop.round_number >= v_workshop.target_rounds then raise exception 'All four rounds are complete.'; end if;

  select count(*) into v_count from public.participants where workshop_id = p_workshop_id;
  select count(*) into v_idea_count from public.ideas where workshop_id = p_workshop_id;
  if v_count < 2 then raise exception 'Invite at least one other person before starting.'; end if;
  if v_count <> v_idea_count then raise exception 'Wait until everyone has added an idea.'; end if;

  v_round := v_workshop.round_number + 1;
  v_shift := 1 + mod(v_round - 1, v_count - 1);

  with people as (
    select p.id as participant_id,
      row_number() over (order by p.joined_at, p.id) as rn
    from public.participants p where p.workshop_id = p_workshop_id
  ), idea_pool as (
    select i.id as idea_id, i.body,
      row_number() over (order by owner.joined_at, owner.id) as rn
    from public.ideas i
    join public.participants owner on owner.id = i.owner_participant_id
    where i.workshop_id = p_workshop_id
  ), pairings as (
    select people.participant_id, people.rn, idea_pool.idea_id, idea_pool.body, idea_pool.rn as idea_rn
    from people
    join idea_pool on idea_pool.rn = 1 + mod((people.rn - 1 + v_shift)::integer, v_count)
  )
  insert into public.assignments (
    workshop_id, round_number, idea_id, participant_id, card_id, source_text
  )
  select
    p_workshop_id,
    v_round,
    pairings.idea_id,
    pairings.participant_id,
    1 + ((v_round - 1) * 4) + mod((pairings.idea_rn - 1)::integer, 4),
    pairings.body
  from pairings;

  update public.workshops
  set status = 'round',
      round_number = v_round,
      submitted_count = 0,
      round_started_at = now(),
      round_ends_at = now() + interval '60 seconds'
  where id = p_workshop_id;
  return v_round;
end;
$$;

create or replace function public.submit_change_cards_transformation(p_assignment_id uuid, p_response text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.assignments%rowtype;
  v_workshop public.workshops%rowtype;
  v_was_submitted boolean;
  v_complete boolean;
begin
  if char_length(trim(p_response)) not between 1 and 1000 then raise exception 'Write a response under 1,000 characters.'; end if;

  select a.* into v_assignment
  from public.assignments a
  join public.participants p on p.id = a.participant_id
  where a.id = p_assignment_id and p.user_id = auth.uid();
  if not found then raise exception 'That card is not assigned to you.'; end if;

  select * into v_workshop from public.workshops where id = v_assignment.workshop_id for update;
  if (
    v_workshop.status not in ('round', 'between')
    and not (v_workshop.status = 'ended' and v_workshop.ended_at > now() - interval '10 seconds')
  ) or v_assignment.round_number <> v_workshop.round_number then
    raise exception 'That round is already closed.';
  end if;

  v_was_submitted := v_assignment.response is not null;
  update public.assignments
  set response = trim(p_response), submitted_at = now()
  where id = p_assignment_id;

  if not v_was_submitted then
    update public.workshops
    set submitted_count = submitted_count + 1
    where id = v_assignment.workshop_id;
  end if;

  select submitted_count >= (
    select count(*) from public.participants where workshop_id = v_assignment.workshop_id
  ) into v_complete
  from public.workshops where id = v_assignment.workshop_id;

  if v_complete then
    update public.workshops
    set status = case when round_number >= target_rounds then 'ended' else 'between' end,
        ended_at = case when round_number >= target_rounds then now() else ended_at end
    where id = v_assignment.workshop_id and status = 'round';
  end if;
  return v_complete;
end;
$$;

create or replace function public.close_change_cards_round(p_workshop_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workshop public.workshops%rowtype;
  v_is_host boolean;
  v_count integer;
begin
  select * into v_workshop from public.workshops where id = p_workshop_id for update;
  if not found or not public.is_change_cards_member(p_workshop_id) then raise exception 'You are not part of this workshop.'; end if;
  if v_workshop.status <> 'round' then return v_workshop.status; end if;

  v_is_host := v_workshop.host_user_id = auth.uid();
  select count(*) into v_count from public.participants where workshop_id = p_workshop_id;

  if not v_is_host and v_workshop.submitted_count < v_count and now() < v_workshop.round_ends_at then
    raise exception 'This round is still running.';
  end if;
  update public.workshops
  set status = case when round_number >= target_rounds then 'ended' else 'between' end,
      ended_at = case when round_number >= target_rounds then now() else ended_at end
  where id = p_workshop_id;
  return case when v_workshop.round_number >= v_workshop.target_rounds then 'ended' else 'between' end;
end;
$$;

create or replace function public.end_change_cards_workshop(p_workshop_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.workshops
  set status = 'ended', ended_at = now()
  where id = p_workshop_id and host_user_id = auth.uid();
  if not found then raise exception 'Only the host can end ideation.'; end if;
end;
$$;

revoke all on public.workshops, public.participants, public.ideas, public.assignments from anon;
grant select on public.workshops, public.participants, public.ideas, public.assignments to authenticated;
revoke all on function public.is_change_cards_member(uuid) from public, anon;
revoke all on function public.can_read_change_cards_assignment(uuid, uuid, uuid) from public, anon;
revoke all on function public.create_change_cards_workshop(text, text) from public, anon;
revoke all on function public.join_change_cards_workshop(text, text) from public, anon;
revoke all on function public.save_change_cards_idea(uuid, text) from public, anon;
revoke all on function public.start_change_cards_round(uuid) from public, anon;
revoke all on function public.submit_change_cards_transformation(uuid, text) from public, anon;
revoke all on function public.close_change_cards_round(uuid) from public, anon;
revoke all on function public.end_change_cards_workshop(uuid) from public, anon;
grant execute on function public.is_change_cards_member(uuid) to authenticated;
grant execute on function public.can_read_change_cards_assignment(uuid, uuid, uuid) to authenticated;
grant execute on function public.create_change_cards_workshop(text, text) to authenticated;
grant execute on function public.join_change_cards_workshop(text, text) to authenticated;
grant execute on function public.save_change_cards_idea(uuid, text) to authenticated;
grant execute on function public.start_change_cards_round(uuid) to authenticated;
grant execute on function public.submit_change_cards_transformation(uuid, text) to authenticated;
grant execute on function public.close_change_cards_round(uuid) to authenticated;
grant execute on function public.end_change_cards_workshop(uuid) to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['workshops', 'participants', 'ideas', 'assignments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
