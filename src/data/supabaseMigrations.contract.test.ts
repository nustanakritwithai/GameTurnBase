import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

interface NormalizedStatement {
  line: number
  normalized: string
  text: string
}

interface MigrationViolation {
  file: string
  line: number
  statement: string
}

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')
const PVP_MIGRATION = '20260809064000_p12_private_pvp_rooms.sql'
const DISARM_MIGRATION = '20260811000000_disarm_account_deletion_crons.sql'
const DEAD_ACCOUNT_MIGRATION = '20260810170000_security_reconcile_dead_account_cleanup.sql'
// The pre-arm query lives inside a `--` comment block, because the owner copies it out of the
// file and pastes it into the SQL Editor by hand. This lifts it back out, exactly as pasted.
const COMMENTED_QUERY = /^--\s+select\b[\s\S]*?;\s*$/m
// Both jobs delete auth.users rows and cascade through 11 tables; the project has PITR off and
// no backups. They were unscheduled by hand on production on 2026-08-10, but until
// DISARM_MIGRATION every `cron.unschedule` in this repository sat inside a `--` comment while
// only `cron.schedule` was executable — so any replay of the chain re-armed both. Filename order
// IS deploy order, so a schedule BEFORE the disarm is undone by it and a schedule at-or-after it
// is a live re-arm. That, and only that, is what this gate rejects.
const DISARMED_CRON_JOBS = ['cleanup-dead-unplayed-accounts', 'cleanup-stale-guest-accounts']
// First argument of `cron.schedule(job_name, schedule, command)` and of pg_cron 1.4+'s
// `cron.schedule_in_database(job_name, ...)` — the same gun by a second name.
const CRON_SCHEDULE_CALL = /\bcron"?\s*\.\s*"?schedule(?:_in_database)?"?\s*\(\s*'((?:''|[^'])*)'/gi
const CREATE_PREFIX = String.raw`(?:or\s+replace\s+)?(?:(?:constraint|global|local|temp|temporary|unique|unlogged)\s+)*`
const OBJECT_TYPE = String.raw`(?:aggregate|collation|conversion|domain|foreign\s+table|function|index|materialized\s+view|operator|procedure|sequence|table|trigger|type|view)`
const TARGET_PREFIX = String.raw`(?:concurrently\s+)?(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?`
// `policy` is deliberately absent from every pattern here: policies are the ONE kind of DDL a
// project migration may add to the platform-managed `realtime` schema. The "allows policy DDL"
// case below is the regression pin — widening these patterns to catch policy DDL turns it red.
const MANAGED_OBJECT_DDL = [
  new RegExp(`^create\\s+${CREATE_PREFIX}${OBJECT_TYPE}\\s+${TARGET_PREFIX}realtime\\.`),
  new RegExp(`^alter\\s+${OBJECT_TYPE}\\s+${TARGET_PREFIX}realtime\\.`),
  new RegExp(`^drop\\s+${OBJECT_TYPE}\\s+${TARGET_PREFIX}realtime\\.`),
  new RegExp(
    `^(?:create\\s+${CREATE_PREFIX}(?:index|trigger)|(?:alter|drop)\\s+trigger)\\b.*\\bon\\s+(?:only\\s+)?realtime\\.`,
  ),
  /^(?:create|alter|drop)\s+schema\b.*\brealtime\b/,
]

function countNewlines(value: string): number {
  return value.split('\n').length - 1
}

function dollarQuoteTagAt(sql: string, index: number): string | null {
  return /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index))?.[0] ?? null
}

function skipQuoted(sql: string, start: number, quote: "'" | '"'): number {
  let index = start + 1
  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2
        continue
      }
      return index + 1
    }
    if (quote === "'" && sql[index] === '\\' && index + 1 < sql.length) {
      index += 2
      continue
    }
    index += 1
  }
  return index
}

function skipBlockComment(sql: string, start: number): number {
  let depth = 1
  let index = start + 2
  while (index < sql.length && depth > 0) {
    if (sql.startsWith('/*', index)) {
      depth += 1
      index += 2
    } else if (sql.startsWith('*/', index)) {
      depth -= 1
      index += 2
    } else {
      index += 1
    }
  }
  return index
}

// Newlines survive masking so a violation keeps its real line number even when a 600-line
// migration hides it behind block comments and dollar-quoted bodies.
function maskRange(masked: string[], sql: string, start: number, end: number): void {
  for (let index = start; index < end; index += 1) {
    if (sql[index] !== '\n') masked[index] = ' '
  }
}

