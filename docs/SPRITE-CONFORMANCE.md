# SPRITE CONFORMANCE RECORD

**This repository, measured against `docs/SPRITE-DESIGN-LOCK.md`. Last measured 2026-08-11 against
master `a178e8e`.**

The design lock states the rules and carries no project data. This file states what this project ships,
where each value came from, and every place the project currently fails its own lock. Rule IDs (`L1`,
`A3`, `E1`, `B` …) refer to that document.

**Two labels are used throughout and never mixed:**

- **MEASURED-LIVE** — read off the running product in a browser, on production, in a real session.
- **COMPUTED** — derived from files or from other numbers. Correct arithmetic is not an observation.

---

## Frame inventory

Byte-level scan of every `.webp` under `public/characters`.

**Seven canvas sizes ship. An earlier reading assumed two, and several conclusions rested on that.**

| canvas      |   files | notes                               |
| ----------- | ------: | ----------------------------------- |
| 640 × 512   |     233 |                                     |
| 396 × 376   |      96 | the re-cropped set                  |
| 512 × 512   |      13 | **power-of-two** — relevant to `A2` |
| 800 × 640   |       6 |                                     |
| 1200 × 960  |       6 |                                     |
| 627 × 627   |       4 | odd on both axes                    |
| 1194 × 1317 |       1 | odd on both axes                    |
| **total**   | **359** | **13.11 MiB across 40 groups**      |

`A2` upper ceilings are not close: the largest shipped dimension is 1317 px against a 8192 px engine
ceiling — 6.2× headroom.

**"257 frames" has three meanings. State which one every time.**

| count | groups | what it is                                                      |
| ----: | -----: | --------------------------------------------------------------- |
|   257 |     10 | the adventure-scene preload set — 96 of them on 396 × 376       |
|   287 |     14 | everything referenced from code, including `spriteSequences.ts` |
|   359 |     40 | everything in the directory                                     |

---

## `L1` — aspect ownership · **VIOLATION**

Four consumers read the same art. An earlier reading counted three and described the fourth as
hypothetical; it already exists, and it is the one that gets this right.

| consumer                                      | pinned aspect                                 | status                               |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| `AdventureScene/WukongAdventure.tsx`          | none — derived per frame from the calibration | **CLOSED 2026-08-11**                |
| `CharacterRoster/CharacterPreview.module.css` | `.figure { aspect-ratio: 396 / 376 }`         | **OPEN** — see below                 |
| `LobbyScene/CharacterModel.tsx`               | none — derived per frame from the calibration | **CLOSED 2026-08-11**                |
| `BattleScene/EntitySprite.tsx`                | `ENTITY_SPRITE_ASPECT = 1.2508`               | correct — fed by a calibration table |

**Three of the four consumers no longer pin an aspect at all**, so for those three `L1` is met by
construction rather than by comment: the aspect comes out of the source canvas (`E3`), so it is right for
every canvas including ones nobody has drawn yet, and its provenance is the calibration row.

**The fourth still pins one, and it is fed art that does not match — `L1` is OPEN, not closed.**
`CharacterPreview` draws `getSpriteSequence(kind)` (`CharacterPreview.tsx:274-295`) into a box whose
aspect is pinned at `396 / 376` (`CharacterPreview.module.css:89-93`), with `object-fit: contain` on the
frame (`:126-137`). The comment at `:80-88` states the pin's provenance honestly — the union rect across
**three** characters — and `spear-warrior` was added afterwards. Its two sheets ship **640x512**:
`erlang-shen-v6-idle-*` and `spear-warrior-stop-turn-key-*` (`spriteSequences.ts:101-117`). `L1` requires a
pinning consumer to be either fed matching art or to carry a comment naming its source canvas; for this
one character, neither holds.

The consequence is measured, not inferred, and it is `#100`'s own defect class surviving in a consumer
this record had marked clear. Both sheets are the same canvas, so `contain` scales them identically and
the difference is purely what the art puts inside: alpha height **370 px** standing against **252 px**
turning. Open the roster on `spear-warrior` and drag to turn him and the character **shrinks 31.9%**
mid-drag (equivalently, standing renders **+46.8%** larger than turning) — the same 46.8% this repository
just closed for that character in the adventure scene. Against the other three he also renders about 28%
shorter in the same box.

Fixing the roster is a separate topic on the same table — `CharacterPreview` is 2D DOM, so it would take
`deriveSpriteSize` in CSS px exactly as `WukongAdventure` now does, making it the third consumer to read
the table rather than the second. What is recorded here is only that the rule is open, because a future
agent reading a closed `L1` stops looking.

**What was violated, kept for the record.** `CharacterModel` failed both halves at once:

1. **Aspect mismatch, COMPUTED: 18.738%** while a 396 × 376 sheet is displayed — which is the idle loop
   of 6 of 7 kinds, 72 frames. Its action frames (26) and all 33 spear-warrior frames are 640 × 512 and
   mismatch by 0.04%. **So it popped**: stretched during idle, snapping to 1:1 the instant an action
   frame played. **Never observed — the component was not located on screen during the live session.**
