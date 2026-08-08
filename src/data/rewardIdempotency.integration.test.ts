import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const TEST_USER = '11111111-1111-1111-1111-111111111111'

async function applyMigration(db: PGlite, filename: string): Promise<void> {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations', filename), 'utf8')
  await db.exec(sql)
}

async function seedProfile(db: PGlite): Promise<void> {
  await db.exec(`
    insert into public.profiles (id, uid, name, gold, gem)
    values ('${TEST_USER}', '1234567890', 'Tester', 500, 0)
    on conflict (id) do nothing;

    insert into public.owned_characters (profile_id, character_id, level, exp, exp_to_next)
    values ('${TEST_USER}', 'monkey-king', 1, 0, 100)
    on conflict (profile_id, character_id) do nothing;
  `)
}

describe('reward idempotency migration (isolated Postgres via PGLite)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      insert into auth.users (id) values ('${TEST_USER}') on conflict do nothing;

      create or replace function auth.uid() returns uuid
      language sql stable as $$ select '${TEST_USER}'::uuid $$;

      do $$ begin
        create role authenticated;
      exception
        when duplicate_object then null;
      end $$;

      do $$ begin
        create role anon;
      exception
        when duplicate_object then null;
      end $$;

      create schema if not exists cron;
      create or replace function cron.schedule(job_name text, schedule text, command text)
      returns bigint language sql as $$ select 1::bigint $$;
    `)

    await applyMigration(db, '0001_init.sql')
    await applyMigration(db, '0005_skill_levels.sql')
    await applyMigration(db, '0008_progression_state.sql')
    await applyMigration(db, '0009_economy_integrity_fixes.sql')
    await applyMigration(db, '0010_coupon_dedup_index.sql')
    await applyMigration(db, '0011_rpc_rate_limit.sql')
    await applyMigration(db, '0012_public_profile_lookup.sql')
    await applyMigration(db, '0013_reward_idempotency.sql')
    await seedProfile(db)
  })

  afterAll(async () => {
    await db.close()
  })

  it('earn_gold with duplicate refId does not double gold', async () => {
    const refId = 'lobby:trial-01:2026-08-08T08:00:00.000Z'

    await db.query(`select * from public.earn_gold('drop', 81, $1)`, [refId])
    await db.query(`select * from public.earn_gold('drop', 81, $1)`, [refId])

    const gold = await db.query<{ gold: number }>(
      `select gold from public.profiles where id = $1`,
      [TEST_USER],
    )
    const txCount = await db.query<{ count: string }>(
      `select count(*)::text as count from public.currency_transactions
       where profile_id = $1 and ref_id = $2`,
      [TEST_USER, refId],
    )

    expect(gold.rows[0]?.gold).toBe(581)
    expect(txCount.rows[0]?.count).toBe('1')
  })

  it('grant_item with duplicate refId does not double quantity', async () => {
    const refId = 'lobby:trial-01:2026-08-08T08:00:00.000Z_item_iron-essence'

    await db.query(`select * from public.grant_item('iron-essence', 2, 'drop', $1)`, [refId])
    await db.query(`select * from public.grant_item('iron-essence', 2, 'drop', $1)`, [refId])

    const item = await db.query<{ quantity: number }>(
      `select quantity from public.inventory_items
       where profile_id = $1 and item_id = 'iron-essence'`,
      [TEST_USER],
    )
    const ledger = await db.query<{ count: string }>(
      `select count(*)::text as count from public.item_grant_ledger
       where profile_id = $1 and ref_id = $2`,
      [TEST_USER, refId],
    )

    expect(item.rows[0]?.quantity).toBe(2)
    expect(ledger.rows[0]?.count).toBe('1')
  })

  it('commit_lobby_battle_progression is atomic and idempotent on duplicate', async () => {
    const txId = 'lobby:trial-02:2026-08-08T09:00:00.000Z'
    const flags = { [`reward_tx_${txId}_prog`]: true, trial_cleared_trial_02: true }

    const params = [
      txId,
      'Tester',
      'นักเดินทาง',
      10,
      65,
      100,
      'default',
      JSON.stringify(flags),
      '{}',
      'monkey-king',
      1,
      65,
      100,
      JSON.stringify({
        skill1: { level: 1, exp: 0, expToNext: 200 },
        skill2: { level: 1, exp: 0, expToNext: 200 },
        skill3: { level: 1, exp: 0, expToNext: 200 },
        ultimate: { level: 1, exp: 0, expToNext: 200 },
      }),
      JSON.stringify({ unlockedNodes: [] }),
      JSON.stringify({ tier: 0, unlockedEffects: [] }),
      `battle-${txId}`,
      'ทดสอบ 2',
      'win',
      12000,
      '2026-08-08T09:00:00.000Z',
    ]

    await db.query(
      `select * from public.commit_lobby_battle_progression(
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::text[],$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19,$20,$21::timestamptz
      )`,
      params,
    )
    await db.query(
      `select * from public.commit_lobby_battle_progression(
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::text[],$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::jsonb,$17,$18,$19,$20,$21::timestamptz
      )`,
      params,
    )

    const hero = await db.query<{ exp: number }>(
      `select exp from public.owned_characters
       where profile_id = $1 and character_id = 'monkey-king'`,
      [TEST_USER],
    )
    const history = await db.query<{ count: string }>(
      `select count(*)::text as count from public.battle_history
       where profile_id = $1 and external_id = $2`,
      [TEST_USER, `battle-${txId}`],
    )

    expect(hero.rows[0]?.exp).toBe(65)
    expect(history.rows[0]?.count).toBe('1')
  })

  it('pending_lobby_rewards upsert survives reload resume', async () => {
    const txId = 'lobby:trial-03:2026-08-08T10:00:00.000Z'

    await db.query(
      `select public.upsert_pending_lobby_reward($1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz,$9)`,
      [
        txId,
        'trial-03',
        'ด่าน 3',
        'victory',
        50,
        20,
        JSON.stringify([{ itemId: 'iron-essence', quantity: 1 }]),
        '2026-08-08T10:00:00.000Z',
        5000,
      ],
    )

    const pending = await db.query<{ transaction_id: string; earned_gold: number }>(
      `select transaction_id, earned_gold from public.pending_lobby_rewards where profile_id = $1`,
      [TEST_USER],
    )

    expect(
      pending.rows.some(
        (row: { transaction_id: string; earned_gold: number }) => row.transaction_id === txId,
      ),
    ).toBe(true)

    await db.query(`select public.clear_pending_lobby_reward($1)`, [txId])

    const afterClear = await db.query<{ count: string }>(
      `select count(*)::text as count from public.pending_lobby_rewards
       where profile_id = $1 and transaction_id = $2`,
      [TEST_USER, txId],
    )
    expect(afterClear.rows[0]?.count).toBe('0')
  })
})
