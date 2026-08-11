-- P12 private room-code 1v1 prototype.
-- Clients create/join through narrow RPCs, submit input to the JWT-protected pvp-authority Edge
-- Function, and receive read-only authoritative snapshots through a private Realtime topic.
-- Matchmaking, Rank/MMR, rewards, public lobby, and direct client result writes are P13 non-scope.

create table if not exists public.pvp_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_profile_id uuid not null references public.profiles(id) on delete cascade,
  guest_profile_id uuid references public.profiles(id) on delete cascade,
  host_hero_id text not null,
  guest_hero_id text,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'reconnecting', 'completed')),
  state_version bigint not null default 0 check (state_version >= 0),
  authoritative_state jsonb,
  state_hash text,
  winner_profile_id uuid references public.profiles(id) on delete set null,
  loser_profile_id uuid references public.profiles(id) on delete set null,
  result_reason text check (
    result_reason is null
    or result_reason in ('knockout', 'forfeit', 'double-forfeit', 'simultaneous-knockout')
  ),
  host_last_seen_at timestamptz not null default now(),
  guest_last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  check (guest_profile_id is null or guest_profile_id <> host_profile_id),
  check (winner_profile_id is null or winner_profile_id in (host_profile_id, guest_profile_id)),
  check (loser_profile_id is null or loser_profile_id in (host_profile_id, guest_profile_id)),
  check (winner_profile_id is null or loser_profile_id is null or winner_profile_id <> loser_profile_id),
  check (
    (status = 'completed' and result_reason is not null and finished_at is not null)
    or (status <> 'completed' and winner_profile_id is null and loser_profile_id is null
      and result_reason is null and finished_at is null)
  ),
  check (
    (status = 'waiting' and guest_profile_id is null)
    or (status <> 'waiting' and guest_profile_id is not null)
  )
);

create index if not exists pvp_rooms_participant_status_idx
  on public.pvp_rooms (host_profile_id, guest_profile_id, status);

-- Completed results survive profile cleanup even though ephemeral room rows intentionally cascade.
-- P13 may consume this server-only audit record; P12 does not write rank/MMR/rewards.
create table if not exists public.pvp_match_results (
  match_id uuid primary key,
  host_profile_id uuid not null,
  guest_profile_id uuid not null,
  winner_profile_id uuid,
  loser_profile_id uuid,
  result_reason text not null check (
    result_reason in ('knockout', 'forfeit', 'double-forfeit', 'simultaneous-knockout')
  ),
  final_state_hash text not null,
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  finished_at timestamptz not null,
  check (winner_profile_id is null or winner_profile_id in (host_profile_id, guest_profile_id)),
  check (loser_profile_id is null or loser_profile_id in (host_profile_id, guest_profile_id))
);

alter table public.pvp_rooms enable row level security;
alter table public.pvp_match_results enable row level security;
revoke all on public.pvp_rooms from public, anon, authenticated;
revoke all on public.pvp_match_results from public, anon, authenticated;
grant select on public.pvp_rooms to authenticated;
grant select on public.pvp_match_results to authenticated;

drop policy if exists "pvp participants read own room" on public.pvp_rooms;
create policy "pvp participants read own room"
  on public.pvp_rooms
  for select
  to authenticated
  using (
    (select auth.uid()) = host_profile_id
    or (select auth.uid()) = guest_profile_id
  );

drop policy if exists "pvp participants read own completed result" on public.pvp_match_results;
create policy "pvp participants read own completed result"
  on public.pvp_match_results
  for select
  to authenticated
  using (
    (select auth.uid()) = host_profile_id
    or (select auth.uid()) = guest_profile_id
  );

create or replace function public.create_private_pvp_room(p_hero_id text)
returns setof public.pvp_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_room public.pvp_rooms%rowtype;
  v_attempt integer;
  v_index integer;
