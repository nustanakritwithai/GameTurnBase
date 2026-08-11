import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { getBattleSpriteSet } from './battleSpriteSequences'
import type { CharacterModelKind } from './characters'
import { publicUrl } from '../lib/publicUrl'
import { SPRITE_SHEET_CALIBRATIONS } from './realtimeBattle/entitySpritePresentation'
import { getSpriteSequence } from './spriteSequences'
import { getWalkKit } from './walkKits'

/**
 * The sprite compiler this domain never had — task #101 in `docs/SPRITE-CONFORMANCE.md`.
 *
 * Every number in that conformance record came from a person deciding to measure. Asset defects
 * are silent by nature: a frame on the wrong canvas renders fine and is merely 81.5% too big, a
 * turn set numbered wrong faces the character the wrong way with no error, and a 51 px foot drift
 * makes the character bob. None of it throws. This file asserts the four invariants that ARE
 * computable from the shipped files alone, so those defects become CI failures instead of prose.
 *
 *   1. CANVAS PER PREFIX      every frame sharing one prefix shares one canvas size
 *   2. PATHS AND COUNTS       every path the code pins resolves, and the pinned count is what ships
 *   3. DIRECTION ORDER        the turn set is addressed by NUMBER, the walk set by NAME
 *   4. ANCHOR TOLERANCE       foot-line drift inside the band for the animation kind
 *   5. DERIVED WORLD SIZE     every drawn family is calibrated, and one character is one height
 *
 * `docs/SPRITE-DESIGN-LOCK.md` is the owner-locked standard; `docs/SPRITE-CONFORMANCE.md` is what
 * this repo measures against it. Both are prerequisites for editing anything below.
 */

const CHARACTERS_DIR = join(process.cwd(), 'public/characters')
const ADVENTURE_SOURCE_PATH = 'src/components/AdventureScene/WukongAdventure.tsx'

/** Design lock, "The anchor tolerance register" — alpha threshold for every measurement. */
const ALPHA_THRESHOLD = 8

/**
 * Design lock, "The base" — ceilings per animation kind, EXTERNAL-MEASURED (p90 of two external
 * corpora, 314 sets). These are ceilings evidenced from outside, never targets: the sets in this
 * repository that were made carefully measure 0.
 *
 * `xDirPx` is absolute because an authoring alignment error does not scale with character size
 * (proved: no cell of the correlation matrix shows the positive correlation a proportional model
 * needs). `inDirPct` is proportional because a larger character's stride really does cross more
 * pixels. Merging the two would condemn correct art — see `monkey-attack-new` below.
 */
const BANDS = {
  /** idle, combat idle, emote, cast-in-place — and an 8-facing turn set, whose body is planted. */
  'pose-hold': { xDirPx: 1, inDirPx: 1 },
  /** walk, run, jump, climb. */
  locomotion: { xDirPx: 2, inDirPct: 27 },
  /** slash, thrust, shoot, and similar. */
  action: { xDirPx: 3, inDirPct: 23 },
} as const

type AnimationKind = keyof typeof BANDS

/**
 * How a group's trailing frame number is addressed. This is the invariant-3 hazard written as
 * data: `sequence` numbers are TIME, `turn` numbers are DIRECTIONS, `walk` frames carry their
 * direction in the filename as a NAME and number only time. Nothing in the filenames distinguishes
 * `sequence` from `turn` — it is a semantic fact about what the art depicts, so it is declared.
 */
type Layout = 'sequence' | 'turn' | 'walk'

interface GroupContract {
  kind: AnimationKind
  layout: Layout
}

/**
 * Every scored group, with the kind that picks its ceiling. Sourced from the conformance record's
 * "Scored against the anchor tolerance register" table — not re-derived here, because a kind
 * assigned by guesswork silently applies the wrong standard.
 */
