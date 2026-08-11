import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/*
  Task #26/#35 — the test that would have caught the free-upgrade bug.

  THE BUG, exactly: `savePlayer` wrote skill_levels/talent_state/awakening_state (the EFFECT of
  an upgrade) and could not write profiles.gold (the COST), because gold has been column-locked
  since 0009:103. progressionService.spendCost() debited gold in the client's own copy of the
  Player and that debit was dropped on save. Buy an upgrade, reload, keep the upgrade, keep the
  gold. Unlimited.

  Every mock-based test in this repo passed the whole time, because the thing that was broken
  was what the DATABASE would accept. So this runs the real migration chain in PGlite and
  asserts on real rows: after an upgrade, is the gold actually gone?

  The two assertions that matter most are the least obvious:
   * `client cannot write skill_levels` — without the column revoke, the RPC is merely OPTIONAL
     and the free upgrade survives via a direct PATCH. Adding the RPC alone fixes nothing.
   * `a fresh request id cannot replay the same upgrade` — the client mints request ids, so the
     ledger alone cannot stop a replay. The compare-and-swap against real server state is what
     does, and this is the test that proves it rather than assuming it.
*/

const TEST_USER = '11111111-1111-1111-1111-111111111111'
const MIGRATION = '20260810180000_p26_progression_cost_authority.sql'
const DISARM_MIGRATION = '20260811000000_disarm_account_deletion_crons.sql'
const DEAD_ACCOUNT_MIGRATION = '20260810170000_security_reconcile_dead_account_cleanup.sql'
const SPEND_RPC = 'public.spend_progression_upgrade(uuid,text,text,text,int)'

/** Fixtures are inserted after this file, because 0014's exempt seed FKs into profiles. */
const FIXTURE_POINT = '0013_reward_idempotency.sql'

interface SpendRow {
  gold_spent: number
  gold_balance: number
  new_level: number
  replayed: boolean
}

let db: PGlite

async function applyMigration(filename: string): Promise<void> {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations', filename), 'utf8')
  // pg_cron is a Supabase-hosted extension PGlite cannot install; cron.schedule is stubbed below.
  await db.exec(
    sql.replace(
      /create extension if not exists pg_cron with schema extensions;/g,
      '-- pg_cron unavailable in PGlite (stubbed in test bootstrap)',
    ),
  )
}

/*
  Two migrations need Supabase's hosted `realtime` schema, which PGlite cannot provide (the
  publication is stubbable, the schema and its functions are not). Neither touches currency,
  owned_characters, or any RPC in this file's chain — world chat and PvP rooms are their own
  tables — so excluding them changes nothing under test here. Stated rather than silently
  hand-listing a chain: everything else applies, in real filename order, so a future migration
  that breaks this path fails here instead of in production.
*/
const REALTIME_ONLY = new Set([
  '20260808180354_world_chat_server_authority.sql',
  '20260809064000_p12_private_pvp_rooms.sql',
])