begin
  if v_profile_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนสร้างห้อง PvP';
  end if;
  if p_hero_id is null or length(btrim(p_hero_id)) = 0 then
    raise exception 'กรุณาเลือกฮีโร่';
  end if;
  if not exists (
    select 1 from public.owned_characters
    where profile_id = v_profile_id and character_id = p_hero_id
  ) then
    raise exception 'ไม่พบฮีโร่ที่ครอบครอง';
  end if;
  perform public.check_and_log_rpc_rate_limit('create_private_pvp_room', 5, 60);

  -- One open room per host prevents room-code farming and stale parallel sessions.
  delete from public.pvp_rooms
  where host_profile_id = v_profile_id
    and status = 'waiting';

  for v_attempt in 1..20 loop
    v_code := '';
    for v_index in 1..6 loop
      v_code := v_code || substr(
        v_alphabet,
        1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(v_alphabet)),
        1
      );
    end loop;
    begin
      insert into public.pvp_rooms (room_code, host_profile_id, host_hero_id)
      values (v_code, v_profile_id, p_hero_id)
      returning * into v_room;
      return next v_room;
      return;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'สร้างรหัสห้องไม่สำเร็จ กรุณาลองใหม่';
end;
$$;

create or replace function public.join_private_pvp_room(p_room_code text, p_hero_id text)
returns setof public.pvp_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_room public.pvp_rooms%rowtype;
begin
  if v_profile_id is null then
    raise exception 'ต้องเข้าสู่ระบบก่อนเข้าห้อง PvP';
  end if;
  if p_hero_id is null or length(btrim(p_hero_id)) = 0 then
    raise exception 'กรุณาเลือกฮีโร่';
  end if;
  if not exists (
    select 1 from public.owned_characters
    where profile_id = v_profile_id and character_id = p_hero_id
  ) then
    raise exception 'ไม่พบฮีโร่ที่ครอบครอง';
  end if;
  perform public.check_and_log_rpc_rate_limit('join_private_pvp_room', 12, 60);

  select * into v_room
  from public.pvp_rooms
  where room_code = upper(btrim(p_room_code))
  for update;

  if not found
    or v_room.expires_at <= now()
    or v_room.host_profile_id = v_profile_id
    or v_room.status <> 'waiting'
    or v_room.guest_profile_id is not null then
    raise exception 'ไม่พบห้องหรือเข้าร่วมไม่ได้';
  end if;

  update public.pvp_rooms
  set guest_profile_id = v_profile_id,
      guest_hero_id = p_hero_id,
      status = 'active',
      guest_last_seen_at = now(),
      updated_at = now()
  where id = v_room.id
  returning * into v_room;

  return next v_room;
end;
$$;