const GROUP_CONTRACTS: Record<string, GroupContract> = {
  'monkey-v2-idle': { kind: 'pose-hold', layout: 'sequence' },
  'pigsy-idle': { kind: 'pose-hold', layout: 'sequence' },
  'tripitaka-idle': { kind: 'pose-hold', layout: 'sequence' },
  'erlang-shen-v6-idle': { kind: 'pose-hold', layout: 'sequence' },
  'monkey-turn': { kind: 'pose-hold', layout: 'turn' },
  'pigsy-turn': { kind: 'pose-hold', layout: 'turn' },
  'tripitaka-turn': { kind: 'pose-hold', layout: 'turn' },
  'spear-warrior-stop-turn': { kind: 'pose-hold', layout: 'turn' },
  'spear-warrior-stop-turn-key': { kind: 'pose-hold', layout: 'turn' },
  'monkey-walk': { kind: 'locomotion', layout: 'walk' },
  'pigsy-walk': { kind: 'locomotion', layout: 'walk' },
  'monkey-v2': { kind: 'action', layout: 'sequence' },
  'pigsy-team': { kind: 'action', layout: 'sequence' },
  'monkey-attack-new': { kind: 'action', layout: 'sequence' },
  'erlang-shen-attack-v1': { kind: 'action', layout: 'sequence' },
  'erlang-shen-normal-attack-v2': { kind: 'action', layout: 'sequence' },
  'erlang-shen-normal-attack-v3-final': { kind: 'action', layout: 'sequence' },
  'erlang-shen-skill-1': { kind: 'action', layout: 'sequence' },
  'erlang-shen-skill-2-cast': { kind: 'action', layout: 'sequence' },
}

/**
 * Groups that carry NO verdict, each for a stated reason. A wrong kind applies the wrong ceiling
 * silently, which is worse than no verdict — so these are skipped rather than guessed.
 *
 * The set is asserted to be exactly this, so a new group cannot join it by being added to the
 * directory. Anything new is either contracted above or turns this file red.
 */
const UNSCORED: Record<string, string> = {
  aura: 'unclassifiable from names and code references — a human must say what it depicts',
  hound: 'unclassifiable from names and code references — a human must say what it depicts',
  'monkey-pose': 'victory pose; never classified in the conformance record',
  'tripitaka-buddha-aura': 'single decorative texture, not a sequence — nothing to score',
}

/**
 * The four groups that fail today. Landing this test with them listed is deliberate: a test that
 * cannot land until someone redraws art is a test that never lands.
 *
 * The failing SET is asserted to be exactly these four (a fifth failure turns red, and so does
 * fixing one without deleting its row), and each measured number is pinned so an already-failing
 * group cannot rot further behind the exception.
 *
 * Owner of the fix: `TASKS.md` row 33 "Sprite geometry & asset contract", held pending HetCreep's
 * sprite go-ahead. Full writeup in `docs/SPRITE-CONFORMANCE.md` § `E1`.
 */
const KNOWN_FAILING: Record<string, { axis: 'xDir'; measuredPx: number; ceilingPx: number }> = {
  // 51x over the pose-hold ceiling. The worst conformance failure in the repository, and it fails
  // the strictest band there is — the one for animations where the body does not move at all.
  'monkey-turn': { axis: 'xDir', measuredPx: 51, ceilingPx: 1 },
  // 31x over.
  'tripitaka-turn': { axis: 'xDir', measuredPx: 31, ceilingPx: 1 },
  // 12x over.
  'pigsy-turn': { axis: 'xDir', measuredPx: 12, ceilingPx: 1 },
  // 2.8x over on xDir only; its inDir is a legitimate 3.69% against a 27% ceiling.
  'pigsy-walk': { axis: 'xDir', measuredPx: 5.63, ceilingPx: 2 },
}

/**
 * `TURN_INDEX` in `WukongAdventure.tsx` — the turn set is addressed by NUMBER and this mapping is
 * load-bearing. A document that lists directions starting at `up` and hands that list to an artist
 * puts the up-facing pose in slot 0, where the code expects down-facing: the whole game faces the
 * wrong way, with no error. That has already been shipped in an external-facing document once.
 */
const LOCKED_TURN_ORDER = [
  'down',
  'down-right',
  'right',
  'up-right',
  'up',
  'up-left',
  'left',
  'down-left',
] as const