2. **Provenance missing** at both `:160` and `:164` — the crossfade mesh pair — so any compensation had
   to be applied twice or the two meshes would disagree. A third site (`:206`, the Tripitaka halo) had
   the same pair typed against a **portrait** 1194 × 1317 texture: a **37.9%** stretch, double the
   character figure, and the one nobody had counted.

---

## `L2` — record the crop, walk every consumer · **PARTIALLY SATISFIED**

`src/game/realtimeBattle/entitySpritePresentation.ts` already holds per-family canvas and anchor
constants, measured by alpha scan and covered by a test. **An earlier reading claimed the original
geometry survived only in git history and that this repo did not do what the industry does. Both were
false** — the mechanism exists, it just has one consumer.

### `ff67fb1` (2026-08-08) — cleared of the charge

The re-crop of 96 frames from 640 × 512 to 396 × 376 was suspected of destroying per-frame anchor
consistency. Measuring the same set before and after that commit:

```
monkey-turn, before ff67fb1 (640x512)   foot line spread 51px   foot centre spread 85px
monkey-turn, after  ff67fb1 (396x376)   foot line spread 51px   foot centre spread 85px
```

**Identical on both axes.** The crop used one rect for the whole set and preserved relative geometry
exactly — the behaviour the design lock names as anchor-preserving. The inconsistency was in the art
from the day it was drawn.

What `ff67fb1` actually omitted is the second half of `L2`: it updated its own consumer's pinned aspect
in the same commit and told **neither of the other two**.

---

## `E3` — derived world size · **all four consumers now use it** (closed 2026-08-11)

`src/game/realtimeBattle/entitySpritePresentation.ts` implements `E3` in full and has since before the
design lock existed. Its calibration record is exactly the shape the convention describes:

```ts
interface SpriteSheetCalibration {
  pathFragment: string
  canvasWidth: number
  canvasHeight: number
  /** Family-specific source pixels that equal one canonical world-space height. */
  pixelsPerCanonicalHeight: number
  /** Average transparent rows below the feet for this animation family. */
  bottomInsetPx: number
}
```

`pixelsPerCanonicalHeight` is Unity's `pixelsPerUnit` and Godot's `pixel_size` under a local name;
`bottomInsetPx` is `E1`'s foot offset in the same record, as `E3` requires. `ENTITY_SPRITE_HEIGHT = 1.6`
is the canonical world height each family converts into. **20 calibration rows are registered**, covering 21 of the 23 distinct file groups under `public/characters` — `aura` and `hound` are deliberately outside the table, as `spriteContract.test.ts` states at its own exclusion list. (An earlier revision of this paragraph said "18", then "23"; both counted file groups present rather than rows registered, and neither re-derived.) Every value
alpha-scanned rather than guessed.

**So this project did not copy the convention — it arrived at it independently, and the two vendors
corroborate the choice.** That is stronger evidence than adoption would have been, and it is why `E3`
is stated in the lock as a convergence rather than as an import.

| consumer                                      | conforms to `E3`                   | how                                                                                                                                                                                 |
| --------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BattleScene/EntitySprite.tsx`                | **yes**                            | reads the calibration table; `ENTITY_SPRITE_ASPECT` is a fallback, not the source of truth                                                                                          |
| `CharacterRoster/CharacterPreview.module.css` | **n/a** for `E3`, **OPEN** on `L1` | 2D DOM, so `E3`'s "sprite drawn into a 3D scene" does not reach it — but its pinned `aspect-ratio` is the DOM equivalent, and for `spear-warrior` it does NOT match the art (above) |
| `LobbyScene/CharacterModel.tsx`               | **yes**                            | `deriveSpriteSize(url, 3.213)` per family; unit planes scaled from it, at all three sites                                                                                           |
| `AdventureScene/WukongAdventure.tsx`          | **yes**                            | `deriveSpriteSize(url, 322.83)` per frame → the `<img>` width/height/bottom in CSS px                                                                                               |

**The scene's own constant is the only number each consumer types**, which is exactly what the lock
says a project must supply itself (`E3`: "the constant's value depends on the scene's own camera and
scale → Layer B"). Both were chosen to hold the reference sheet exactly where it already was:

```
LobbyScene       3.213  world units   = the height half of the old hand-typed 4.018 x 3.213 pair,
                                        which for a 396x376 sheet rendered at exactly that height
AdventureScene   322.83 CSS px        = 340 x 376/396, the height a 396x376 sheet got from
                                        object-fit: contain in the 340px-wide .actor box