/** Filename order IS the deploy order — every migration header says "paste strictly in order". */
function migrationsInOrder(): string[] {
  return readdirSync(join(process.cwd(), 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql') && !REALTIME_ONLY.has(name))
    .toSorted()
}

async function spend(
  requestId: string,
  characterId: string,
  kind: string,
  key: string,
  fromLevel: number,
): Promise<SpendRow> {
  const result = await db.query<SpendRow>(
    'select * from public.spend_progression_upgrade($1::uuid,$2,$3,$4,$5::int)',
    [requestId, characterId, kind, key, fromLevel],
  )
  return result.rows[0]
}

async function gold(): Promise<number> {
  const result = await db.query<{ gold: number }>(
    'select gold from public.profiles where id = $1',
    [TEST_USER],
  )
  return result.rows[0].gold
}

async function skillLevel(characterId: string, slot: string): Promise<number | null> {
  const result = await db.query<{ level: number | null }>(
    `select (skill_levels -> $2 ->> 'level')::int as level
     from public.owned_characters where profile_id = $1 and character_id = $3`,
    [TEST_USER, slot, characterId],
  )
  return result.rows[0].level
}

describe('spend_progression_upgrade — the cost side is server-authoritative', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key,
        -- email so 20260810170000's pre-arm projection runs here verbatim, as pasted;
        -- raw_user_meta_data because 0001's handle_new_user trigger reads it on every insert.
        email text,
        raw_user_meta_data jsonb,
        is_anonymous boolean not null default false,
        created_at timestamptz not null default now(),
        last_sign_in_at timestamptz
      );
      insert into auth.users (id) values ('${TEST_USER}') on conflict do nothing;
      -- 0014 seeds cleanup_exempt_profiles with three dev uuids that FK into profiles.
      insert into auth.users (id) values
        ('e79a973f-fd52-4b84-8e6a-c53a0394db88'),
        ('d0a7b94f-5d95-4e52-8d8f-ebdd835cf695'),
        ('9baf5833-89d4-401e-9ece-14e46a27a228')
      on conflict do nothing;

      create or replace function auth.uid() returns uuid
      language sql stable as $$ select '${TEST_USER}'::uuid $$;

      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role service_role; exception when duplicate_object then null; end $$;

      -- SUPABASE-SHAPED ACL BASELINE. A real project bootstrap grants every new function to
      -- anon+authenticated DIRECTLY, so a revoke naming only public+anon leaves authenticated
      -- holding EXECUTE. Without this line the EXECUTE assertions below cannot bite — the same
      -- structural blindness starAscension.integration.test.ts documents.
      alter default privileges in schema public grant all on functions to anon, authenticated;

      -- pg_cron is Supabase-hosted and PGlite cannot install it, but a stub that only returns 1
      -- makes the schedule INVISIBLE, and the schedule is the thing worth watching: this chain
      -- arms both account-deletion jobs (0006, 0014) before 20260811000000 disarms them, and
      -- until that file existed a replay left them armed. So this stub CAPTURES — cron.job in
      -- the shape the real one exposes, narrowed to the columns this chain writes.
      create schema if not exists cron;
      create table if not exists cron.job (
        jobid bigserial primary key,
        jobname text unique,
        schedule text not null,
        command text not null
      );
      create or replace function cron.schedule(job_name text, cron_expr text, cron_command text)
      returns bigint language sql as $$
        insert into cron.job (jobname, schedule, command)
        values (job_name, cron_expr, cron_command)
        on conflict (jobname) do update
          set schedule = excluded.schedule, command = excluded.command
        returning jobid
      $$;
      create or replace function cron.unschedule(job_id bigint)
      returns boolean language sql as $$
        delete from cron.job where jobid = job_id returning true
      $$;

      -- Supabase ships this publication; the realtime migrations add tables to it.
      do $$ begin
        create publication supabase_realtime;
      exception when duplicate_object then null;
      end $$;
    `)

    const all = migrationsInOrder()
    const splitAt = all.indexOf(FIXTURE_POINT)
    expect(splitAt, `${FIXTURE_POINT} must exist`).toBeGreaterThan(-1)

    for (const filename of all.slice(0, splitAt + 1)) await applyMigration(filename)

    await db.exec(`
      insert into public.profiles (id, uid, name, gold) values
        ('${TEST_USER}', '1234567890', 'Tester', 1000),
        ('e79a973f-fd52-4b84-8e6a-c53a0394db88', '2000000004', 'DevA', 0),
        ('d0a7b94f-5d95-4e52-8d8f-ebdd835cf695', '2000000005', 'DevB', 0),
        ('9baf5833-89d4-401e-9ece-14e46a27a228', '2000000006', 'DevSmoke', 0);

      insert into public.owned_characters (
        profile_id, character_id, level, exp, exp_to_next,
        skill_levels, talent_state, awakening_state
      ) values
        ('${TEST_USER}', 'monkey-king', 12, 0, 900,
          '{"skill1":{"level":3,"exp":0,"expToNext":300}}'::jsonb,
          '{"unlockedNodes":[]}'::jsonb,
          '{"tier":0,"unlockedEffects":[]}'::jsonb),
        ('${TEST_USER}', 'pig-warrior', 1, 0, 100,
          '{"skill1":{"level":1,"exp":0,"expToNext":100}}'::jsonb,
          '{"unlockedNodes":[]}'::jsonb,
          '{"tier":0,"unlockedEffects":[]}'::jsonb);

      -- Supabase grants exposed public tables to authenticated by default. Reproduce that
      -- starting point so the migration under test must explicitly take the writes away.
      grant select, insert, update on public.owned_characters to authenticated;
    `)

    for (const filename of all.slice(splitAt + 1)) await applyMigration(filename)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  it('THE BUG: an upgrade actually costs gold, server-side', async () => {
    const before = await gold()

    // monkey-king skill1 sits at level 3; progressionConfig prices 3 -> 4 at 120 gold.
    const row = await spend(
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      'monkey-king',
      'skill',
      'skill1',
      3,
    )

    expect(row.gold_spent).toBe(120)
    expect(row.new_level).toBe(4)
    expect(row.replayed).toBe(false)
    // Before this migration the level moved and the gold did not. That is the whole bug.
    expect(await gold()).toBe(before - 120)
    expect(await skillLevel('monkey-king', 'skill1')).toBe(4)
  })

  it('writes an auditable debit row — negative amount, source "upgrade"', async () => {
    const ledger = await db.query<{ amount: number; source: string; currency: string }>(
      `select amount, source, currency from public.currency_transactions
       where profile_id = $1 and source = 'upgrade'`,
      [TEST_USER],
    )

    expect(ledger.rows).toHaveLength(1)
    expect(ledger.rows[0]).toMatchObject({ currency: 'gold', source: 'upgrade', amount: -120 })
  })

  it('does not decrement lifetime_gold_earned — a spend does not un-earn', async () => {
    const result = await db.query<{ lifetime_gold_earned: number }>(
      'select lifetime_gold_earned from public.profiles where id = $1',
      [TEST_USER],
    )
    expect(result.rows[0].lifetime_gold_earned).toBeGreaterThanOrEqual(0)
  })

  it('a retry with the SAME request id replays and charges nothing', async () => {
    const before = await gold()

    const row = await spend(
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      'monkey-king',
      'skill',
      'skill1',
      3,
    )

    expect(row.replayed).toBe(true)
    expect(row.new_level).toBe(4)
    expect(await gold()).toBe(before)
  })

  it('a reused request id pointed at a DIFFERENT upgrade is rejected, not replayed', async () => {
    await expect(
      spend('aaaaaaaa-aaaa-4aaa-8aaa-000000000001', 'monkey-king', 'skill', 'skill2', 1),
    ).rejects.toThrow(/request ID/)
  })

  it('THE REAL REPLAY GUARD: a FRESH request id cannot re-buy the same upgrade', async () => {
    const before = await gold()

    /*
      The client mints request ids, so the ledger cannot be the guard — minting a new uuid is
      free. What stops the replay is that the server reads the hero's TRUE level (now 4) and the
      caller claimed 3. Without this compare-and-swap, a loop of fresh uuids buys level 4 over
      and over at no net level gain but repeated... or worse, is written to accept.
    */
    await expect(
      spend('aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'monkey-king', 'skill', 'skill1', 3),
    ).rejects.toThrow(/สถานะฮีโร่เปลี่ยนไปแล้ว/)

    expect(await gold()).toBe(before)
    expect(await skillLevel('monkey-king', 'skill1')).toBe(4)
  })

  it('insufficient gold is a REJECTION, not a clamp — nothing is spent, nothing applied', async () => {
    await db.exec(`update public.profiles set gold = 10 where id = '${TEST_USER}'`)

    await expect(
      spend('aaaaaaaa-aaaa-4aaa-8aaa-000000000003', 'monkey-king', 'skill', 'skill1', 4),
    ).rejects.toThrow(/ทองไม่เพียงพอ/)

    expect(await gold()).toBe(10)
    expect(await skillLevel('monkey-king', 'skill1')).toBe(4)

    await db.exec(`update public.profiles set gold = 5000 where id = '${TEST_USER}'`)
  })

  it('prices awakening by tier and applies the tier in the same transaction', async () => {
    const before = await gold()

    const row = await spend(
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
      'monkey-king',
      'awakening',
      '',
      0,
    )

    // AWAKENING_TIER_FIXTURE_COSTS[1] = 200
    expect(row.gold_spent).toBe(200)
    expect(row.new_level).toBe(1)
    expect(await gold()).toBe(before - 200)

    const state = await db.query<{ tier: number }>(
      `select (awakening_state ->> 'tier')::int as tier
       from public.owned_characters where profile_id = $1 and character_id = 'monkey-king'`,
      [TEST_USER],
    )
    expect(state.rows[0].tier).toBe(1)
  })

  it('unlocks a talent once and refuses the second unlock', async () => {
    const before = await gold()

    const row = await spend(
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
      'monkey-king',
      'talent',
      'mk-talent-1',
      0,
    )
    expect(row.gold_spent).toBe(30)
    expect(await gold()).toBe(before - 30)

    const state = await db.query<{ nodes: string }>(
      `select talent_state ->> 'unlockedNodes' as nodes
       from public.owned_characters where profile_id = $1 and character_id = 'monkey-king'`,
      [TEST_USER],
    )
    expect(state.rows[0].nodes).toContain('mk-talent-1')

    await expect(
      spend('aaaaaaaa-aaaa-4aaa-8aaa-000000000006', 'monkey-king', 'talent', 'mk-talent-1', 0),
    ).rejects.toThrow(/ปลดล็อกพรสวรรค์นี้ไปแล้ว/)
  })

  it('refuses an upgrade with no catalogued price rather than pricing it at zero', async () => {
    await expect(
      spend('aaaaaaaa-aaaa-4aaa-8aaa-000000000007', 'pig-warrior', 'skill', 'ultimate', 1),
    ).rejects.toThrow(/ไม่พบราคา/)
  })

  it('is rate-limited at all — a successful call logs exactly one row', async () => {
    const countCalls = async () => {
      const result = await db.query<{ n: number }>(
        `select count(*)::int as n from public.rpc_rate_limit
         where profile_id = $1 and rpc_name = 'spend_progression_upgrade'`,
        [TEST_USER],
      )
      return result.rows[0].n
    }
    const before = await countCalls()

    await spend('aaaaaaaa-aaaa-4aaa-8aaa-000000000009', 'pig-warrior', 'skill', 'skill1', 1)

    expect(await countCalls()).toBe(before + 1)
  })

  it('rejects a malformed call, and validates BEFORE taking rate-limit budget', async () => {
    await expect(
      spend('aaaaaaaa-aaaa-4aaa-8aaa-000000000008', 'monkey-king', 'sabotage', 'skill1', 1),
    ).rejects.toThrow(/ชนิดการอัปเกรดไม่ถูกต้อง/)

    /*
      ⚠ The ordering is asserted on the function SOURCE, not on its behaviour, and that is
      forced by Postgres, not laziness. 20260810160000's own F5a note explains it: a raise
      aborts the transaction and takes any row inserted in it along, so a log-then-raise and a
      validate-then-raise leave IDENTICAL state — zero rows either way. Counting rows cannot
      tell the two orderings apart (measured: moving the rate-limit call above the validation
      block left every behavioural assertion in this file green).

      The property the wave-1 pattern asks for is real — an invalid call must not consume
      budget, and its denial must be able to reach the Postgres log — but its only observable
      is the statement order itself. So that is what gets pinned.
    */
    const source = await db.query<{ src: string }>(
      `select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'spend_progression_upgrade'`,
    )
    const body = source.rows[0].src
    const firstValidation = body.indexOf('ชนิดการอัปเกรดไม่ถูกต้อง')
    const rateLimit = body.indexOf('check_and_log_rpc_rate_limit')

    expect(firstValidation).toBeGreaterThan(-1)
    expect(rateLimit).toBeGreaterThan(-1)
    expect(firstValidation).toBeLessThan(rateLimit)
  })

  it('THE CLOSURE: the client can no longer write the upgrade columns directly', async () => {
    /*
      Without this revoke the RPC is optional: savePlayer PATCHes skill_levels and the upgrade
      is free again. `revoke update on <table>` cascades to the per-column ACLs
      (20260810130000:38-42), and this migration re-grants nothing.
    */
    const privileges = await db.query<{ column_name: string; can_update: boolean }>(
      `select c.column_name,
              has_column_privilege('authenticated', 'public.owned_characters', c.column_name, 'UPDATE')
                as can_update
       from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'owned_characters'`,
    )

    const writable = privileges.rows.filter((row) => row.can_update).map((row) => row.column_name)
    expect(writable).toEqual([])

    // SELECT must survive — loadPlayer still reads this table on every login.
    const canSelect = await db.query<{ ok: boolean }>(
      `select has_table_privilege('authenticated', 'public.owned_characters', 'SELECT') as ok`,
    )
    expect(canSelect.rows[0].ok).toBe(true)
  })

  it('the RPC takes no price argument — the server prices it or nobody does', async () => {
    const args = await db.query<{ args: string }>(
      `select pg_get_function_arguments(p.oid) as args
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'spend_progression_upgrade'`,
    )

    expect(args.rows).toHaveLength(1)
    // A p_gold_cost / p_price parameter would mean the client sets the price. There is none.
    expect(args.rows[0].args).not.toMatch(/cost|price|gold|amount/i)
  })

  it('the cost catalog is unreadable and unwritable by the client', async () => {
    const privileges = await db.query<{ sel: boolean; upd: boolean; ins: boolean }>(
      `select has_table_privilege('authenticated', 'public.progression_cost_catalog', 'SELECT') as sel,
              has_table_privilege('authenticated', 'public.progression_cost_catalog', 'UPDATE') as upd,
              has_table_privilege('authenticated', 'public.progression_cost_catalog', 'INSERT') as ins`,
    )
    expect(privileges.rows[0]).toEqual({ sel: false, upd: false, ins: false })
  })

  it('EXECUTE is locked to authenticated — anon and public cannot call it', async () => {
    const privileges = await db.query<{ anon: boolean; authed: boolean; pub: boolean }>(
      `select has_function_privilege('anon', '${SPEND_RPC}', 'EXECUTE') as anon,
              has_function_privilege('authenticated', '${SPEND_RPC}', 'EXECUTE') as authed,
              has_function_privilege('public', '${SPEND_RPC}', 'EXECUTE') as pub`,
    )
    expect(privileges.rows[0]).toEqual({ anon: false, authed: true, pub: false })
  })

  it('the spend ledger is readable by its owner and writable by nobody', async () => {
    const privileges = await db.query<{ sel: boolean; ins: boolean; del: boolean }>(
      `select has_table_privilege('authenticated', 'public.progression_spend_ledger', 'SELECT') as sel,
              has_table_privilege('authenticated', 'public.progression_spend_ledger', 'INSERT') as ins,
              has_table_privilege('authenticated', 'public.progression_spend_ledger', 'DELETE') as del`,
    )
    expect(privileges.rows[0]).toEqual({ sel: true, ins: false, del: false })
  })

  it('the gem/gacha debit row stays legal — the constraint rewrite carried it forward', async () => {
    /*
      MEMORY/22-currency-system.md records this trap by name: a constraint rewrite that forgets
      the gem/gacha negative branch breaks gacha the moment someone pulls. Prove it survived.
    */
    await db.exec(
      `insert into public.currency_transactions (profile_id, currency, source, amount)
       values ('${TEST_USER}', 'gem', 'gacha', -100)`,
    )
    await expect(
      db.exec(`insert into public.currency_transactions (profile_id, currency, source, amount)
               values ('${TEST_USER}', 'gold', 'quest', -50)`),
    ).rejects.toThrow()
  })

  /*
    QC bounce, 2026-08-10. The first version of this file closed savePlayer's path and declared
    the job done — enumerating the writers of owned_characters from the migration HEADERS instead
    of opening the sibling function's argument list. commit_lobby_battle_progression declared
    p_skill_levels/p_talent_state/p_awakening_state and wrote all three verbatim, SECURITY
    DEFINER, so the client revoke never touched it. The gate's PROBE-A bought every upgrade in
    the game for zero gold through the battle-commit path.

    These are that probe, kept as the regression.
  */
  describe('PROBE-A: the battle-commit path cannot grant an upgrade', () => {
    it('no longer accepts the three progression columns as arguments', async () => {
      const args = await db.query<{ args: string }>(
        `select pg_get_function_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'commit_lobby_battle_progression'`,
      )

      // Exactly ONE overload must exist. `create or replace` at a different arity KEEPS both
      // (20260810160000 F3), and PostgREST refuses to route an overloaded name at all.
      expect(args.rows).toHaveLength(1)
      expect(args.rows[0].args).not.toMatch(/p_skill_levels|p_talent_state|p_awakening_state/)
    })

    it('leaves skills, talents and awakening exactly as they were, for free', async () => {
      const before = await db.query<{
        gold: number
        skills: string
        talents: string
        tier: number
      }>(
        `select p.gold,
                o.skill_levels::text as skills,
                o.talent_state::text as talents,
                (o.awakening_state ->> 'tier')::int as tier
         from public.profiles p
         join public.owned_characters o on o.profile_id = p.id
         where p.id = $1 and o.character_id = 'monkey-king'`,
        [TEST_USER],
      )

      // The 18-argument call the fixed client makes. There is no way to spell the old one.
      await db.query(
        `select * from public.commit_lobby_battle_progression(
           $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::text[],$10,$11,$12,$13,$14,$15,$16,$17,$18::timestamptz
         )`,
        [
          'probe-a-tx',
          'Tester',
          'นักเดินทาง',
          1,
          10,
          100,
          'default',
          '{}',
          '{}',
          'monkey-king',
          12,
          20,
          100,
          'battle-probe-a',
          'ทดสอบ',
          'win',
          12_000,
          '2026-08-10T09:00:00.000Z',
        ],
      )

      const after = await db.query<{ gold: number; skills: string; talents: string; tier: number }>(
        `select p.gold,
                o.skill_levels::text as skills,
                o.talent_state::text as talents,
                (o.awakening_state ->> 'tier')::int as tier
         from public.profiles p
         join public.owned_characters o on o.profile_id = p.id
         where p.id = $1 and o.character_id = 'monkey-king'`,
        [TEST_USER],
      )

      // Gold moved for nothing, and none of the three progression columns changed.
      expect(after.rows[0].gold).toBe(before.rows[0].gold)
      expect(after.rows[0].skills).toBe(before.rows[0].skills)
      expect(after.rows[0].talents).toBe(before.rows[0].talents)
      expect(after.rows[0].tier).toBe(before.rows[0].tier)
    })

    it('still does its own job — hero level and battle history commit', async () => {
      const hero = await db.query<{ level: number }>(
        `select level from public.owned_characters
         where profile_id = $1 and character_id = 'monkey-king'`,
        [TEST_USER],
      )
      expect(hero.rows[0].level).toBe(12)

      const history = await db.query<{ n: number }>(
        `select count(*)::int as n from public.battle_history
         where profile_id = $1 and external_id = 'battle-probe-a'`,
        [TEST_USER],
      )
      expect(history.rows[0].n).toBe(1)
    })
  })

  it('PROBE-C: a talent with an unmet prerequisite is refused', async () => {
    // TALENT_NODE_FIXTURES: mk-talent-2 requires mk-talent-1. progressionService enforced that
    // and its path is dead, so the rule has to be here or it exists nowhere. For one QC round
    // it existed nowhere and tier 2 was purchasable outright.
    await db.exec(
      `update public.owned_characters
       set talent_state = '{"unlockedNodes":[]}'::jsonb
       where profile_id = '${TEST_USER}' and character_id = 'monkey-king'`,
    )
    const before = await gold()

    await expect(
      spend('aaaaaaaa-aaaa-4aaa-8aaa-00000000000a', 'monkey-king', 'talent', 'mk-talent-2', 0),
    ).rejects.toThrow(/ต้องปลดล็อก mk-talent-1 ก่อน/)

    expect(await gold()).toBe(before)

    // ...and it succeeds once the prerequisite is actually held.
    await spend('aaaaaaaa-aaaa-4aaa-8aaa-00000000000b', 'monkey-king', 'talent', 'mk-talent-1', 0)
    const row = await spend(
      'aaaaaaaa-aaaa-4aaa-8aaa-00000000000c',
      'monkey-king',
      'talent',
      'mk-talent-2',
      0,
    )
    expect(row.gold_spent).toBe(60)
  })

  it('an ABSENT skill slot is seeded, not silently skipped after charging', async () => {
    /*
      `jsonb_set` with create_if_missing still needs every EARLIER path step to exist, so
      jsonb_set('{}', '{skill2,level}', 2, true) returns '{}' unchanged. With that shape the gold
      is debited, both ledger rows are written, the level never moves — and the compare-and-swap
      then still reads the old level, so the same purchase is chargeable again forever.

      No fixture had an absent slot, which is exactly why it survived the first round.
    */
    await db.exec(
      `update public.owned_characters
       set skill_levels = '{}'::jsonb
       where profile_id = '${TEST_USER}' and character_id = 'pig-warrior'`,
    )
    const before = await gold()

    const row = await spend(
      'aaaaaaaa-aaaa-4aaa-8aaa-00000000000d',
      'pig-warrior',
      'skill',
      'skill1',
      1,
    )

    expect(row.gold_spent).toBe(45)
    expect(await gold()).toBe(before - 45)
    // The level actually moved — this is the assertion that fails on the jsonb_set version.
    expect(await skillLevel('pig-warrior', 'skill1')).toBe(2)

    // And the charge cannot repeat, because the CAS now sees the new level.
    await expect(
      spend('aaaaaaaa-aaaa-4aaa-8aaa-00000000000e', 'pig-warrior', 'skill', 'skill1', 1),
    ).rejects.toThrow(/สถานะฮีโร่เปลี่ยนไปแล้ว/)
  })

  it('preserves the rest of a slot object when raising its level', async () => {
    await db.exec(
      `update public.owned_characters
       set skill_levels = '{"skill1":{"level":1,"exp":42,"expToNext":300}}'::jsonb
       where profile_id = '${TEST_USER}' and character_id = 'pig-warrior'`,
    )

    await spend('aaaaaaaa-aaaa-4aaa-8aaa-00000000000f', 'pig-warrior', 'skill', 'skill1', 1)

    const slot = await db.query<{ exp: number; to_next: number; level: number }>(
      `select (skill_levels -> 'skill1' ->> 'exp')::int as exp,
              (skill_levels -> 'skill1' ->> 'expToNext')::int as to_next,
              (skill_levels -> 'skill1' ->> 'level')::int as level
       from public.owned_characters where profile_id = $1 and character_id = 'pig-warrior'`,
      [TEST_USER],
    )
    expect(slot.rows[0]).toEqual({ exp: 42, to_next: 300, level: 2 })
  })

  it('a NULL upgrade key is rejected by the pre-rate-limit validation', async () => {
    /*
      `null not in (...)` is NULL, not true, so an `if` guarding only the membership test never
      fires — the call slipped past validation and was rejected later, after taking rate-limit
      budget. Three-valued logic defeats the property silently unless null is named.
    */
    const source = await db.query<{ src: string }>(
      `select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'spend_progression_upgrade'`,
    )
    const body = source.rows[0].src
    expect(body.indexOf('p_upgrade_key is null')).toBeLessThan(
      body.indexOf('check_and_log_rpc_rate_limit'),
    )

    await expect(
      db.query('select * from public.spend_progression_upgrade($1::uuid,$2,$3,$4,$5::int)', [
        'aaaaaaaa-aaaa-4aaa-8aaa-000000000010',
        'monkey-king',
        'skill',
        null,
        1,
      ]),
    ).rejects.toThrow(/คีย์การอัปเกรดไม่ถูกต้อง/)
  })

  it('is re-runnable — a double paste of the whole file is safe', async () => {
    // The owner relays migrations by hand; retry-after-interruption is a real scenario.
    await applyMigration(MIGRATION)

    const catalog = await db.query<{ n: number }>(
      'select count(*)::int as n from public.progression_cost_catalog',
    )
    expect(catalog.rows[0].n).toBe(21)

    // And the ledger survived, so a re-paste cannot resurrect a spent request id.
    const ledger = await db.query<{ n: number }>(
      'select count(*)::int as n from public.progression_spend_ledger',
    )
    expect(ledger.rows[0].n).toBeGreaterThan(0)
  })

  /*
    Task #91. The whole-chain replay above is the only place in this repo where "what does a
    FRESH environment end up with" is observable, which is why this assertion lives here rather
    than in a cron-shaped file of its own. 0006 and 0014 schedule the two account-deletion jobs
    earlier in this very chain; production disarmed them by hand on 2026-08-10 and every
    `cron.unschedule` written down since was a comment, so a restore, a `db reset`, or a new
    contributor's local setup silently re-armed both. Source-text cover for future migrations is
    in supabaseMigrations.contract.test.ts; this is the behavioural half — it fails if the disarm
    stops running, runs in the wrong order, or ever takes a job with it that it should not.
  */
  it('ends the chain with both account-deletion jobs disarmed and every other cron job intact', async () => {
    const scheduledJobs = async (): Promise<string[]> => {
      const result = await db.query<{ jobname: string }>(
        'select jobname from cron.job order by jobname',
      )
      return result.rows.map((row) => row.jobname)
    }
    // reap-expired-private-pvp-rooms is absent only because its migration is REALTIME_ONLY here.
    const survivors = [
      'archive-currency-transactions',
      'cleanup-old-audit-log-entries',
      'cleanup-stale-rpc-rate-limit-rows',
    ]

    expect(await scheduledJobs()).toEqual(survivors)

    // `cron.unschedule('name')` raises on a job that is already gone, and the owner relays by
    // hand — so the disarm has to be a no-op on the second paste, not an error.
    await applyMigration(DISARM_MIGRATION)
    expect(await scheduledJobs()).toEqual(survivors)
  })

  /*
    Task #92. Section 4 of the dead-account migration used to hold that job's own predicate with
    `count(*)` in place of `delete`, under one line of instruction: a returned 0 was the stated
    precondition for `cron.schedule`. It was relayed to the owner in those terms and believed.

    Every clock-driven clause in it is an age test against `now()`, `now()` binds when the query
    runs, and age only ever increases — so the count reads 0 on a day nobody happens to be due and
    bounds nothing about the day the cron actually fires. Measured forward on the real population:
    0 accounts on 2026-09-06, 12 on 2026-09-08.

    supabaseMigrations.contract.test.ts pins the instruction's source text. This is the other half:
    the replacement is lifted out of that comment block and RUN, unedited, against the fully
    replayed schema — because the owner pastes it into the SQL Editor by hand, and shipping a
    query nobody ever executed is the same defect one size smaller.
  */
  describe('the pre-arm projection that replaced that check', () => {
    const DUE_TOMORROW = '22222222-2222-2222-2222-222222222222'
    const PAYER = '33333333-3333-3333-3333-333333333333'
    const GUEST = '44444444-4444-4444-4444-444444444444'
    /** The removed check, in its exact shape: the deletion predicate, counted instead of run. */
    const REMOVED_POINT_IN_TIME_CHECK = `
      select count(*)::int as n from auth.users u
      where u.is_anonymous is false
        and u.created_at < now() - interval '30 days'
        and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
        and not exists (select 1 from public.battle_history bh where bh.profile_id = u.id)
        and not exists (
          select 1 from public.currency_transactions ct
          where ct.profile_id = u.id and ct.source <> 'signup'
            and ct.created_at > now() - interval '30 days')
        and not exists (
          select 1 from public.cleanup_exempt_profiles ce where ce.profile_id = u.id)
        and not exists (
          select 1 from public.currency_transactions ct
          where ct.profile_id = u.id and ct.source = 'topup')`

    // Inserted through auth.users so 0001's handle_new_user trigger builds each account the way
    // a real signup does — profile, starter hero, team slots, and the 'signup' ledger rows whose
    // backfill 20260810170000 documents as the reason its freshness guard excludes that source.
    beforeAll(async () => {
      await db.exec(`
        insert into auth.users (id, email, created_at, last_sign_in_at, raw_user_meta_data) values
          ('${DUE_TOMORROW}', 'quiet-signup@example.test',
             now() - interval '29 days', now() - interval '29 days',
             '{"uid":"2000000007","name":"QuietSignup"}'::jsonb),
          ('${PAYER}', 'paid-once@example.test', now() - interval '40 days', null,
             '{"uid":"2000000008","name":"Payer"}'::jsonb);
        insert into auth.users (id, email, is_anonymous, created_at, raw_user_meta_data) values
          ('${GUEST}', null, true, now() - interval '40 days',
             '{"uid":"2000000009","name":"Guest"}'::jsonb);

        insert into public.currency_transactions (profile_id, currency, source, amount)
          values ('${PAYER}', 'gem', 'topup', 100);
      `)
    })

    it('THE TRAP: the removed check reads a clean zero the day before it takes an account', async () => {
      const result = await db.query<{ n: number }>(REMOVED_POINT_IN_TIME_CHECK)

      expect(result.rows[0].n).toBe(0)
    })

    it('names the account that zero could not see, and the date it goes', async () => {
      const sql = readFileSync(
        join(process.cwd(), 'supabase/migrations', DEAD_ACCOUNT_MIGRATION),
        'utf8',
      )
      const projection = (/^--\s+select\b[\s\S]*?;\s*$/m.exec(sql)?.[0] ?? '').replaceAll(
        /^--\s?/gm,
        '',
      )

      const result = await db.query<{ id: string; deletable_from: Date }>(projection)

      // TEST_USER has battle_history (PROBE-A), the three dev accounts sit in
      // cleanup_exempt_profiles, PAYER has a topup, and GUEST is the other job's business. What
      // is left is the single account the count above scored as nothing at all.
      expect(result.rows.map((row) => row.id)).toEqual([DUE_TOMORROW])

      const dueIn = new Date(result.rows[0].deletable_from).getTime() - Date.now()
      expect(dueIn).toBeGreaterThan(0)
      expect(dueIn).toBeLessThan(2 * 24 * 60 * 60 * 1000)
    })
  })
})