/** Direction tokens that appear in a walk filename. Longest-first so `down-left` wins over `down`. */
const DIRECTION_SUFFIX = /-(?:up|down)(?:-(?:left|right))?$|-(?:left|right)$/

/** First match wins, exactly as `resolveSheetCalibration` resolves it at runtime. */
const calibrationFor = (url: string) =>
  SPRITE_SHEET_CALIBRATIONS.find((row) => url.includes(row.pathFragment))

interface FrameMeasurement {
  width: number
  height: number
  /** Alpha top to alpha bottom, in rows. */
  charHeight: number
  /** Lowest opaque row. */
  footLine: number
}

interface FrameFile {
  /** Path relative to `public/`, e.g. `characters/turnaround/monkey-turn-0.webp`. */
  publicPath: string
  absolutePath: string
  /** Group name, e.g. `monkey-turn`. Unique across the corpus. */
  group: string
  /** Direction bucket within the group: a name for walk sets, the index for turn sets, '' else. */
  direction: string
}

/**
 * Foot line by alpha scan, exactly as `docs/SPRITE-DESIGN-LOCK.md` § "Method" states it:
 * alpha threshold 8, character height from alpha top to alpha bottom, foot line = lowest opaque row.
 *
 * The record's other axis — foot CENTRE inside the bottom 3.75% band — is deliberately measured but
 * NOT gated here. The lock's tolerance register publishes no ceiling for it, and inventing one would
 * promote a Layer C value to specification, which that document forbids in its first standing rule.
 */
async function measureFrame(absolutePath: string): Promise<FrameMeasurement> {
  const { data, info } = await sharp(absolutePath)
    .ensureAlpha()
    .extractChannel('alpha')
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height } = info
  let top = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (data[row + x] > ALPHA_THRESHOLD) {
        if (top < 0) top = y
        bottom = y
        break
      }
    }
  }

  if (top < 0) throw new Error(`${absolutePath} is fully transparent — nothing to measure`)
  return { width, height, charHeight: bottom - top + 1, footLine: bottom }
}

/** Split `.../monkey-walk-down-left-3.webp` into group `monkey-walk` and direction `down-left`. */
function classifyFile(absolutePath: string): FrameFile {
  const publicPath = absolutePath
    .slice(absolutePath.indexOf('public') + 'public/'.length)
    .replaceAll('\\', '/')
  // `monkey-pose-0-alpha.webp` numbers the frame before a suffix, so strip the suffix first.
  const stem = basename(absolutePath, '.webp').replace(/-alpha$/, '')
  const numbered = /^(.*)-(\d+)$/.exec(stem)
  const withoutFrame = numbered ? numbered[1] : stem
  const directionMatch = DIRECTION_SUFFIX.exec(withoutFrame)

  return {
    publicPath,
    absolutePath,
    group: directionMatch ? withoutFrame.slice(0, directionMatch.index) : withoutFrame,
    direction: directionMatch ? directionMatch[0].slice(1) : (numbered?.[2] ?? ''),
  }
}

function listFrames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFrames(join(dir, entry.name))
      : entry.name.endsWith('.webp')
        ? [join(dir, entry.name)]
        : [],
  )
}

const spread = (values: number[]): number => Math.max(...values) - Math.min(...values)
const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length