```

So the standing pose — the first thing a player sees in either scene — is unchanged in height, and
every other state moves to meet it. **The walk frames were the wrong ones, not the standing ones.**

### The turnaround rows, measured twice

The four turnaround families had no row, so they fell to the 396 × 376 default. Measured during the
blocked dispatch and **re-measured independently 2026-08-11** by a fresh alpha scan (threshold 8,
`sharp`) — all eight numbers reproduced to the unit:

| family                    | canvas    | mean visible height | `pixelsPerCanonicalHeight` | `bottomInsetPx` |
| ------------------------- | --------- | ------------------: | -------------------------: | --------------: |
| `monkey-turn`             | 396 × 376 |              320.75 |     377 = 320.75 × 376/320 |    23 (of 22.5) |
| `pigsy-turn`              | 396 × 376 |              322.38 |     367 = 322.38 × 376/330 |    19 (of 18.5) |
| `tripitaka-turn`          | 396 × 376 |              335.75 |     406 = 335.75 × 376/311 |   25 (of 25.13) |
| `spear-warrior-stop-turn` | 640 × 512 |              252.00 |     296 = 252.00 × 376/320 |              37 |

The divisor is that character's own idle mean visible height — the rule the walk rows already used
(`monkey-walk` 296.11 × 376/320 = 348, the registered value, reproduced exactly). Erlang divides by
monkey's 320 rather than his own 370, as all his other rows do, which is what keeps him the taller god
he is drawn as. `spear-warrior-stop-turn-key` shares the row: both sets alpha-scan identically
(visible height 252, inset 37, on every frame of both).

**One discrepancy found and deliberately not fixed.** Three registered `bottomInsetPx` values read
about 2 px lower than a fresh scan of the same files: `monkey-v2-idle` declares 11 against 13,
`monkey-v2` 34 against 36, `monkey-walk` 62 against 63.72. The erlang and pigsy rows agree exactly.
Editing them would move the battle scene, which is a different topic on the same table — recorded
here instead. Its cost is bounded and stated below: the feet land within ~1.7 px of the anchor rather
than on it, consistently, in the same direction.

---

## `A3` — block compression · **N/A today**

The project ships WebP, not GPU-compressed textures. Binding on a mobile port or a move to
KTX2/Basis, at which point the specification is re-read rather than trusted from any page here.

Recorded so it is not re-derived: **two of the seven shipped canvases are odd on both axes**
(627 × 627, 1194 × 1317). Under the design lock's corrected reading this costs edge-block quality, not
encodability.

---

## `A-port P1` — RAM ceiling · **COMPUTED 98.18 MiB per character**

```
640 x 512  ->  1,310,720 B  =  1.25  MiB decoded
396 x 376  ->    595,584 B  =  0.568 MiB decoded

per character:  64 walk @ 640x512   80.00 MiB
                 8 turn @ 396x376    4.55 MiB
                24 idle @ 396x376   13.63 MiB
                                    -------
                                    98.18 MiB
