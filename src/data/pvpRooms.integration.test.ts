import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HOST = '11111111-1111-1111-1111-111111111111'
const GUEST = '22222222-2222-2222-2222-222222222222'
const THIRD = '33333333-3333-3333-3333-333333333333'
const MIGRATION = '20260809064000_p12_private_pvp_rooms.sql'

async function applyMigration(db: PGlite, filename: string): Promise<void> {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations', filename), 'utf8')
  await db.exec(sql)
}

async function setAuthenticatedUser(db: PGlite, userId: string): Promise<void> {
  await db.exec(`
    create or replace function auth.uid() returns uuid
    language sql stable as $$ select '${userId}'::uuid $$;
  `)
}

describe('P12 private PvP room authority migration (isolated Postgres via PGLite)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users (id) values ('${HOST}'), ('${GUEST}'), ('${THIRD}');

      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role; exception when duplicate_object then null; end $$;

      create schema extensions;
      create schema cron;
      create schema realtime;
      grant usage on schema realtime to authenticated;
      create table realtime.messages (
        topic text not null,
        extension text not null,
        payload jsonb,
        event text,
        private boolean default false
      );
      alter table realtime.messages enable row level security;
      grant select, insert on realtime.messages to authenticated;
      create or replace function realtime.topic() returns text
      language sql stable as $$ select current_setting('realtime.topic', true) $$;
      create or replace function realtime.send(jsonb, text, text, boolean) returns void
      language sql as $$ select null::void $$;
      create or replace function extensions.gen_random_bytes(integer) returns bytea
      language sql volatile as $$
        select decode(substr(md5(random()::text), 1, $1 * 2), 'hex')
      $$;
      create or replace function cron.schedule(job_name text, schedule text, command text)
      returns bigint language sql as $$ select 1::bigint $$;
    `)
    await setAuthenticatedUser(db, HOST)
    await applyMigration(db, '0001_init.sql')
    await db.exec(`
      insert into public.profiles (id, uid, name) values
        ('${HOST}', '1111111111', 'Host'),
        ('${GUEST}', '2222222222', 'Guest'),
        ('${THIRD}', '3333333333', 'Third');
      insert into public.owned_characters (profile_id, character_id, level, exp, exp_to_next)
      values
        ('${HOST}', 'monkey-king', 1, 0, 100),
        ('${GUEST}', 'monkey-king', 1, 0, 100);
      create or replace function public.check_and_log_rpc_rate_limit(text, int, int)
      returns void language sql security definer set search_path = ''
      as $$ select null::void $$;
    `)
    await applyMigration(db, MIGRATION)
  }, 20_000)

  afterAll(async () => {
    await db.close()
  })

  it('creates and joins a six-character private room through narrow authenticated RPCs', async () => {
    await setAuthenticatedUser(db, HOST)
    const created = await db.query<{
      id: string
      room_code: string
      status: string
      host_profile_id: string
    }>(
      `select id, room_code, status, host_profile_id from public.create_private_pvp_room('monkey-king')`,
    )
    const room = created.rows[0]

    expect(room?.room_code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(room?.status).toBe('waiting')
    expect(room?.host_profile_id).toBe(HOST)

    await setAuthenticatedUser(db, GUEST)
    const joined = await db.query<{ status: string; guest_profile_id: string }>(
      `select status, guest_profile_id
       from public.join_private_pvp_room($1, 'monkey-king')`,
      [room!.room_code.toLowerCase()],
    )
    expect(joined.rows[0]).toEqual({ status: 'active', guest_profile_id: GUEST })
  })

  it('enables RLS, removes direct writes, and reserves state/result commits for service_role', async () => {
    const security = await db.query<{
      rls: boolean
      authenticated_insert: boolean
      authenticated_update: boolean
      authenticated_create: boolean
      authenticated_join: boolean
      authenticated_commit: boolean
      anon_commit: boolean
      service_commit: boolean
      realtime_insert_policy_count: string
      realtime_select_policy_count: string
      realtime_rls: boolean
    }>(`
      select
        (select relrowsecurity from pg_class where oid = 'public.pvp_rooms'::regclass) as rls,
        has_table_privilege('authenticated', 'public.pvp_rooms', 'INSERT') as authenticated_insert,
        has_table_privilege('authenticated', 'public.pvp_rooms', 'UPDATE') as authenticated_update,
        has_function_privilege('authenticated', 'public.create_private_pvp_room(text)', 'EXECUTE')
          as authenticated_create,
        has_function_privilege('authenticated', 'public.join_private_pvp_room(text,text)', 'EXECUTE')
          as authenticated_join,
        has_function_privilege(
          'authenticated',
          'public.commit_pvp_authority_state(uuid,bigint,jsonb,text,text,uuid,uuid,text)',
          'EXECUTE'
        ) as authenticated_commit,
        has_function_privilege(
          'anon',
          'public.commit_pvp_authority_state(uuid,bigint,jsonb,text,text,uuid,uuid,text)',
          'EXECUTE'
        ) as anon_commit,
        has_function_privilege(
          'service_role',
          'public.commit_pvp_authority_state(uuid,bigint,jsonb,text,text,uuid,uuid,text)',
          'EXECUTE'
        ) as service_commit,
        (select count(*)::text from pg_policies
          where schemaname = 'realtime' and tablename = 'messages' and cmd = 'INSERT')
          as realtime_insert_policy_count,
        (select count(*)::text from pg_policies
          where schemaname = 'realtime' and tablename = 'messages' and cmd = 'SELECT')
          as realtime_select_policy_count,
        (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass)
          as realtime_rls
    `)
    expect(security.rows[0]).toEqual({
      rls: true,
      authenticated_insert: false,
      authenticated_update: false,
      authenticated_create: true,
      authenticated_join: true,
      authenticated_commit: false,
      anon_commit: false,
      service_commit: true,
      realtime_insert_policy_count: '0',
      realtime_select_policy_count: '1',
      realtime_rls: true,
    })
  })

  it('behaviourally denies room reads/writes and authority broadcasts to a third player', async () => {
    const room = await db.query<{ id: string }>(
      `select id from public.pvp_rooms where host_profile_id = $1 order by created_at desc limit 1`,
      [HOST],
    )
    const roomId = room.rows[0]!.id
    await setAuthenticatedUser(db, THIRD)
    await db.exec(
      `select set_config('realtime.topic', 'pvp:${roomId}', false); set role authenticated;`,
    )
    try {
      const hidden = await db.query(`select id from public.pvp_rooms where id = $1`, [roomId])
      expect(hidden.rows).toHaveLength(0)
      await expect(
        db.query(`update public.pvp_rooms set status = 'completed' where id = $1`, [roomId]),
      ).rejects.toThrow()
      await expect(
        db.query(
          `insert into realtime.messages (topic, extension, event, private)
           values ($1, 'broadcast', 'authoritative_state', true)`,
          [`pvp:${roomId}`],
        ),
      ).rejects.toThrow(/row-level security/i)
    } finally {
      await db.exec('reset role')
    }
  })

  it('delivers an authority broadcast to room participants only', async () => {
    const room = await db.query<{ id: string }>(
      `select id from public.pvp_rooms where host_profile_id = $1 order by created_at desc limit 1`,
      [HOST],
    )
    const topic = `pvp:${room.rows[0]!.id}`
    await db.query(
      `insert into realtime.messages (topic, extension, event, private)
       values ($1, 'broadcast', 'authoritative_state', true)`,
      [topic],
    )

    const broadcastsVisibleTo = async (userId: string): Promise<number> => {
      await setAuthenticatedUser(db, userId)
      await db.exec(
        `select set_config('realtime.topic', '${topic}', false); set role authenticated;`,
      )
      try {
        const seen = await db.query(`select topic from realtime.messages where topic = $1`, [topic])
        return seen.rows.length
      } finally {
        await db.exec('reset role')
      }
    }

    expect(await broadcastsVisibleTo(GUEST)).toBe(1)
    expect(await broadcastsVisibleTo(THIRD)).toBe(0)
  })

  it('commits authoritative state with compare-and-swap and rejects stale replay', async () => {
    const room = await db.query<{ id: string }>(
      `select id from public.pvp_rooms where host_profile_id = $1 order by created_at desc limit 1`,
      [HOST],
    )
    const roomId = room.rows[0]!.id
    const activeState = JSON.stringify({
      matchId: roomId,
      tick: 1,
      elapsedMs: 50,
      stateHash: 'abc123',
      finishedAt: null,
      participants: [{ lastSeenAtMs: 1_000 }, { lastSeenAtMs: 1_050 }],
    })

    const committed = await db.query<{ version: string }>(
      `select public.commit_pvp_authority_state(
        $1, 0, $2::jsonb, 'abc123', 'active', null, null, null
      )::text as version`,
      [roomId, activeState],
    )
    expect(committed.rows[0]?.version).toBe('1')

    await expect(
      db.query(
        `select public.commit_pvp_authority_state(
          $1, 0, $2::jsonb, 'stale', 'active', null, null, null
        )`,
        [roomId, activeState],
      ),
    ).rejects.toThrow('PVP_STATE_VERSION_CONFLICT')

    await expect(
      db.query(
        `select public.commit_pvp_authority_state(
          $1, 1, $2::jsonb, 'forged', 'completed',
          '33333333-3333-3333-3333-333333333333', $3, 'forfeit'
        )`,
        [roomId, activeState, GUEST],
      ),
    ).rejects.toThrow('ผู้ชนะหรือผู้แพ้ไม่ใช่ผู้เล่นในห้อง')

    const completedState = JSON.stringify({
      matchId: roomId,
      tick: 2,
      elapsedMs: 100,
      stateHash: 'double-forfeit',
      finishedAt: '2026-08-09T07:30:00.000Z',
      participants: [{ lastSeenAtMs: 1_000 }, { lastSeenAtMs: 1_050 }],
    })
    const abandoned = await db.query<{ version: string }>(
      `select public.commit_pvp_authority_state(
        $1, 1, $2::jsonb, 'double-forfeit', 'completed', null, null, 'double-forfeit'
      )::text as version`,
      [roomId, completedState],
    )
    expect(abandoned.rows[0]?.version).toBe('2')

    const persisted = await db.query<{ final_state_hash: string; elapsed_ms: string }>(
      `select final_state_hash, elapsed_ms::text from public.pvp_match_results where match_id = $1`,
      [roomId],
    )
    expect(persisted.rows[0]).toEqual({ final_state_hash: 'double-forfeit', elapsed_ms: '100' })
  })

  it('retains the completed audit result after profile cleanup cascades the room', async () => {
    const result = await db.query<{ match_id: string }>(
      `select match_id from public.pvp_match_results order by finished_at desc limit 1`,
    )
    const matchId = result.rows[0]!.match_id
    await db.query(`delete from public.profiles where id = $1`, [HOST])
    const room = await db.query(`select id from public.pvp_rooms where id = $1`, [matchId])
    const audit = await db.query(
      `select match_id from public.pvp_match_results where match_id = $1`,
      [matchId],
    )
    expect(room.rows).toHaveLength(0)
    expect(audit.rows).toHaveLength(1)
  })

  it('reaps expired unfinished rooms without touching completed audit results', async () => {
    await db.exec(`
      insert into public.profiles (id, uid, name)
      values ('${HOST}', '1111111111', 'Host restored');
      insert into public.owned_characters (profile_id, character_id, level, exp, exp_to_next)
      values ('${HOST}', 'monkey-king', 1, 0, 100);
    `)
    await setAuthenticatedUser(db, HOST)
    const created = await db.query<{ id: string }>(
      `select id from public.create_private_pvp_room('monkey-king')`,
    )
    const roomId = created.rows[0]!.id
    await db.query(
      `update public.pvp_rooms set expires_at = now() - interval '1 second' where id = $1`,
      [roomId],
    )

    const reaped = await db.query<{ count: string }>(
      `select private.reap_expired_pvp_rooms()::text as count`,
    )
    const room = await db.query(`select id from public.pvp_rooms where id = $1`, [roomId])
    const audit = await db.query(`select match_id from public.pvp_match_results`)

    expect(reaped.rows[0]?.count).toBe('1')
    expect(room.rows).toHaveLength(0)
    expect(audit.rows).toHaveLength(1)
  })

  it('pins every privileged function to an empty search_path', async () => {
    const rows = await db.query<{ proname: string; config: string[] | null }>(`
      select proname, proconfig as config from pg_proc
      where oid in (
        'public.create_private_pvp_room(text)'::regprocedure,
        'public.join_private_pvp_room(text,text)'::regprocedure,
        'public.commit_pvp_authority_state(uuid,bigint,jsonb,text,text,uuid,uuid,text)'::regprocedure,
        'private.broadcast_pvp_authority_state()'::regprocedure,
        'private.reap_expired_pvp_rooms()'::regprocedure
      )
    `)
    expect(rows.rows).toHaveLength(5)
    for (const row of rows.rows) expect(row.config).toContain('search_path=""')
  })
})