// `keepLiterals` blanks COMMENTS ONLY, leaving string and dollar-quoted bodies readable. String
// syntax still has to be parsed either way — a `--` inside a literal does not start a comment —
// so this is the same walk, minus the blanking. The cron gate needs it because the thing it
// looks for, a jobname, lives inside the single-quoted literal the DDL gate deliberately erases.
function maskNonDdlSql(sql: string, keepLiterals = false): string {
  const masked = sql.split('')
  let index = 0

  while (index < sql.length) {
    let end: number | null = null
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index + 2)
      end = newline === -1 ? sql.length : newline
    } else if (sql.startsWith('/*', index)) {
      end = skipBlockComment(sql, index)
    } else if (sql[index] === "'") {
      end = skipQuoted(sql, index, "'")
      if (keepLiterals) {
        index = end
        continue
      }
    } else if (sql[index] === '$') {
      const tag = dollarQuoteTagAt(sql, index)
      if (tag) {
        const close = sql.indexOf(tag, index + tag.length)
        end = close === -1 ? sql.length : close + tag.length
        if (keepLiterals) {
          index = end
          continue
        }
      }
    } else if (sql[index] === '"') {
      const quotedEnd = skipQuoted(sql, index, '"')
      for (let cursor = index; cursor < quotedEnd; cursor += 1) {
        if (sql[cursor] === ';') masked[cursor] = ' '
      }
      index = quotedEnd
      continue
    }

    if (end !== null) {
      maskRange(masked, sql, index, end)
      index = end
    } else {
      index += 1
    }
  }
  return masked.join('')
}

function normalizeStatement(masked: string): string {
  return masked
    .replace(/"((?:""|[^"])*)"/g, (_match, identifier: string) => identifier.replaceAll('""', '"'))
    .toLowerCase()
    .replace(/\s*\.\s*/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseStatements(sql: string): NormalizedStatement[] {
  const masked = maskNonDdlSql(sql)
  const statements: NormalizedStatement[] = []
  let line = 1
  let start = 0

  const addStatement = (end: number): void => {
    const maskedSlice = masked.slice(start, end)
    const firstToken = maskedSlice.search(/\S/)
    if (firstToken !== -1) {
      statements.push({
        line: line + countNewlines(maskedSlice.slice(0, firstToken)),
        normalized: normalizeStatement(maskedSlice),
        text: sql
          .slice(start + firstToken, end)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240),
      })
    }
    line += countNewlines(maskedSlice)
    start = end
  }

  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] === ';') addStatement(index + 1)
  }
  addStatement(masked.length)
  return statements
}

function findManagedRealtimeViolations(sql: string, file: string): MigrationViolation[] {
  return parseStatements(sql).flatMap(({ line, normalized, text }) =>
    MANAGED_OBJECT_DDL.some((pattern) => pattern.test(normalized))
      ? [{ file, line, statement: text }]
      : [],
  )
}

function findCronRearmViolations(sql: string, file: string): MigrationViolation[] {
  const executable = maskNonDdlSql(sql, true)
  return [...executable.matchAll(CRON_SCHEDULE_CALL)].flatMap((match) =>
    DISARMED_CRON_JOBS.includes(match[1].replaceAll("''", "'"))
      ? [
          {
            file,
            line: countNewlines(executable.slice(0, match.index ?? 0)) + 1,
            statement: match[0].replace(/\s+/g, ' '),
          },
        ]
      : [],
  )
}

function preArmProjection(sql: string): string {
  return (COMMENTED_QUERY.exec(sql)?.[0] ?? '').replaceAll(/^--\s?/gm, '').trim()
}

function intervalsIn(sql: string): Set<string> {
  return new Set(sql.match(/interval\s+'[^']*'/gi) ?? [])
}

function listMigrationFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return listMigrationFiles(path)
      return entry.isFile() && entry.name.endsWith('.sql') ? [path] : []
    })
    .toSorted()
}