```

An earlier reading gave 120 MiB by treating all 96 frames as 640 × 512 — the pre-`ff67fb1` shape, which
no shipped character matches.

**Ceiling, not usage.** Never measured; browsers evict decoded bitmaps.

---

## `A-port P2` — resolution floor · **COMPUTED, worst reachable case 2.89× after the `E3` fix**

The sprite is no longer sized by the `.actor` box; it is sized per family and then **multiplied by a
depth scale of 0.8–1.04**. So the floor must be computed per family, at the far end of that range.

| state, as it renders now    | rendered width | source width | upscale | DPR 3 floor |
| --------------------------- | -------------: | -----------: | ------: | ----------: |
| standing (`monkey-v2-idle`) |          340.0 |          396 |   0.859 |       2.68× |
| facing (`monkey-turn`)      |          339.1 |          396 |   0.856 |       2.67× |
| walking (`monkey-walk`)     |          593.7 |          640 |   0.928 |   **2.89×** |
| walking (`pigsy-walk`)      |          555.4 |          640 |   0.868 |       2.71× |
| facing (`pigsy-turn`)       |          348.3 |          396 |   0.880 |       2.74× |

**The fix costs 2.68× → 2.89× on the worst reachable state**, because the walk frames stopped rendering
at 53% of their source and now render at 93%. That is the price of the size fix and it is not hidden:
a walking character used to be 81.5% too small, which is why its floor looked good.

**Every reachable state is still a downscale** (max 0.928). **One unreachable state is not**:
`spear-warrior-stop-turn` derives to 698 px wide against a 640 px source — a **1.091× upscale**, DPR-3
floor **3.40×**. It cannot be shown today, because the adventure scene only offers characters with walk
frames (`walkKits.ts`, `walkPrefix: null` for erlang and tripitaka). **It becomes reachable the day
erlang gets his other seven directions**, and on that day this row is the one to look at first.

**None of these factors is an integer** — the condition Godot documents as distorting for this class of
art. **All COMPUTED. Nothing here was opened on a DPR-3 device.**

Two earlier errors, both corrected before this table: only the walk frames are 640 px wide, so 1.59×
was the **best** case quoted as the only case; and the box was treated as a flat 340 px when the depth
scale makes it a range.

---

## `B` — the project's own values

| slot                      | value     | provenance                                           |
| ------------------------- | --------- | ---------------------------------------------------- |
| walk canvas               | 640 × 512 | script lineage, 10 revisions in ~8 hours, 2026-08-06 |
| turn / idle canvas        | 396 × 376 | `ff67fb1`, cropped to serve `CharacterPreview`       |
| directions                | 8         | `DIRECTIONS` in `WukongAdventure.tsx:48-57`          |
| frames per walk direction | 8         | `FRAME_COUNT = 8`, line 29                           |
| turn frames               | 8         | numbered, see below                                  |
| idle frames               | 24        | shipped in 6 of 7 kits                               |

> An earlier reading called the canvas "two independent provenances" by counting
> `planeGeometry [4.018, 3.213]` as the second. It is not independent — the plane was derived **from**
> the canvas. One source, one consumer.

### `B2` — the turn set is addressed by NUMBER, and the order is load-bearing

`TURN_INDEX` maps direction to the file's trailing number directly:

```
0  down          4  up
1  down-right    5  up-left
2  right         6  left
3  up-right      7  down-left
```

**The walk set is addressed by NAME and the turn set by NUMBER, and the two orders differ.** A document
that lists directions starting at `up` and hands that list to an artist puts the up-facing pose in slot
0, where the code expects down-facing — **the whole game faces the wrong way, with no error**. This was
shipped in an external-facing document once and corrected.

### `B3` — idle sampling · the safe floor is 8, not 22 and not 19

`WukongAdventure.tsx:455` — `idleFrame = (view.frame * 3) % kit.idleCount`, and `view.frame` only ever
runs 0–7.

- **Reachable frames at `idleCount = 24`: {0, 3, 6, 9, 12, 15, 18, 21} — 8 of 24.**
  **16 frames are preloaded and never drawn in this scene.** They do serve `CharacterPreview`, which
  animates all 24.
- Idle playback is further limited to `direction === 'down'`; standing in any other facing shows a turn
  frame.
- Cadence 170 ms per step, so the visible loop is 8 frames / 1.36 s.
- **Safe counts: 8, 10, 11, 13, 14, 16, 17, 19, 20, and everything ≥ 22.** Unsafe: below 8, and 9, 12,
  15, 18, 21.

> This value has now been corrected twice — first from 22 to 19, then to 8. The 22 figure is where
> safety becomes _monotonic_, which is a different statement from the minimum. 24 remains the
> recommendation as the shipped convention; the code permits far more.

The constant `3` is explained nowhere in the repository and is the entire reason 24 became convention.

---

## `E1` — bottom-centre anchor · **the code half closed 2026-08-11; the art half still fails**

The adventure scene y-sorts by `zIndex: Math.round(view.y)`, so it already depends on a foot anchor
whether or not that was written down.

### Where the feet land now · **COMPUTED**

Each frame's `bottom` is placed so the family's declared foot line falls on the `.actor` box's ground
anchor, 356 — the same point `transform-origin: 50% 356px` and the `-356px` translate already used, and
6 px below the shadow ellipse's centre (`bottom: 52px`, height 36 → centre 350).

```
declared feet   356.0000 box units, all ten adventure families, exactly    (was 386.1 - 408.8)
true alpha feet 354.28 - 356.44, a 2.16 px band around the anchor          (was a 22.7 px band,
                                                                            30 - 53 px BELOW it)