/** `Map.groupBy` is ES2024 and this project's lib is ES2023 — one test does not move that floor. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const bucket = grouped.get(key(item))
    if (bucket) bucket.push(item)
    else grouped.set(key(item), [item])
  }
  return grouped
}

/** Strip the Vite base so a `publicUrl()` result can be compared against a path under `public/`. */
function toPublicPath(url: string): string {
  const base = import.meta.env.BASE_URL
  return (url.startsWith(base) ? url.slice(base.length) : url).replace(/^\//, '')
}

const ALL_KINDS: CharacterModelKind[] = [
  'monkey-king',
  'pig-warrior',
  'pilgrim-monk',
  'celestial-archer',
  'nezha-warden',
  'sand-sage',
  'spear-warrior',
]

const files = listFrames(CHARACTERS_DIR).map(classifyFile)
const measurements = new Map<string, FrameMeasurement>()

/**
 * One decode pass for the whole corpus; every invariant below reads from this map.
 * ponytail: unbounded parallelism, fine at 359 frames (~2 s) — pool it if the corpus grows 10x.
 */
beforeAll(async () => {
  await Promise.all(
    files.map(async (file) => {
      measurements.set(file.publicPath, await measureFrame(file.absolutePath))
    }),
  )
}, 120_000)

const measure = (file: FrameFile): FrameMeasurement => {
  const found = measurements.get(file.publicPath)
  if (!found) throw new Error(`no measurement for ${file.publicPath}`)
  return found
}

describe('sprite frame contract', () => {
  it('scanned a real corpus (guards against every assertion below passing on an empty set)', () => {
    expect(files.length).toBeGreaterThan(300)
    expect(measurements.size).toBe(files.length)
  })

  /**
   * INVARIANT 1 — canvas per prefix.
   *
   * Not "every frame is 640x512", which is false for 126 of 359 files: seven canvas sizes ship and
   * that is legitimate (`docs/SPRITE-CONFORMANCE.md`, "Frame inventory"). What is never legitimate
   * is one frame of a set landing on a different canvas from its siblings — it renders fine and is
   * silently the wrong size, and `entitySpritePresentation.ts` calibrates one canvas per family.
   */
  describe('canvas per prefix', () => {
    it('every frame sharing a prefix shares one canvas size', () => {
      const mixed = [...groupBy(files, (file) => file.group)]
        .map(([group, groupFiles]) => ({
          group,
          canvases: [...new Set(groupFiles.map((f) => `${measure(f).width}x${measure(f).height}`))],
        }))
        .filter((entry) => entry.canvases.length > 1)

      expect(mixed).toEqual([])
    })
  })

  /**
   * INVARIANT 2 — every pinned path resolves, and the pinned count is what ships.
   *
   * A missing file is a 404 at runtime, not a fallback: paths are strings, so typecheck, lint and
   * build all stay green while the game shows a blank screen. This project has hit that three times
   * (`MEMORY.md` items 12 and 15, plus the WebP migration).
   *
   * `battleSpriteSequences.ts` path existence is already covered by
   * `realtimeBattle/battleAssets.test.ts`; this block adds the two sources it does not read, and
   * adds the count half for all three.
   */
  describe('pinned paths and counts', () => {
    const shippedByGroup = groupBy(files, (file) => file.group)

    /** Every URL the code pins, from all three sources of truth. */
    const pinnedUrls = ALL_KINDS.flatMap((kind) => {
      const walkKit = getWalkKit(kind)
      const sequence = getSpriteSequence(kind)
      const battle = getBattleSpriteSet(kind)

      const walkUrls = walkKit.walkPrefix
        ? LOCKED_TURN_ORDER.flatMap((direction) =>
            Array.from(
              { length: 8 },
              (_, frame) => `${walkKit.walkPrefix}-${direction}-${frame}.webp`,
            ),
          )
        : []

      return [
        ...walkUrls,
        ...Array.from({ length: 8 }, (_, i) => `${walkKit.turnPrefix}-${i}.webp`),
        ...Array.from({ length: walkKit.idleCount }, (_, i) => `${walkKit.idlePrefix}-${i}.webp`),
        ...sequence.idleUrls,
        ...sequence.actionUrls,
        ...sequence.turnUrls,
        ...Object.values(battle).flatMap((animation) => Object.values(animation.frames).flat()),
      ]
    })

    const shippedPaths = new Set(files.map((file) => file.publicPath))

    it('pins a real workload, not an empty list', () => {
      expect(new Set(pinnedUrls).size).toBeGreaterThan(200)
    })

    it('every pinned path resolves to a shipped file', () => {
      const missing = [...new Set(pinnedUrls)].filter((url) => !shippedPaths.has(toPublicPath(url)))
      expect(missing).toEqual([])
    })

    it('every pinned path is .webp, per the build:images pipeline', () => {
      expect(pinnedUrls.filter((url) => !url.endsWith('.webp'))).toEqual([])
    })

    /**
     * Counts must match in BOTH directions. Too few shipped is a 404; too many shipped is art the
     * code loads but never draws — which is real here already: `idleCount` is 24 while
     * `WukongAdventure.tsx` can only reach 8 of those frames (conformance record, `B3`).
     */
    it('every pinned frame count equals the number of frames that ship for that prefix', () => {
      const pinnedCounts = new Map<string, number>()
      for (const url of new Set(pinnedUrls)) {
        const file = classifyFile(toPublicPath(url))
        pinnedCounts.set(file.group, (pinnedCounts.get(file.group) ?? 0) + 1)
      }

      const disagreements = [...pinnedCounts]
        .map(([group, pinned]) => ({ group, pinned, shipped: shippedByGroup.get(group)?.length }))
        .filter((entry) => entry.pinned !== entry.shipped)

      expect(disagreements).toEqual([])
    })

    it('idleCount agrees with the frames that ship for that idle prefix', () => {
      const disagreements = ALL_KINDS.map((kind) => {
        const kit = getWalkKit(kind)
        const group = classifyFile(toPublicPath(`${kit.idlePrefix}-0.webp`)).group
        return { kind, declared: kit.idleCount, shipped: shippedByGroup.get(group)?.length }
      }).filter((entry) => entry.declared !== entry.shipped)

      expect(disagreements).toEqual([])
    })
  })

  /**
   * INVARIANT 3 — the turn set is addressed by NUMBER, the walk set by NAME, and the orders differ.
   *
   * Nothing in the pixels can prove which way a character faces, so this is a pin, not a
   * measurement: it asserts the two systems stay as they are. Swapping them faces the character the
   * wrong way across the whole game with no error.
   *
   * `TURN_INDEX` and `DIRECTIONS` are module-private in a component, so they are read out of the
   * source text rather than by importing the component's whole render graph into an asset test.
   * Reading the literal also pins the order as WRITTEN, which is what an artist-facing document
   * gets derived from — the exact route by which this was shipped wrong once.
   */
  describe('direction addressing', () => {
    /**
     * Read at assert time, never snapshotted at collection time. A component under concurrent edit
     * would otherwise be asserted against a stale copy of itself, which is the failure this gate
     * exists to catch.
     */
    function literalBlock(pattern: RegExp): string {
      const source = readFileSync(join(process.cwd(), ADVENTURE_SOURCE_PATH), 'utf8')
      const match = pattern.exec(source)
      if (!match) throw new Error(`${pattern} found nothing in ${ADVENTURE_SOURCE_PATH}`)
      return match[1]
    }

    it('TURN_INDEX maps direction to the file number in the locked order', () => {
      const body = literalBlock(/const TURN_INDEX:[^=]*=\s*\{([^}]*)\}/)
      const byIndex = [...body.matchAll(/['"]?([\w-]+)['"]?\s*:\s*(\d+)/g)]
        .map(([, direction, index]) => ({ direction, index: Number(index) }))
        .toSorted((a, b) => a.index - b.index)

      expect(byIndex.map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
      expect(byIndex.map((entry) => entry.direction)).toEqual([...LOCKED_TURN_ORDER])
    })

    it('DIRECTIONS is written in the same order the turn files are numbered', () => {
      const body = literalBlock(/const DIRECTIONS:[^=]*=\s*\[([^\]]*)\]/)
      const listed = [...body.matchAll(/['"]([\w-]+)['"]/g)].map(([, direction]) => direction)
      expect(listed).toEqual([...LOCKED_TURN_ORDER])
    })

    it('every turn frame the code pins is addressed by number, not by name', () => {
      const turnUrls = ALL_KINDS.flatMap((kind) => getSpriteSequence(kind).turnUrls)
      const notNumbered = turnUrls.filter((url) => !/-\d+\.webp$/.test(url))
      expect(notNumbered).toEqual([])
    })

    it('every walk frame is addressed by direction NAME, and by the direction it is filed under', () => {
      const wrong = ALL_KINDS.flatMap((kind) =>
        Object.entries(getBattleSpriteSet(kind).walk.frames).flatMap(([direction, urls]) =>
          (urls ?? [])
            .filter((url) => url.includes('/walk/') && !url.includes(`-${direction}-`))
            .map((url) => ({ kind, direction, url })),
        ),
      )
      expect(wrong).toEqual([])
    })

    /**
     * The guard against "harmonising" the two. `battleSpriteSequences.ts` iterates directions
     * starting at `up`; the turn set is numbered starting at `down`. That difference is harmless
     * only because the battle order never becomes an index — the day someone makes the two lists
     * one list, this goes red before the art does.
     */
    it('the battle direction order is NOT the turn-index order', () => {
      const battleOrder = Object.keys(getBattleSpriteSet('monkey-king').walk.frames)
      expect(battleOrder).toHaveLength(LOCKED_TURN_ORDER.length)
      expect(battleOrder).not.toEqual([...LOCKED_TURN_ORDER])
    })
  })

  /**
   * INVARIANT 4 — anchor tolerance per animation kind.
   *
   * `inDir` is drift within one direction's own frames and may legitimately be large: a stride
   * lifts a foot, a lunge leaves the ground. `xDir` is drift between the MEAN foot line of each
   * direction and has no such excuse — nothing about any animation explains why the left-facing
   * cycle should stand at a different height from the right-facing one. The two axes answer
   * different questions and are never merged.
   */
  describe('anchor tolerance per animation kind', () => {
    interface Score {
      group: string
      kind: AnimationKind
      inDirPx: number
      inDirPct: number
      xDirPx: number
    }

    function score(group: string, contract: GroupContract, groupFiles: FrameFile[]): Score {
      // A turn set is eight single-frame directions, so each frame is its own direction bucket and
      // the whole set reads as the xDir pose-hold case. A sequence is one direction over time.
      const buckets =
        contract.layout === 'sequence'
          ? [groupFiles]
          : [...groupBy(groupFiles, (file) => file.direction).values()]

      const perDirection = buckets.map((bucket) => bucket.map((file) => measure(file).footLine))
      const charHeight = mean(groupFiles.map((file) => measure(file).charHeight))
      const inDirPx = Math.max(...perDirection.map(spread))

      return {
        group,
        kind: contract.kind,
        inDirPx,
        inDirPct: (inDirPx / charHeight) * 100,
        xDirPx: spread(perDirection.map(mean)),
      }
    }

    function exceeds(entry: Score): boolean {
      const band = BANDS[entry.kind]
      if (entry.xDirPx > band.xDirPx) return true
      return 'inDirPx' in band ? entry.inDirPx > band.inDirPx : entry.inDirPct > band.inDirPct
    }

    let scores: Score[] = []

    beforeAll(() => {
      scores = [...groupBy(files, (file) => file.group)]
        .filter(([group]) => group in GROUP_CONTRACTS)
        .map(([group, groupFiles]) => score(group, GROUP_CONTRACTS[group], groupFiles))
    })

    it('scores every contracted group', () => {
      expect(scores.map((entry) => entry.group).toSorted()).toEqual(
        Object.keys(GROUP_CONTRACTS).toSorted(),
      )
    })

    /**
     * Every group in the directory is either contracted with a kind or explicitly unscored with a
     * reason. This is what stops the exception list rotting: a new group cannot slip past scoring
     * by simply existing.
     */
    it('every shipped group is either contracted or explicitly unscored', () => {
      const groups = [...new Set(files.map((file) => file.group))].toSorted()
      expect(groups).toEqual([...Object.keys(GROUP_CONTRACTS), ...Object.keys(UNSCORED)].toSorted())
    })

    it('the unscored set is exactly the groups nobody has classified', () => {
      const unscored = [...new Set(files.map((file) => file.group))].filter(
        (group) => !(group in GROUP_CONTRACTS),
      )
      expect(unscored.toSorted()).toEqual(Object.keys(UNSCORED).toSorted())
    })

    /**
     * THE gate. Everything else in this describe block exists to make this line trustworthy.
     *
     * Asserting equality rather than "no NEW failures" is deliberate and cuts both ways: a fifth
     * group drifting out of band turns it red, and so does fixing one of the four without deleting
     * its row here. An exception list that can only grow is how a gate rots.
     */
    it('every group is inside its band, except exactly the four known-failing groups', () => {
      const failing = scores.filter(exceeds).map((entry) => entry.group)
      expect(failing.toSorted()).toEqual(Object.keys(KNOWN_FAILING).toSorted())
    })

    it('each known failure still measures what the conformance record recorded', () => {
      for (const [group, expected] of Object.entries(KNOWN_FAILING)) {
        const entry = scores.find((candidate) => candidate.group === group)
        expect(entry, `${group} is no longer a scored group`).toBeDefined()
        expect(entry?.xDirPx, `${group} ${expected.axis} drift moved`).toBeCloseTo(
          expected.measuredPx,
          1,
        )
        expect(BANDS[entry!.kind].xDirPx, `${group} changed kind`).toBe(expected.ceilingPx)
      }
    })

    /**
     * `spear-warrior-stop-turn` is the in-repo exemplar — the one turn set the 2026-08-08 re-crop
     * never touched — and it holds 0 px. It proves the pose-hold band is reachable with this
     * project's own tools, which is why the three failing turn sets are art defects and not an
     * unreasonable standard.
     */
    it('the in-repo exemplar still holds 0 px, proving the band is reachable here', () => {
      const exemplar = scores.find((entry) => entry.group === 'spear-warrior-stop-turn')
      expect(exemplar?.xDirPx).toBe(0)
      expect(exemplar?.inDirPx).toBe(0)
    })
  })

  /**
   * INVARIANT 5 — world size is DERIVED from texture pixels (`docs/SPRITE-DESIGN-LOCK.md` `E3`).
   *
   * `entitySpritePresentation.ts` converts a frame to a rendered rect through one calibration
   * row per family. Two things can go silently wrong with that, and neither throws:
   *
   *   - a family nobody registered falls back to the 396x376 default and renders at the wrong
   *     scale (erlang's 640x512 sheets are 15% off that way, a turn set 21%);
   *   - a registered row carrying the wrong number renders wrong for exactly one animation
   *     state, which nobody notices until they watch the character switch into it.
   *
   * The band below is the gate on the second: for one character, every family it can draw must
   * put the same number of ALPHA-MEASURED pixels into one canonical height. That compares the
   * declared table against the art, so it cannot pass by agreeing with itself.
   */
  describe('derived world size per family', () => {
    /**
     * Every frame URL a sizing consumer draws, per character. Three sources, because three
     * scenes draw the same art: `walkKits` (adventure), `spriteSequences` (lobby + roster),
     * `battleSpriteSequences` (battle).
     *
     * NOT included: `ERLANG_SKILL_2_AURA_FRAMES` / `..._HOUND_FRAMES`, which are drawn by
     * `ErlangHoundSkillEffect` with its own sizing and deliberately live outside
     * `BattleSpriteSet` — see the comment at their declaration.
     */
    const bodyUrlsByKind = new Map<CharacterModelKind, string[]>(
      ALL_KINDS.map((kind) => {
        const walkKit = getWalkKit(kind)
        const sequence = getSpriteSequence(kind)
        const battle = getBattleSpriteSet(kind)
        const walkUrls = walkKit.walkPrefix
          ? LOCKED_TURN_ORDER.flatMap((direction) =>
              Array.from(
                { length: 8 },
                (_, frame) => `${walkKit.walkPrefix}-${direction}-${frame}.webp`,
              ),
            )
          : []

        return [
          kind,
          [
            ...walkUrls,
            ...Array.from({ length: 8 }, (_, i) => `${walkKit.turnPrefix}-${i}.webp`),
            ...Array.from(
              { length: walkKit.idleCount },
              (_, i) => `${walkKit.idlePrefix}-${i}.webp`,
            ),
            ...sequence.idleUrls,
            ...sequence.actionUrls,
            ...sequence.turnUrls,
            ...Object.values(battle).flatMap((animation) => Object.values(animation.frames).flat()),
          ],
        ]
      }),
    )

    /**
     * Textures a sizing consumer draws that are NOT a character body. They still need a
     * calibration row — `CharacterModel.tsx` used to stretch this one 37.9% wide — but they are
     * excluded from the height agreement below, because a halo has no alpha-measured body
     * height to agree about. Its size is a placement choice, and the row says so.
     */
    // Built through `publicUrl` exactly as `CharacterModel.tsx` builds it, base prefix and all.
    const NON_BODY_URLS = [publicUrl('characters/tripitaka-buddha-aura.webp')]

    it('every frame a sizing consumer draws has a calibration row of its own', () => {
      const uncalibrated = [...new Set([...bodyUrlsByKind.values()].flat())]
        .filter((url) => !calibrationFor(url))
        .map((url) => toPublicPath(url))

      expect([...new Set(uncalibrated)].toSorted()).toEqual([])
    })

    it('the non-body textures a sizing consumer draws are calibrated too', () => {
      expect(NON_BODY_URLS.filter((url) => !calibrationFor(url))).toEqual([])
    })

    /**
     * A row whose declared canvas disagrees with the files renders every frame of that family
     * at the wrong aspect AND the wrong size, since both are computed from these two numbers.
     */
    it('every calibration row declares the canvas its files actually ship', () => {
      // First match wins, exactly as the runtime lookup resolves it — `/characters/monkey-v2-`
      // also matches the idle sheet's filenames, and only the ORDER keeps them apart.
      const owned = new Map<string, FrameFile[]>()
      for (const file of files) {
        const row = calibrationFor(`/${file.publicPath}`)
        if (!row) continue
        const bucket = owned.get(row.pathFragment)
        if (bucket) bucket.push(file)
        else owned.set(row.pathFragment, [file])
      }

      const wrong = SPRITE_SHEET_CALIBRATIONS.flatMap((row) => {
        const rowFiles = owned.get(row.pathFragment) ?? []
        if (rowFiles.length === 0) {
          return [{ row: row.pathFragment, problem: 'owns no shipped file — dead or shadowed' }]
        }
        return rowFiles
          .map((file) => ({ file, frame: measure(file) }))
          .filter(
            ({ frame }) => frame.width !== row.canvasWidth || frame.height !== row.canvasHeight,
          )
          .map(({ file, frame }) => ({
            row: row.pathFragment,
            problem: `declares ${row.canvasWidth}x${row.canvasHeight}, ${file.publicPath} ships ${frame.width}x${frame.height}`,
          }))
      })

      expect(wrong).toEqual([])
    })

    /**
     * The `#100` gate. One character, one on-screen height, whichever state it is in.
     *
     * 2% is a LAYER C band — this project's own choice, no external source publishes one (see
     * the lock's unbounded register). It is set against what the corpus measures today: the
     * worst character spans 0.86% (`monkey-king`, widened by `monkey-pose`'s hand-tuned row),
     * the best 0.02%. Every defect this is meant to catch is an order of magnitude bigger — an
     * unregistered 640x512 family lands 15-21% out, the pre-fix adventure scene 81.5%.
     */
    const CANONICAL_HEIGHT_AGREEMENT_PCT = 2

    it('one character renders one canonical height, in every family it can draw', () => {
      const offenders = [...bodyUrlsByKind].flatMap(([kind, urls]) => {
        const byFamily = new Map<string, number[]>()
        for (const url of new Set(urls)) {
          const row = calibrationFor(url)
          const frame = measurements.get(toPublicPath(url))
          if (!row || !frame) continue
          const bucket = byFamily.get(row.pathFragment)
          const ratio = frame.charHeight / row.pixelsPerCanonicalHeight
          if (bucket) bucket.push(ratio)
          else byFamily.set(row.pathFragment, [ratio])
        }

        const perFamily = [...byFamily].map(([family, ratios]) => ({ family, ratio: mean(ratios) }))
        const ratios = perFamily.map((entry) => entry.ratio)
        const spreadPct = (Math.max(...ratios) / Math.min(...ratios) - 1) * 100
        return spreadPct > CANONICAL_HEIGHT_AGREEMENT_PCT
          ? [{ kind, spreadPct: +spreadPct.toFixed(2), perFamily }]
          : []
      })

      expect(offenders).toEqual([])
    })
  })
})
