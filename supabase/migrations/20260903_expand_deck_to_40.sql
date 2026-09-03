-- Expand the Change Cards deck while preserving the original card IDs.
-- Each co-op round still uses one thinking category, but now rotates through
-- all ten cards in that category across workshops and participants.
alter table public.assignments
  drop constraint if exists assignments_card_id_check;

alter table public.assignments
  add constraint assignments_card_id_check check (card_id between 1 and 40);

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
  v_card_offset integer;
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
  v_card_offset := mod(abs(hashtextextended(p_workshop_id::text, v_round)::numeric), 10)::integer;

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
    case v_round
      when 1 then (array[1, 2, 3, 4, 17, 18, 19, 20, 21, 22])[1 + mod((pairings.idea_rn - 1 + v_card_offset)::integer, 10)]
      when 2 then (array[5, 6, 7, 8, 23, 24, 25, 26, 27, 28])[1 + mod((pairings.idea_rn - 1 + v_card_offset)::integer, 10)]
      when 3 then (array[9, 10, 11, 12, 29, 30, 31, 32, 33, 34])[1 + mod((pairings.idea_rn - 1 + v_card_offset)::integer, 10)]
      else (array[13, 14, 15, 16, 35, 36, 37, 38, 39, 40])[1 + mod((pairings.idea_rn - 1 + v_card_offset)::integer, 10)]
    end,
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