```

The residual 2 px is the `bottomInsetPx` discrepancy recorded under `E3` above — three monkey rows
declare an inset about 2 px shallower than the files measure. It is consistent in direction and size
across states, which is the property that matters: the character no longer changes its footing when it
starts walking.

**Not observed. This is arithmetic over an alpha scan, not a browser.** The live measurement below is
what the old numbers came from, and no equivalent session has been run since the fix.

### What was measured live, before the fix

**MEASURED-LIVE**, production, logged in, DPR 1.25, box 309.7 × 382.5 under
`matrix(0.910769, 0, 0, 0.910769, 594, 184.195)`:

|                                                   | box units (of 420) | viewport px at scale 0.9108 |
| ------------------------------------------------- | -----------------: | --------------------------: |
| code anchor (`transform-origin: 50% 356px`)       |                356 |                       540.2 |
| shadow ellipse centre (`bottom: 52px`, height 36) |                350 |                       534.7 |
| feet, standing                                    |              408.8 |                       588.3 |
| feet, walking                                     |              385.5 |                       567.5 |

**Confirmed by eye.** With the sprite dimmed and `.shadow` outlined, the shadow sits across the
character's thighs. In normal view no ground shadow is visible at all — the character's own body covers
it (shadow `z-index: 1`, sprite `z-index: 3`).

**The gap changes by 20.8 px when walking starts**, while the head drops ~91 px. The character does not
merely change size; its footing shifts against the ground.

### Foot-line and foot-centre spread, measured per set

Measured on the **foot band** — the bottom 12 rows of alpha, i.e. the ground-contact patch. Whole-
silhouette centre is the wrong instrument: a staff or tail moves the bounding box without moving the
feet.

| set                           | kind |                            foot-line spread | foot-centre spread |
| ----------------------------- | ---- | ------------------------------------------: | -----------------: |
| `monkey-v2-idle`              | idle |                                           0 |                  0 |
| `tripitaka-idle`              | idle |                                           0 |                  0 |
| `erlang-shen-v6-idle`         | idle |                                           0 |                5.5 |
| `pigsy-idle`                  | idle |                                           1 |                  3 |
| **`spear-warrior-stop-turn`** | turn |                                       **0** |                8.5 |
| `spear-warrior-stop-turn-key` | turn |                                           0 |                 32 |
| `pigsy-turn`                  | turn |                                          12 |                 25 |
| `tripitaka-turn`              | turn |                                          31 |                 88 |
| `monkey-turn`                 | turn |                                          51 |                145 |
| `monkey-walk`                 | walk |  2 in-direction · **1.1 across directions** |  43.5 in-direction |
| `pigsy-walk`                  | walk | 12 in-direction · **5.6 across directions** |    49 in-direction |

**`spear-warrior-stop-turn` holds 0 px on the foot line and is the in-repo exemplar** — the one turn set
`ff67fb1` never touched. It proves the standard is reachable here.

**For walk sets, read the across-directions column, not the in-direction one.** A foot legitimately
lifts during a stride; what should not move is where each direction's cycle sits relative to the others.

### Scored against the anchor tolerance register — every shipped group

The design lock's anchor tolerances were built from external corpora only (314 sets, character
heights 24-82 px) and this project's art was scored against them afterwards. Building the ceiling
from a pool containing the sets under judgement would let the defective sets widen the band meant to
catch them.

**21 groups measured · 15 PASS · 4 FAIL · 2 deliberately unclassified.**

A turn set is eight single-frame directions, so it is the **xDir pose-hold** case: the body is
planted in every frame and only the facing changes. Ceiling ±1 px.

| group                                | kind       | canvas   |      inDir |    xDir | verdict                      |
| ------------------------------------ | ---------- | -------- | ---------: | ------: | ---------------------------- |
| `monkey-turn`                        | pose-hold  | 396×376  |      51 px |   51 px | **FAIL — 51× over**          |
| `tripitaka-turn`                     | pose-hold  | 396×376  |      31 px |   31 px | **FAIL — 31× over**          |
| `pigsy-turn`                         | pose-hold  | 396×376  |      12 px |   12 px | **FAIL — 12× over**          |
| `pigsy-walk`                         | locomotion | 640×512  |      3.69% | 5.63 px | **FAIL — 2.8× over on xDir** |
| `monkey-v2-idle`                     | pose-hold  | 396×376  |          0 |       — | PASS                         |
| `tripitaka-idle`                     | pose-hold  | 396×376  |          0 |       — | PASS                         |
| `erlang-shen-v6-idle`                | pose-hold  | 640×512  |          0 |       — | PASS                         |
| `pigsy-idle`                         | pose-hold  | 396×376  |       1 px |       — | PASS                         |
| `spear-warrior-stop-turn`            | pose-hold  | 640×512  |          0 |   **0** | PASS                         |
| `spear-warrior-stop-turn-key`        | pose-hold  | 640×512  |          0 |   **0** | PASS                         |
| `monkey-walk`                        | locomotion | 640×512  |      0.68% | 1.13 px | PASS                         |
| `erlang-shen-attack-v1`              | action     | 640×512  |          0 |       — | PASS                         |
| `erlang-shen-skill-2-cast`           | action     | 800×640  |          0 |       — | PASS                         |
| `monkey-v2`                          | action     | 640×512  |          0 |       — | PASS                         |
| `pigsy-team`                         | action     | 640×512  |      0.59% |       — | PASS                         |
| `erlang-shen-normal-attack-v3-final` | action     | 640×512  |      2.82% |       — | PASS                         |
| `erlang-shen-normal-attack-v2`       | action     | 640×512  |      3.78% |       — | PASS                         |
| `erlang-shen-skill-1`                | action     | 640×512  |      7.89% |       — | PASS                         |
| `monkey-attack-new`                  | action     | 1200×960 | **22.79%** |       — | PASS — narrowly, ceiling 23% |
| `aura`                               | —          | 512×512  |      3.14% |       — | **UNCLASSIFIED**             |
| `hound`                              | —          | 512×512  |     34.97% |       — | **UNCLASSIFIED**             |

**The three turn sets are the worst conformance failures in the repository**, and they fail the
strictest band there is — the one for animations where the body does not move at all, so nothing
about the animation excuses the drift. `spear-warrior-stop-turn` holds 0 px on both axes and
proves the band is reachable here, with this project's own tools.

`monkey-attack-new` is the case that justifies keeping two different kinds of ceiling.
Measured in absolute pixels it drifts 129 px and would read as a 14× failure; measured as a fraction
of its own character height it is 22.79% against a 23% ceiling, and passes. A larger character's
swing really does cross more pixels, and forcing one formula across both alignment error and
depicted movement would have condemned correct art.

**Two groups carry no verdict on purpose.** `aura` and `hound` could not be classified
into an animation kind from their names and code references with confidence, and the kind decides the
ceiling — a wrong kind silently applies the wrong standard, which is worse than no verdict. They need
a human to say what they depict before they can be scored.

### Lossless frames still shipping

Five groups, **3,546 KiB**, all VP8L: `aura`, `hound`, `erlang-shen-skill-1`,
`erlang-shen-skill-2-cast`, `erlang-shen-normal-attack-v3-final`. Any rule forbidding
lossless is violated by this repository on the day it is written; either the exception is stated or
these are re-encoded.

---

## PRESENT — PR #113, measured against the same lock

> head `DemoGODRTX/LegendOfSoulTH-1@466e1e8b` · open at the time of this measurement.
> Full point-by-point review: see the reviewer's conformance note for that PR.

**This is the first PR in this repository to satisfy L1 the way the lock intends.** It ships three
different canvases for one character and registers each one in the calibration table, rather than
forcing the art to one size or letting a pinned aspect stretch it.

| set                     | kind       | canvas  |                 foot line | ceiling | verdict |
| ----------------------- | ---------- | ------- | ------------------------: | ------: | ------- |
| `monkey-king-v4/idle`   | pose-hold  | 640×512 | **0 px across 12 frames** |   ±1 px | PASS    |
| `monkey-king-v4/attack` | action     | 640×640 |              7 px = 2.11% |   ≤ 23% | PASS    |
| `monkey-king-v4/run`    | locomotion | 512×512 |             13 px = 4.53% |   ≤ 27% | PASS    |

Its declared calibration reproduces under an independent alpha scan: visible heights 390.75 / 332.00 /
286.85 match to two decimals, and the declared bottom insets (31 / 20 / 113) all fall inside the
measured per-frame ranges (31 exactly on all 12 idle frames; 16-23 for attack; 105-118 for run).

**Two things this raises for the code, not for the art.** `bottomInsetPx` is one value per family, so
a 20-frame run set whose inset genuinely ranges 105-118 is represented by its mean — the structure
cannot express what the art does. And the new test computes the rendered foot position **from the same
literals the calibration declares**, so it proves the arithmetic rather than the alignment; it would
pass unchanged if every frame were redrawn 20 px higher. Both are the code's limits, exposed by art
precise enough to reach them.

**A new canvas enters the repository with this PR**: 640×640, an eighth distinct size. Not a violation
on the current browser target, but recorded here because every shipped canvas gets re-examined the day
this project moves to GPU-compressed textures.

---

## FUTURE — what makes the lock hold

Nothing on this page was caught by a gate until 2026-08-11. Every number here came from someone
deciding to measure.

**`src/game/spriteContract.test.ts` is what converted this document from a snapshot into a check**
(#101, landed `aceb6c5`; a fifth invariant added with the `E3` fix). Everything it asserts is
computable from the shipped files alone, so these findings are CI failures now rather than prose:

```
1  canvas per prefix     one set, one canvas — a stray frame renders silently at the wrong size
2  paths and counts      every pinned path resolves, and the pinned count is what ships, both ways
3  direction order       turn set addressed by NUMBER, walk set by NAME, and the orders differ
4  anchor tolerance      foot-line drift inside the band for the animation kind, four pinned failures
5  derived world size    every drawn family is calibrated, and one character is one height (+-2%)
```

Invariant 5's band is **Layer C** — this project's own choice. Measured spread today: 0.02% best
(`pilgrim-monk`), 0.86% worst (`monkey-king`, widened by `monkey-pose`'s hand-tuned row). Every defect
it exists to catch is an order of magnitude larger.

**What the gates still do not reach**, and the honest reason for each:

```
CSS regressions      the stylesheet is not evaluated in jsdom. Re-adding `inset: 0` to `.sprite`
                     would over-constrain the derived `bottom` and un-anchor the feet, and NO test
                     goes red. Proven by injecting exactly that.