-- Optimistic compare-and-swap: only the service-role Edge Function may commit combat state/result.
create or replace function public.commit_pvp_authority_state(
  p_room_id uuid,
  p_expected_version bigint,
  p_authoritative_state jsonb,
  p_state_hash text,
  p_status text,
  p_winner_profile_id uuid default null,
  p_loser_profile_id uuid default null,
  p_result_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_version bigint;
  v_room public.pvp_rooms%rowtype;
begin
  if p_status not in ('active', 'reconnecting', 'completed') then
    raise exception 'สถานะ PvP ไม่ถูกต้อง';
  end if;
  if p_authoritative_state is null or p_state_hash is null or length(p_state_hash) = 0 then
    raise exception 'authoritative state ไม่ครบ';
  end if;
  if p_status = 'completed' and p_result_reason is null then
    raise exception 'ผลการแข่งขันไม่ครบ';
  end if;
  if p_status <> 'completed'
    and (p_winner_profile_id is not null or p_loser_profile_id is not null
      or p_result_reason is not null) then
    raise exception 'ห้ามบันทึกผลก่อนการแข่งขันจบ';
  end if;
  if p_status = 'completed' and p_result_reason in ('simultaneous-knockout', 'double-forfeit')
    and (p_winner_profile_id is not null or p_loser_profile_id is not null) then
    raise exception 'ผลเสมอหรือออกทั้งคู่ต้องไม่มีผู้ชนะหรือผู้แพ้';
  end if;
  if p_status = 'completed' and p_result_reason in ('knockout', 'forfeit')
    and (p_winner_profile_id is null or p_loser_profile_id is null
      or p_winner_profile_id = p_loser_profile_id) then
    raise exception 'ผลแพ้ชนะไม่ครบ';
  end if;
  if exists (
    select 1 from public.pvp_rooms
    where id = p_room_id
      and (
        (p_winner_profile_id is not null
          and p_winner_profile_id not in (host_profile_id, guest_profile_id))
        or (p_loser_profile_id is not null
          and p_loser_profile_id not in (host_profile_id, guest_profile_id))
      )
  ) then
    raise exception 'ผู้ชนะหรือผู้แพ้ไม่ใช่ผู้เล่นในห้อง';
  end if;

  update public.pvp_rooms
  set authoritative_state = p_authoritative_state,
      state_hash = p_state_hash,
      state_version = state_version + 1,
      status = p_status,
      winner_profile_id = p_winner_profile_id,
      loser_profile_id = p_loser_profile_id,
      result_reason = p_result_reason,
      host_last_seen_at = to_timestamp(
        ((p_authoritative_state #>> '{participants,0,lastSeenAtMs}')::double precision) / 1000
      ),
      guest_last_seen_at = to_timestamp(
        ((p_authoritative_state #>> '{participants,1,lastSeenAtMs}')::double precision) / 1000
      ),
      finished_at = case
        when p_status = 'completed'
          then (p_authoritative_state ->> 'finishedAt')::timestamptz
        else finished_at
      end,
      updated_at = now()
  where id = p_room_id
    and state_version = p_expected_version
    and status <> 'completed'
  returning * into v_room;

  if v_room.id is null then
    raise exception 'PVP_STATE_VERSION_CONFLICT';
  end if;
  v_next_version := v_room.state_version;

  if p_status = 'completed' then
    insert into public.pvp_match_results (
      match_id,
      host_profile_id,
      guest_profile_id,
      winner_profile_id,
      loser_profile_id,
      result_reason,
      final_state_hash,
      elapsed_ms,
      finished_at
    ) values (
      v_room.id,
      v_room.host_profile_id,
      v_room.guest_profile_id,
      p_winner_profile_id,
      p_loser_profile_id,
      p_result_reason,
      p_state_hash,
      (p_authoritative_state ->> 'elapsedMs')::bigint,
      v_room.finished_at
    ) on conflict (match_id) do nothing;
  end if;
  return v_next_version;
end;
$$;

revoke all on function public.create_private_pvp_room(text) from public, anon, authenticated;
revoke all on function public.join_private_pvp_room(text, text) from public, anon, authenticated;
revoke all on function public.commit_pvp_authority_state(uuid, bigint, jsonb, text, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_private_pvp_room(text) to authenticated;
grant execute on function public.join_private_pvp_room(text, text) to authenticated;
grant execute on function public.commit_pvp_authority_state(uuid, bigint, jsonb, text, text, uuid, uuid, text)
  to service_role;

-- Private Realtime is receive-only for players. Input never travels as a client-authored broadcast.
-- `realtime.messages` is platform-owned: RLS is already on and enabling it here fails on ownership,
-- which would abort this whole migration file. Policies are the only DDL we may add there.
drop policy if exists "pvp participants receive authority broadcast" on realtime.messages;
create policy "pvp participants receive authority broadcast"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'pvp:%'
    and exists (
      select 1 from public.pvp_rooms as room
      where room.id::text = substring((select realtime.topic()) from 5)
        and ((select auth.uid()) = room.host_profile_id or (select auth.uid()) = room.guest_profile_id)
    )
  );

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.broadcast_pvp_authority_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state_version = old.state_version then
    return new;
  end if;
  perform realtime.send(
    jsonb_build_object(
      'roomId', new.id,
      'stateVersion', new.state_version,
      'stateHash', new.state_hash,
      'status', new.status,
      'authoritativeState', new.authoritative_state,
      'winnerPlayerId', new.winner_profile_id,
      'loserPlayerId', new.loser_profile_id,
      'resultReason', new.result_reason
    ),
    'authoritative_state',
    'pvp:' || new.id::text,
    true
  );
  return new;
end;
$$;

drop trigger if exists pvp_rooms_broadcast_authority on public.pvp_rooms;
create trigger pvp_rooms_broadcast_authority
after update of authoritative_state, state_version, status on public.pvp_rooms
for each row execute function private.broadcast_pvp_authority_state();

revoke all on function private.broadcast_pvp_authority_state() from public, anon, authenticated;

-- Remove abandoned waiting/active rooms after their bounded lifetime. Completed results live in
-- pvp_match_results, so this ephemeral cleanup cannot erase the authority audit record.
create or replace function private.reap_expired_pvp_rooms()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.pvp_rooms
  where expires_at <= now()
    and status <> 'completed';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function private.reap_expired_pvp_rooms() from public, anon, authenticated;

select cron.schedule(
  'reap-expired-private-pvp-rooms',
  '* * * * *',
  $$select private.reap_expired_pvp_rooms();$$
);