describe('Supabase migration managed-schema contract', () => {
  it('keeps every project migration policy-only in the managed Realtime schema', () => {
    const violations = listMigrationFiles(MIGRATIONS_DIR).flatMap((path) =>
      findManagedRealtimeViolations(
        readFileSync(path, 'utf8'),
        relative(process.cwd(), path).replaceAll('\\', '/'),
      ),
    )

    expect(
      violations.map(
        ({ file, line, statement }) => `${file}:${line}: managed Realtime DDL: ${statement}`,
      ),
    ).toEqual([])
  })

  it.each([
    [
      'ALTER TABLE ONLY',
      1,
      'select 1; ALTER TABLE ONLY realtime.messages enable row level security;',
    ],
    ['CREATE UNLOGGED TABLE', 1, 'CREATE UNLOGGED TABLE realtime.audit_log (id bigint);'],
    [
      'quoted CREATE INDEX target',
      1,
      'CREATE INDEX realtime_messages_topic_idx ON "realtime" . "messages" (topic);',
    ],
    ['same-line DROP', 1, 'select 1; drop function realtime.topic();'],
    // The real migrations are 600+ lines of block comments and dollar-quoted bodies full of
    // semicolons. A violation buried under them must still report its own line, or the reviewer
    // opens line 1, finds a header comment, and stops trusting this gate.
    [
      'violation buried under a block comment and a dollar-quoted body',
      8,
      `/* Managed-schema notes:
   realtime.messages is platform-owned; only policies may be added.
   Semicolons in here (;;;) must not split statements. */
create or replace function public.pvp_topic() returns text
language sql stable as $fn$
  select current_setting('realtime.topic', true); -- ; inside a dollar-quoted body
$fn$;
alter table realtime.messages enable row level security;`,
    ],
  ])('rejects the %s managed-object variant with file and line attribution', (_name, line, sql) => {
    const violations = findManagedRealtimeViolations(sql, 'gate-example.sql')

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ file: 'gate-example.sql', line })
  })

  it.each([
    [
      'policy DDL with quoted helpers',
      `drop policy if exists "receive broadcast" on "realtime" . "messages";
       create policy "receive broadcast" on "realtime" . "messages"
       for select using ((select "realtime" . "topic"()) = 'pvp:room');`,
    ],
    [
      'public helper referencing Realtime',
      `create function public.current_realtime_topic() returns text language sql stable
       as $$ select "realtime" . "topic"() $$;`,
    ],
  ])('allows supported %s', (_name, sql) => {
    expect(findManagedRealtimeViolations(sql, 'allowed.sql')).toEqual([])
  })

  it('preserves the participant-only policy DDL in the P12 migration', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, PVP_MIGRATION), 'utf8')
    expect(sql).toMatch(
      /drop policy if exists "pvp participants receive authority broadcast" on realtime\.messages/i,
    )
    expect(sql).toMatch(
      /create policy "pvp participants receive authority broadcast"\s+on realtime\.messages/i,
    )
  })

  // The predicate below cannot be pinned behaviourally: `public.pvp_rooms` has its own
  // participant-scoped RLS, which masks the room from a non-participant inside this policy's own
  // `exists` subquery, so gutting the clause changes nothing observable while both walls stand.
  // Widen that other policy and this one becomes the only thing between an authenticated player
  // and another pair's authoritative state broadcast (SECURITY.md, in-scope: "reading another
  // room's private Realtime topic"). Asserted as source text because that is where it is visible.
  it('scopes the Realtime broadcast policy to SELECT, to authenticated, and to the two players in the topic room', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, PVP_MIGRATION), 'utf8')
    const policy =
      /create policy "pvp participants receive authority broadcast"[\s\S]*?;/.exec(sql)?.[0] ?? ''

    expect(policy).toMatch(/\bfor\s+select\b/)
    expect(policy).toMatch(/\bto\s+authenticated\b/)
    expect(policy).toMatch(
      /room\.id::text\s*=\s*substring\(\(select realtime\.topic\(\)\) from 5\)/,
    )
    expect(policy).toMatch(/\(select auth\.uid\(\)\)\s*=\s*room\.host_profile_id/)
    expect(policy).toMatch(/\(select auth\.uid\(\)\)\s*=\s*room\.guest_profile_id/)
  })
})