the lobby's 3D side  CharacterModel is R3F; there is no WebGL context in the test environment, so
                     nothing asserts its plane geometry. Only the shared table underneath it is gated.
a consumer opting    nothing stops a future consumer from typing its own width and height again.
out entirely         The consumer table above is still the only check on that, and it is a person.
hand-placed props    the lobby's effects and hitbox are positioned by hand, not derived, so they do
                     not follow the sprite. See the named consequences immediately below.
```

**What moved relative to the sprite when its feet dropped to `y=0`, and did not follow it.** Putting the
feet on the ground raised the character by **+0.1195 local / +0.0956 world**. Four hand-placed things in
`CharacterModel.tsx` kept their own coordinates:

```
:308  palm glow      [0.7, 1.48] — 59.6% -> 55.1% of Tripitaka's body height, a slide of 0.12 local
:325  the 3 waves    [0.7, 1.48] — same origin, same slide
:295  the halo       rose only +0.0915, because its bottomInsetPx (50/1317) differs from the body's
                     (11/376) — a 0.028 relative drop against the character it frames
:94   the click box  [0, 0.95], height 2.1 — head overshoot grows from ~0.09 to ~0.19 world units,
                     so the top of the head stops being clickable
```

All four are cosmetic and none is a regression against a state anyone has seen: this scene has never been
located on screen in a live session (see the browser gap above). They are recorded so that the first
person who does open it finds them written down rather than discovers them.

The standing obligations that no test can carry:

```
new art          scored against the anchor tolerance register before merge, by kind
new consumer     derives its size from the calibration table (E3), or states why it cannot
re-crop          records the original geometry and walks every consumer, same commit (L2)
new canvas       recorded in the inventory above; the count is now eight
new family       gets a calibration row in the same commit that first draws it — invariant 5 will
                 fail the build otherwise, which is the intended way to find out
```

**And the ceilings are not targets.** They come from corpora whose characters are 24-82 px tall and
which cannot resolve finer than one pixel. Art drawn at several hundred pixels has an order of
magnitude more room, and the sets in this repository that were made carefully measure **0**.

---

**No external tolerance exists for any of these numbers** — see the design lock's unbounded register.
The band is a project decision and is **still open**.

---

## Size discontinuity · **was MEASURED-LIVE +81.5% · closed 2026-08-11**

Both states were sampled at an identical box and transform, so the source canvas was the only variable:

```
standing   396 x 376   alpha height 320   x 0.78207  =  250.3 px on screen
walking    640 x 512   alpha height 285   x 0.48391  =  137.9 px on screen
                                          250.3 / 137.9 = +81.5%
```

Across characters and frames the range was **+55.8% to +81.5%** — the low end pigsy, the high end
monkey. An earlier reading quoted "56–79%", a band that contained neither its own stated inputs nor the
measured value.

**It was never fixable by re-normalising the 96 frames**: `ff67fb1` cropped them deliberately for
`CharacterPreview`, which consumes all 24 idle frames correctly. The fix had to satisfy all four
consumers at once, which is what `E3` does — the art is untouched and the size comes out of the table.

### After · **COMPUTED**, alpha-scanned visible height per family × the calibration

On-screen character height in `.actor` box units, across every family a character can show in the
adventure scene:

| character                   | before (idle / turn / walk) |     spread | after (idle / turn / walk) |    spread |
| --------------------------- | --------------------------- | ---------: | -------------------------- | --------: |
| `monkey-king` / `nezha`     | 274.7 / 275.4 / 157.3       | **+75.1%** | 274.7 / 274.7 / 274.7      | **0.03%** |
| `pig-warrior` / `sand-sage` | 283.3 / 276.8 / 172.6       | **+64.1%** | 283.3 / 283.6 / 282.0      | **0.55%** |
| `spear-warrior`             | 196.6 / 133.9 / —           | **+46.8%** | 274.6 / 274.8 / —          | **0.09%** |
| `pilgrim-monk` / `archer`   | 267.0 / 288.3 / —           |  **+8.0%** | 267.0 / 267.0 / —          | **0.02%** |

The same fix in the lobby, where the pop was between idle and action rather than idle and walk:

```
monkey-king     27.4%  ->  0.18%
pig-warrior     31.8%  ->  0.16%
spear-warrior    7.4%  ->  0.03%
```

**The residual sub-1% is the table's integer rounding**, not art drift: `pixelsPerCanonicalHeight` is a
whole number by convention, so a family lands within half a source pixel of its neighbours rather than
exactly on them. `pigsy-walk` is the widest at 0.55% because its registered 372 came from a scan
reading 326.34 where this one reads 324.97.

**Not observed.** No browser session has been run since the change; these are the alpha-measured
heights of the shipped files put through the shipped calibration.

---

## Delivery · **MEASURED-LIVE, then fixed 2026-08-11**

### What was measured

`WukongAdventure.tsx:81-86` and `:237` — `preload()` was `new Image()` per URL, fired for every frame at
once, with no batching and no priority hint. The `Image` objects were discarded immediately.

```
peak            96 requests inside one second, starting t = 748 ms after navigation
re-fetch        144 requests for 97 distinct URLs = 1.48x
                (idle: 54 requests for 24 files)