describe('account-deletion cron disarm contract', () => {
  it('re-arms neither deletion job in a migration applied at or after the disarm', () => {
    const violations = listMigrationFiles(MIGRATIONS_DIR)
      .filter((path) => basename(path) >= DISARM_MIGRATION)
      .flatMap((path) =>
        findCronRearmViolations(
          readFileSync(path, 'utf8'),
          relative(process.cwd(), path).replaceAll('\\', '/'),
        ),
      )

    expect(
      violations.map(
        ({ file, line, statement }) =>
          `${file}:${line}: re-arms a disarmed account-deletion job: ${statement}`,
      ),
    ).toEqual([])
  })

  // The defect was never "nobody wrote the unschedule down" — three files say it in prose. It is
  // that every word of that prose was commented out while only `cron.schedule` ever executed.
  it('carries the disarm as executable SQL rather than as one more comment', () => {
    const executable = maskNonDdlSql(
      readFileSync(join(MIGRATIONS_DIR, DISARM_MIGRATION), 'utf8'),
      true,
    )

    expect(executable).toMatch(/\bcron"?\s*\.\s*"?unschedule\b/)
    for (const jobName of DISARMED_CRON_JOBS) expect(executable).toContain(`'${jobName}'`)
  })

  it.each([
    [
      'a plain re-arm',
      1,
      `select cron.schedule('cleanup-stale-guest-accounts', '0 3 * * *',
         $$select public.cleanup_stale_guest_accounts();$$);`,
    ],
    [
      'a re-arm in the exact shape of the defect — the unschedule commented out above it',
      3,
      `-- disarmed 2026-08-10 (MEMORY item 190 Part B):
--   cron.unschedule('cleanup-dead-unplayed-accounts');
select cron.schedule('cleanup-dead-unplayed-accounts', '30 3 * * *', $$select 1;$$);`,
    ],
    [
      'the schedule_in_database spelling',
      1,
      `select cron.schedule_in_database('cleanup-stale-guest-accounts', '0 3 * * *',
         $$select 1;$$, 'postgres');`,
    ],
  ])('rejects %s with file and line attribution', (_name, line, sql) => {
    const violations = findCronRearmViolations(sql, 'gate-example.sql')

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ file: 'gate-example.sql', line })
  })

  // None of these four deletes an account: they prune an audit table, a rate-limit table, move
  // ledger rows to an archive, and expire abandoned PvP rooms. A gate that matched on a name
  // pattern instead of the two literal jobnames would silently take the first two with it.
  it.each([
    'archive-currency-transactions',
    'cleanup-old-audit-log-entries',
    'cleanup-stale-rpc-rate-limit-rows',
    'reap-expired-private-pvp-rooms',
  ])('leaves the %s job schedulable', (jobName) => {
    const sql = `select cron.schedule('${jobName}', '0 3 * * *', $$select 1;$$);`

    expect(findCronRearmViolations(sql, 'keeper.sql')).toEqual([])
  })

  it.each([
    [
      'a commented-out re-arm',
      `-- select cron.schedule('cleanup-stale-guest-accounts', '0 3 * * *', $$select 1;$$);`,
    ],
    [
      'prose naming a disarmed job',
      `/* cron.schedule('cleanup-dead-unplayed-accounts', ...) must not come back */ select 1;`,
    ],
    [
      'the set-based unschedule that replaces them',
      `select cron.unschedule(j.jobid) from cron.job j
       where j.jobname in ('cleanup-stale-guest-accounts', 'cleanup-dead-unplayed-accounts');`,
    ],
  ])('allows %s', (_name, sql) => {
    expect(findCronRearmViolations(sql, 'allowed.sql')).toEqual([])
  })
})

/*
  Task #92. The dead-account migration shipped a PRE-ARM CHECK: the deletion predicate with
  `count(*)` in place of `delete`, under the instruction that a returned 0 cleared `cron.schedule`.
  It was relayed to the owner in those terms and believed.

  It cannot bound anything. Every clock-driven clause in that predicate is
  `<timestamp> < now() - interval '30 days'`, `now()` binds when the query RUNS, and age only ever
  increases — so an account that fails the test today passes it in a few days with nobody doing
  anything, and a cron job fires every day forever rather than once. The count measures the leading
  edge of an advancing window at the one moment nobody is due. Measured forward on the same
  predicate and the same population: 0 accounts on 2026-09-06, 12 on 2026-09-08, two days apart.

  Both jobs are disarmed (20260811000000), so this pins the INSTRUCTION, which is still shipped and
  is what the next operator reads. A migration file is documentation as much as it is SQL.
*/
describe('dead-account cleanup pre-arm instruction', () => {
  it('projects per account and per date instead of counting at the moment of checking', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, DEAD_ACCOUNT_MIGRATION), 'utf8')
    const projection = preArmProjection(sql)

    expect(projection).toMatch(/^select\b/)
    // The trap, mechanically: an age threshold anchored to the instant of checking.
    expect(projection).not.toMatch(/\bnow\s*\(/)
    // A count collapses "which accounts, on which day" into one number taken on the wrong day.
    expect(projection).not.toMatch(/\bcount\s*\(/)
    // What replaces it: the date each account enters range, which a count cannot express.
    expect(projection).toContain('deletable_from')
    // Pasted by hand into the SQL Editor against live player data. Read-only or nothing.
    expect(projection).not.toMatch(/\b(?:delete|update|insert|drop|truncate|alter|grant|revoke)\b/i)
    // The retention window is written twice — once in the body that deletes, once in the
    // projection that promises what the body will delete. Widening one alone makes the promise
    // false again, silently, in exactly the way this section now exists to prevent.
    expect(intervalsIn(projection)).toEqual(
      intervalsIn(/create or replace function[\s\S]*?\$\$;/.exec(sql)?.[0] ?? ''),
    )
  })

  it('offers no reading that turns arming the job into a formality', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, DEAD_ACCOUNT_MIGRATION), 'utf8')

    // "re-arm only if it returns 0" and "do not re-arm unless it returns 0" — the two sentences
    // that made a single number the green light. Any successor phrasing of the same conditional
    // fails here; the file may describe the removed instruction, but not restate it as one.
    expect(sql).not.toMatch(/re-?arm[^.]{0,120}\b(?:0|zero|none|nothing|empty)\b/i)
  })
})