per character   96 files, 2.43 MiB on disk, 98.18 MiB decode ceiling
```

### What changed

One change per measured number, in the same file. **Nothing here touches which frames exist** — the
sampling stride and `idleCount` are task #102 and are unchanged.

| was                               | now                                                            |
| --------------------------------- | -------------------------------------------------------------- |
| every URL in one tick             | queue, at most **4 in flight**, next starts on load _or_ error |
| no priority hint                  | `fetchPriority = 'low'` on every preload request               |
| all 24 idle frames                | the 8 this scene can draw, from `idleFrameIndex`               |
| a re-run re-requests the same set | module-level requested-set — each URL requested once           |
| walk first, idle last             | idle → turn → walk, the order the scene actually draws them    |

The sampling expression now lives in **one** function that both the renderer and the preload list call,
so the set that is fetched cannot drift from the set that is drawn. The 24 idle frames are not dead —
`CharacterPreview` animates all of them; they are simply not fetched by a scene that reaches 8.

**COMPUTED** from the shipped files — the preload set per character:

```
monkey-king   96 -> 80 files   2,548,798 -> 2,074,844 B   -462.8 KiB  -18.6%
pig-warrior   96 -> 80 files   2,687,110 -> 1,915,798 B   -753.2 KiB  -28.7%
```

monkey-king's 2,548,798 B is the 2.43 MiB quoted above, reproduced to the byte.

**What is NOT claimed.** No memory saving: 98.18 MiB was a decode ceiling and never a measurement, so
nothing derived from it is one either. The live request timeline has **not** been re-measured — a
browser session is the only instrument for that. What is verified without a browser is the pattern the
code emits: how many URLs, which ones, how many concurrently, in what order, and whether a re-run
re-requests them. `WukongAdventure.test.tsx` pins all five, and each of the three defects was
re-injected to confirm the test goes red (96-at-once → red, all-24-idle → red, no requested-set → 160
requests for 80 URLs → red).

**Cache**: shipped frames return `cache-control: max-age=600` — ten minutes — and filenames carry **no
content hash**, so the lifetime cannot be extended without hashing first. The JS/CSS bundles already get
hashed names from the build; the character art does not. **Untouched by the above** — a preloaded frame
that outlives the TTL is re-fetched exactly as before (#108).

**Compression**: 43 of 359 frames are **VP8L lossless** — 3.55 MiB, **27% of the art payload**, all in
one family. A rule forbidding lossless would be violated by the repository on the day it was written;
either the exception is stated or those files are re-encoded.

---

## Open violations

| #   | rule     | what                                                                    |
| --- | -------- | ----------------------------------------------------------------------- |
| 108 | delivery | `max-age=600` on unhashed immutable art                                 |
| —   | `E1`     | three turn sets fail the pose-hold band by 12×/31×/51× — **art defect** |
| —   | `B3`     | the sampling constant `3` is undocumented                               |
| —   | delivery | 43 lossless frames vs an unwritten no-lossless rule                     |

**The rest are held pending the owner's sprite go-ahead.** The lock ships; conformance mostly does now.

**Closed 2026-08-11 — #107** (`L2` / delivery), the one violation that was purely the code's own
scheduling and needed no art decision: the burst, the re-fetch and the 16 undrawn frames are all gone,
and the policy is pinned by test. See the Delivery section above for what is and is not claimed. It is
also the reason **#107 no longer carries the 8-vs-12 run-cycle question with it** — see below.

**Closed 2026-08-11 — #101**: `src/game/spriteContract.test.ts`. Five invariants, computable from the
shipped files alone, every one proven by re-injecting the defect it catches.

**Closed 2026-08-11 — #100 and #106**, and the two unnumbered `L1` rows with them. One mechanism, one
commit: `deriveSpriteSize()` in `entitySpritePresentation.ts`, five new calibration rows, and the two
consumers that never read the table now reading it. Size spread per character 8.0–75.1% → 0.02–0.55%;
declared feet 386.1–408.8 → 356.0000. The **art half of `E1` is untouched and still fails** — a table
cannot fix a turn set whose own frames disagree by 51 px, and that stays with the owner's sprite
go-ahead.

**What this cost, stated rather than buried**: the walk frames now render at 93% of source instead of
53%, so the DPR-3 resolution floor on the worst reachable state goes **2.68× → 2.89×**, and one state
that cannot be reached today (`spear-warrior-stop-turn`, no walk frames for erlang) would render as a
**1.091× upscale** if it ever could be. See `A-port P2`.

---

## Still unobserved

| quantity                          | status                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| everything the `E3` fix changed   | COMPUTED — no browser session has been run since the change   |
| `CharacterModel` on screen at all | the component has still never been located in a live session  |
| DPR floor, now 2.89×              | COMPUTED — never opened on a DPR-3 device                     |
| RAM in use                        | never measured; 98.18 MiB is a decode ceiling                 |
| run-cycle frame count, 8 or 12    | undecided — `FRAME_COUNT = 8` constrains it internally        |
| foot-line tolerance band          | open — no external source exists, so it is a project decision |

**The first row is the one to read.** The size discontinuity and the knee-height shadow were both
MEASURED-LIVE; their fix is arithmetic over an alpha scan and a test suite. The character is now
computed to stand at one height with its feet on the anchor — nobody has looked at it.

The 8-vs-12 row is still undecided, but it is **no longer a delivery argument**. It was being weighed
partly on what 32 more frames per character would do to the 96-request burst; the burst is now a 4-deep
queue, so more frames lengthen the queue instead of widening the spike. That removes a reason against
12 — it supplies no reason for it. What is left is how the walk cycle should look, which is the owner's.
