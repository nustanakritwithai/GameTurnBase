# Legend of Soul TH — Master Blueprint v3.0

> **Document type**: Product Specification + Master Blueprint + Agent Work Contract  
> **Status**: ADOPTED as Product Baseline (documentation PR — no gameplay implementation in the same change)  
> **Operator**: HetCreep (Ring 0 — live direction lock, 2026-08-07)  
> **Agent author**: Cursor Agent (cloud)  
> **Created**: 2026-08-07  
> **Source**: HetCreep baseline refinement — supersedes v2.0 in-flight direction  
> **Scope**: Documentation / Governance / Audit / Migration Roadmap only  
> **Companion**: [`BLUEPRINT_V3_MIGRATION_AUDIT.md`](BLUEPRINT_V3_MIGRATION_AUDIT.md)  
> **Supersedes**: [`MASTER_BLUEPRINT_v1.0.md`](MASTER_BLUEPRINT_v1.0.md) · v2.0 draft/PR direction · [`BLUEPRINT_GAP_ANALYSIS.md`](BLUEPRINT_GAP_ANALYSIS.md)

---

## How agents must use this document

1. This file is the **Product North Star** and **locked decision record**.
2. Agents **must not reinterpret** locked decisions below.
3. Conflicting code → **AUDIT, DOCUMENT, CLASSIFY** — no gameplay rewrites in a docs PR.
4. Implementation = **separate PRs**, **one topic = one PR**.
5. Items marked **DEFERRED** or **CUT** must not be reintroduced without explicit HetCreep approval.
6. Do not delete legacy code blindly — migration audit first.

---

## One-line definition (LOCKED)

> **Legend of Soul TH** is a **Stage-based 2.5D Hero Collection Action RPG** using **2D HD Sprites** from diverse literature and legends. Players move up/down/left/right to align attacks, fight with **Basic Attack + 3 Skills + Ultimate**, clear stages and bosses, collect heroes via gacha, raise stars and develop characters, then enter **1v1 Ranked PvP** later.

---

# §1 — Product identity

## 1.1 Genre & pillars

| Pillar                    | Focus                       |
| ------------------------- | --------------------------- |
| **PvE Adventure** (first) | Chapter/stage progression   |
| **Hero Collection**       | Core long-term engagement   |
| **Ranked PvP** (later)    | 1v1 matchmaking by rank/MMR |

Combat genre: **Stage-based 2.5D Action RPG** — realtime, positioning-based, mobile-friendly.

## 1.2 Universe of Legends (LOCKED)

The game is **not** “Ramakien only.”

- **Brand framing:** **Universe of Legends** — heroes from literature, myth, and public-domain character sets.
- **Ramakien** may be the **first Chapter / Series** — not the entire product ceiling.
- Hero roster must scale to **many distinct characters** — art capacity is **not** the primary bottleneck; **gameplay identity** is.

## 1.3 Visual standard

- **2D HD Sprite** characters in combat — **not** 3D / GLB character pipeline.
- Lobby/environment 3D (if any) is presentation only — not the character production path.

---

# §2 — Core loop (LOCKED)

```
Adventure → Stage → Combat → Clear
    → EXP / Material / Currency
        → Hero Upgrade
            → Gacha → Hero / Star
                → Harder Stages
```

**Early phase:** rewards are **EXP, materials, currency** — **not** gear-hunt loot.

---

# §2.1 — Explicitly CUT from scope (early / current baseline)

Do **not** plan or implement these until HetCreep reopens them:

| CUT                          | Notes                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------- |
| **Loot RPG** (gear hunt)     | Deferred — prove combat + stage loop first                                      |
| **Equipment random affix**   | Deferred                                                                        |
| **Set bonus**                | Deferred                                                                        |
| **Talent tree**              | Deferred                                                                        |
| **Awakening**                | Deferred                                                                        |
| **MMORPG / Open World**      | Never                                                                           |
| **3D character pipeline**    | Never for heroes                                                                |
| **Hero switching mid-stage** | Never                                                                           |
| **Skill 4 button**           | CUT — use **3 Skills + Ultimate**                                               |
| **Separate Dash button**     | CUT — dodge/mobility via skills or movement design, not a dedicated dash button |

---

# §3 — Combat model

## 3.1 Movement & coordinates (LOCKED)

- Field: **2.5D plane**
- Move: **left, right, up, down, diagonal** (joystick vector OK)
- **Up/down = depth** positioning to align with enemies
- Movement and attack direction are **separate systems**

**Canonical battle coordinates (LOCKED — backfill P1 contract, matches shipped `src/game/realtimeBattle/battleCoordinates.ts`):**

| Axis                           | Runtime meaning                                | Notes                                                                        |
| ------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| **battle X**                   | Horizontal left / right                        | Combat logic, collision, AI, hitboxes                                        |
| **battle depth** (`runtime.y`) | Screen-plane up / down (front ↔ back on arena) | Lower = farther from camera / back lane; higher = nearer camera / front lane |

**Rendering contract:** presentation layer maps battle coordinates → Three.js world axes (`runtime.x` → `worldX`, `runtime.y` → `worldZ`; `worldY` = height only). **Combat logic must not use raw render Z/Y as depth** — always use canonical battle X + battle depth.

## 3.2 Attack axis (LOCKED)

- Primary attacks face **LEFT or RIGHT only**
- **Not** 360° attack
- Depth alignment required: horizontal range + **depth tolerance** (not pixel-perfect Y)

## 3.3 Controls — mobile (LOCKED)

| Left             | Right            |
| ---------------- | ---------------- |
| Virtual joystick | **Basic Attack** |
|                  | **Skill 1**      |
|                  | **Skill 2**      |
|                  | **Skill 3**      |
|                  | **Ultimate**     |

**Layout (LOCKED 2026-08-07):** joystick **bottom-left**; **S1 · S2 · S3 · Ultimate** in a row **above** the attack button; **Basic Attack** = **largest button, bottom-right**. Walk and press Attack/Skill simultaneously (separate pointer ids).

**Button presentation (LOCKED 2026-08-07):**

- **Basic Attack:** **icon only** (no text label on button)
- **Skills S1–S3 / Ultimate:** numeric/icon slots — **art icons TBD** (placeholder until assets land)
- **Ultimate when gauge empty:** button **pressable but no effect** (no disabled state required)

**PC keybinds (LOCKED):**

| Action                      | Keys                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Movement**                | `W` `A` `S` `D` **and** Arrow Keys — **equivalent to virtual joystick**; diagonal from simultaneous keys |
| **Attack**                  | `J` / `Space`                                                                                            |
| **S1 / S2 / S3 / Ultimate** | `1`/`E` · `2`/`R` · `3`/`F` · `4`/`Q`                                                                    |

**No separate Dash button.**

**No soft-target, no auto-snap, no hard lock-on UI.** See §3.6.

PC: keyboard/mouse/controller-ready; same action layer.

## 3.4 Skills

- **3 skills + 1 ultimate** per hero (baseline kit)
- Skills may use varied hit shapes (line, projectile, AOE, etc.) — not limited to horizontal basic-attack box
- Mobility/evasion may live **inside skills**, not a global dash button

## 3.5 Facing & assets

- Combat facing: **LEFT / RIGHT**
- **RIGHT master sprite** → horizontal flip for LEFT when symmetric
- Movement sprites: L/R/U/D; diagonal optional

## 3.6 Combat Foundation Design Lock (LOCKED — HetCreep Ring 0, 2026-08-07)

> **Status:** Design contract for P4 (Enemy AI) and P6 (Boss).  
> **Closes gap:** fork issue [#33](https://github.com/nustanakritwithai/GameTurnBase/issues/33) (boss telegraph/state-machine + soft-target).  
> **Implementation:** separate PRs only — this section is documentation, not gameplay code.

### 3.6.1 Controls & targeting

| Rule                                         | Decision                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Mobile layout                                | Joystick left + S1/S2/S3/U + large Attack bottom-right (§3.3)                                |
| Dash button                                  | **CUT** — not in UI                                                                          |
| Soft-target / auto-snap / hard lock (global) | **CUT** for basic movement, facing, and basic attack — player positions depth + L/R manually |
| Skill-specific target lock                   | **Allowed per skill definition only** (e.g. Ultimate — see §3.7); not a global assist        |
| `combatFacing` source                        | Movement / joystick vector                                                                   |
| Vertical-only movement                       | **Keep previous facing** (no auto flip)                                                      |
| Walk + Attack/Skill                          | **Allowed** simultaneously                                                                   |

### 3.6.2 Basic attack

- **Multi-target:** every enemy inside the active hitbox takes damage — **not** single-target selection.
- **No target magnet:** attacks do not pull the player toward enemies.
- **Attack lunge:** on press, character moves **slightly forward** along `combatFacing`. This is **lunge**, not magnet.
- **Flow:** `Movement → Attack Wind-up/Lunge → AttackActive → Recovery`

### 3.6.3 Movement during combat

- Player may **press Attack while walking**.
- During **AttackActive**, **no 100% free movement** — attack animation/lunge drives position to prevent unnatural hitbox dragging through enemies.

### 3.6.4 Skill casting

- Skills support **cast delay / wind-up** before AttackActive.
- **Flow:** `Input → Cast/Wind-up → AttackActive → Recovery`
- During cast/wind-up: if hit by an **interruptible** attack → **cancel cast** → `Casting → Interrupted → Hit Reaction`
- **Do not** hard-code “every skill interrupts the same.” Per-move properties govern behavior.

### 3.6.5 Normal hit reaction

When hit by a **normal/basic** attack:

`Hit → Small Knockback → Short Hitstun → Resume`

- Small backward push + brief stun.
- **Knockdown is NOT** the default for every normal hit.

**Knockdown reserved for:** heavy attacks, specific skills, combo finishers, elite/boss rules.

### 3.6.6 Interrupt rules

Interrupt capability is a **per-attack property**, not a global rule.

**Forbidden:** “getting hit always cancels everything.”

Future **hyper armor / uninterruptible** windows are allowed per move design.

### 3.6.7 Per-move property contract (LOCKED schema)

Every attack/skill definition should carry its own data (extend `AttackDefinition` / skill defs in implementation PRs):

| Property                                | Purpose                                                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startupMs` / `activeMs` / `recoveryMs` | Phase timing (existing)                                                                                                                                    |
| `castDelayMs`                           | Wind-up before active (skills; basic may be 0 or folded into startup)                                                                                      |
| `interruptible`                         | **Default** — can this move be cancelled by incoming hit? (usually one bool per move)                                                                      |
| `phaseOverrides`                        | **Optional** — per-phase overrides when phases differ: `cast` / `startup` / `active` / `recovery` each may set `interruptible`, `movementDuringCast`, etc. |
| `movementDuringCast`                    | Allowed movement while casting (usually none or reduced)                                                                                                   |
| `lungeDistance`                         | Forward displacement on attack (basic attack lunge)                                                                                                        |
| `hitstunMs`                             | Stun applied to target on hit                                                                                                                              |
| `knockback`                             | Push distance (existing)                                                                                                                                   |
| `knockdown`                             | Whether this move can knock down                                                                                                                           |
| `multiTarget`                           | Hit all in box vs single target (basic = true)                                                                                                             |
| `hitShape` / `range` / `depthTolerance` | Hit geometry (existing P2 model)                                                                                                                           |

**Schema rule (LOCKED):** use `interruptible` as the **move-level default**. Add `phaseOverrides` **only** when a specific phase must differ (e.g. uninterruptible clone/setup, then interruptible strike phases). **Do not** require phase-interruptible data on every move — keeps per-move data-driven and scales to boss kits.

**P4 enemy moves use the same schema** as player attacks/skills.

Boss/enemy attacks additionally define: `telegraphMs`, `attackShape`, phase eligibility.

### 3.6.8 Enemy tiers & state machine (LOCKED)

#### Enemy tiers

| Tier           | Definition                                        | AI core                       | Knockdown                                                                         | Notes                                                                         |
| -------------- | ------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Normal mob** | Default P4 enemy                                  | Shared Enemy AI core          | **No** (P4 baseline — hitstun only)                                               | Ground telegraph marker                                                       |
| **Elite**      | **Between normal mob and boss** — not a mini-boss | **Same Enemy AI core as mob** | **Per-move flag** — elite can be knocked down / apply knockdown when move says so | May add cast bar, enhanced telegraph, per-move knockdown/armor, extra moveset |
| **Boss**       | Stage boss / multi-phase fights                   | Boss state machine + phases   | Per-move + boss rules                                                             | Cast bar, phase transitions (§3.6.9)                                          |

**Elite default:** **no phase system** — elites are tougher mobs with richer telegraphs/movesets, not shrunken bosses.

#### State machine (all enemy tiers)

Core loop:

`Idle → Chase → Telegraph → AttackActive → Recovery → Chase`

Interruption states:

`Hit → (Knockdown → GetUp → Chase)` when rules allow

| State                 | Notes                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| **Telegraph**         | Wind-up; player reads danger before damage                            |
| **AttackActive**      | Damage window                                                         |
| **Recovery**          | Punish window                                                         |
| **Knockdown / GetUp** | Elite/boss (and specific moves) — **not** default for normal mob hits |

**Telegraph feedback layers:**

1. **Ground marker** (required) — on 2.5D floor plane
2. **Cast bar** (boss / elite)
3. **Sprite tint** (wind-up → active)
4. **SFX / screen edge** (optional later; respect `prefers-reduced-motion`)

Each boss attack is its own data row: telegraph/active/recovery duration, shape, interruptible, damage, knockback, knockdown.

### 3.6.9 Boss phase transition (LOCKED)

When HP crosses a threshold (e.g. 50%):

**Do not** cut the current action immediately.

**Flow:** `Current Action → Finish Current Action → PhaseTransition → Invulnerable → Phase 2`

During **PhaseTransition:**

- Boss stops attacking
- Plays transition animation
- **Invulnerable**
- Swaps attack set for new phase
- Enters Phase 2 only after transition completes

Prevents state-machine collisions between Telegraph/AttackActive/Recovery and phase change.

### 3.6.10 Explicitly OUT of this foundation

Do **not** add while implementing P4/P6 foundation:

- Dash button
- Soft-target / auto-target / **global** lock-on UI
- QTE dodge
- Heavy 3D telegraph VFX (markers + tint first)

Combat remains a **2.5D positioning-based brawler:** player controls **movement + depth + facing + attack timing**.

### 3.6.11 Basic Attack Combo System (LOCKED — HetCreep Ring 0, 2026-08-07)

| Rule                 | Decision                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Hit count**        | **3 hits** per combo chain                                                                                                            |
| **Combo window**     | **Keep current implementation** (~700 ms window per chain step — tune in playtest)                                                    |
| **Combo reset**      | Stop attacking → may **start again at hit 1** as soon as the next attack input is valid (no extra decay timer beyond recovery/window) |
| **Finisher (hit 3)** | **Per-character** — defined in each hero's kit data (e.g. stronger, longer range than normals/skills); not one global finisher rule   |
| **Cancel rules**     | **No cancel** between basic-attack combo and skills (cannot skill-cancel combo or attack-cancel skill)                                |
| **Input buffer**     | **Keep current** — buffer early input, never skip recovery                                                                            |
| **Animation**        | **Full sprite set** for every combo phase (startup / active / recovery per hit)                                                       |

### 3.6.12 Initial combat tuning (baseline — playtest & adjust)

HetCreep: set sensible defaults first; **values below are starting points**, not final balance.

| Parameter                          | Initial value                              | Notes                                                              |
| ---------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `lungeDistance` (basic, per hit)   | 32 / 36 / 44                               | Hit 1 → 2 → 3; hit 3 slightly longer                               |
| `hitstunMs` (normal basic on hit)  | 200                                        | Short stun before resume                                           |
| `knockback` (basic)                | keep `attacks.ts` chain values             | Tune in playtest                                                   |
| `castDelayMs` S1 / S2 / S3 / Ult   | 0\* / 250 / 320 / 480                      | \*S1 folded into existing startup                                  |
| `interruptible` (default skill)    | `true` during cast                         | Per-skill override in kit                                          |
| `interruptible` (Ultimate wind-up) | `false` during clone/setup phase           | Monkey King ult — see §3.7; per-strike phases use `phaseOverrides` |
| `movementDuringCast` (default)     | `none`                                     | S3 leap uses skill-driven displacement, not free walk              |
| Mob `telegraphMs`                  | 280                                        | Normal melee enemy                                                 |
| Boss `telegraphMs`                 | 800–1200                                   | Per attack row                                                     |
| Knockdown on normal mob            | **no**                                     | P4 mobs use Hit stun only                                          |
| Knockdown                          | elite/boss + heavy moves + combo finishers | Per move flag                                                      |
| Boss phase threshold               | **50% HP**                                 | **2 phases** baseline                                              |
| `getUp` i-frames                   | 200 ms                                     | After knockdown                                                    |

### 3.7 Reference hero kit — หนุมาน / Monkey King (LOCKED baseline)

First vertical-slice kit. Other heroes follow the same **per-hero kit file** pattern.

| Slot         | Name (TH)              | Design                           | Implementation notes                                                                                                                                                   |
| ------------ | ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Basic**    | โจมตีปกติ              | 3-hit combo, multi-target, lunge | §3.6.11; finisher hit 3 tuned per §3.6.12                                                                                                                              |
| **S1**       | กระบวนทองคำ            | Spinning staff (existing)        | Radial AoE — already shipped                                                                                                                                           |
| **S2**       | กระบองตีระยะไกล        | Long-range staff strike          | Horizontal or line hit; **no** target lock                                                                                                                             |
| **S3**       | กระโดดพุ่งทุบ          | Leap jump → slam                 | Skill-driven leap displacement; slam on landing                                                                                                                        |
| **Ultimate** | แยก 4 ร่าง → พุ่งโจมตี | Clone split → rush               | **`targetLock: 'nearest'`**; clone/setup wind-up **uninterruptible**; each of 4 strike phases follows **per-phase rules** via `phaseOverrides`; not global soft-target |

**Ultimate exception:** only this skill (and future skills explicitly flagged `targetLock: 'nearest'`) may auto-pick a target. Basic attack and S2/S3 still use manual facing/positioning unless their kit row says otherwise.

**Ultimate interrupt model:** `interruptible: false` at move default for clone/setup; strike phases may override individually (e.g. active = interruptible, recovery = not).

**Next design gate (OPEN):** per-hero finisher tuning tables and additional hero kits beyond Monkey King.

---

# §4 — Hero collection & progression

## 4.1 Collection (LOCKED — central pillar)

- Gacha unlocks heroes; duplicates → **star ascension**
- Heroes must differ by **archetype / gameplay**, not reskins with same kit

**Target archetype examples:** Fighter, Ranged, Control, Summoner, Heavy, Assassin, Support, or unusual legend-inspired kits.

**Anti-pattern:** 50 heroes with identical gameplay.

## 4.2 Early progression (LOCKED — simplified)

Only these layers in **phase 1**:

```
Hero Level → Star → Skill Level
```

**Deferred:** Talent, Awakening, Equipment, Loot affixes, Set bonus.

## 4.3 Star balance note (LOCKED)

- ★1 must be **fully playable** (complete core kit)
- Duplicate value via star ascension
- **Power gap between star tiers must be bounded** — especially for PvP fairness (see §6)

---

# §5 — Adventure & stages

## 5.1 Structure (LOCKED)

```
Chapter → Stage → Stage → … → Boss
Example: 1-1 → 1-2 → 1-3 → 1-4 → 1-5 Boss → Chapter 2 …
```

- Pick **one hero** before stage; no mid-stage switch
- Normal stage target: **2–5 min**; boss: **5–8 min**

## 5.2 Stage variation types (LOCKED — HetCreep Ring 0, 2026-08-07)

> **Closes gap:** fork issue [#48](https://github.com/nustanakritwithai/GameTurnBase/issues/48)  
> **P5 gate:** contract + runtime framework before stage-specific content tuning.

**Not every stage is Wave → Wave → Elite.** Goal: **positioning and vertical movement matter** — not repetitive arena waves.

**Architecture rule:** stage type is a **data/config contract** — do **not** create a separate combat engine or AI core per type. Reuse P4 systems (Enemy AI, movement, targeting, damage, interrupt, knockdown) and canonical battle coordinates (§3.1 — hazard zones must use battle X/depth, never raw render Z/Y). Elite/Mini-boss encounters use §3.6.8 Elite contract.

**Stage layer responsibility:**

`Stage Config → Objective → Spawn Rules → Runtime Condition Tracking → Win/Lose Resolution → Stage Result`

### Shared stage contract

Every stage row should conform to this schema (implementation may use TypeScript equivalents):

```ts
interface StageVariation {
  stageType: 'survival' | 'defend' | 'chase' | 'hazard' | 'miniBoss' | 'timeAttack' | 'custom'

  winCondition: StageCondition
  loseCondition: StageCondition

  timer?: {
    mode: 'none' | 'countdown' | 'countup'
    timeLimit?: number
  }

  params: Record<string, unknown>

  spawn?: {
    pattern: string
    baseRate?: number
  }
}
```

Numeric values (HP, wave count, spawn rate, timers, difficulty scaling) are **per-stage tuning** — not Ring 0 architecture locks.

### 1. Survival

**Goal:** survive multiple enemy waves.

| Outcome  | Condition                                                       |
| -------- | --------------------------------------------------------------- |
| **Win**  | Clear all enemies in the **final** wave (`totalWaves` complete) |
| **Lose** | Player/party HP = 0                                             |

**Baseline params:** `totalWaves`, `waveInterval`, `timeLimit` (optional), `enemyScaling`, `spawnPattern`

**Rule:** stage ends when the **last wave is cleared**, not when the last wave spawns.

### 2. Defend

**Goal:** protect an objective from enemies.

| Outcome  | Condition                                                                 |
| -------- | ------------------------------------------------------------------------- |
| **Win**  | Objective HP > 0 when time expires **or** all reinforcement/waves cleared |
| **Lose** | `objectiveHP <= 0` **or** player/party wiped                              |

**Baseline params:** `objectiveHP`, `timeLimit`, `enemySpawnRate`, `reinforcementWaves`

### 3. Chase

**Goal:** catch and defeat a target before it escapes.

| Outcome  | Condition                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| **Win**  | `targetHP <= 0` before target reaches escape point                                                                 |
| **Lose** | Target reaches `escapeThreshold` / escape point **or** player/party wiped **or** time expires (if `timeLimit` set) |

**Baseline params:** `targetHP`, `escapeThreshold`, `timeLimit` (optional), `spawnBlockers`

### 4. Hazard

**Goal:** fight while managing environmental danger.

**Hazard is a stage modifier** on the primary objective — not a new combat system.

| Outcome  | Condition                                                                       |
| -------- | ------------------------------------------------------------------------------- |
| **Win**  | Primary stage objective succeeds                                                |
| **Lose** | Player/party wiped (enemy or hazard damage) **or** objective fail condition met |

**Baseline params:** `hazardDamagePerSec`, `safeZoneCount`, `hazardPhaseChange`, `timeLimit` (optional)

**Coordinate rule:** hazard zones use §3.1 battle-coordinate contract — combat logic must not use raw render Z/Y.

### 5. Mini-boss

**Goal:** defeat mini-boss / elite encounter(s).

| Outcome  | Condition                                                   |
| -------- | ----------------------------------------------------------- |
| **Win**  | All mini-bosses defeated                                    |
| **Lose** | Player/party wiped **or** time expires (if `timeLimit` set) |

**Baseline params:** `bossHP`, `enrageTimer` (optional), `minionSpawn`, `timeLimit` (optional)

**Rules:** uses P4 enemy/combat schema + §3.6.8 Elite tier — **no new AI core** for this stage type.

### 6. Time Attack

**Goal:** complete objective as fast as possible.

| Outcome  | Condition                                                                               |
| -------- | --------------------------------------------------------------------------------------- |
| **Win**  | `targetGoal` achieved                                                                   |
| **Lose** | Player/party wiped **or** hard time limit reached (when stage uses countdown fail mode) |

**Baseline params:** `targetGoal`, `timeLimit`, `scoreRule`, `comboBonus` (optional)

Time may feed rank/score (clear time, remaining-time bonus).

### 7. Custom

**Use only** when a stage cannot be expressed by the six standard types above.

| Outcome        | Condition                    |
| -------------- | ---------------------------- |
| **Win / Lose** | Explicitly defined per stage |

**Baseline params:** `customRulesetId`, `customParams`, `scripts/events`

**Rule:** do **not** use `custom` to bypass standard stage types.

### P5 scope lock

**P5 must implement** stage-variation contract + runtime framework (condition tracking, win/lose resolution).

**P5 does not require yet:**

- Stage-specific cinematics
- Advanced formations
- Complex scripted sequences
- Unique pathing per stage type
- Custom AI cores
- Final numerical balancing
- Full production stage content library

## 5.3 Rewards (early)

- **EXP, materials, currency** on clear
- No gear/affix drops in early phase

---

# §6 — PvP (later phase)

## 6.1 Mode (LOCKED)

- **Single ranked system** — no separate Casual/Normalized modes at launch
- Flow: **Select Hero → Queue → Match by Rank/MMR → 1v1 → Win/Lose → Rank update**

## 6.2 Matchmaking philosophy

- Match **within rank band** first; expand search if queue waits
- Rank band reduces raw power mismatch but **does not replace** star-gap balance design
- When tuning numbers: **limit star power gap** so ★6 does not auto-win vs ★1 in the same rank

## 6.3 Combat core

Same 2.5D movement + L/R attack + 3 skills + ultimate as PvE.

---

# §7 — Monetization (direction)

- **Core:** Hero Gacha + star ascension
- **Secondary (later):** skins, season pass, starter pack, convenience — TBD
- **Must not:** sell best power primarily via direct purchase
- Premium one-time purchase model: **SUPERSEDED** (v1.0)

---

# §8 — Backend

- **Not** MMO / open world / zone server
- Target: Client → Game API → modules → database
- Valuable data (account, heroes, stars, currency, gacha, rank, MMR) → **server authority**
- Supabase work in repo is **early seam** toward this — not full game authority yet

---

# §9 — Art strategy (LOCKED)

- Art team can support **high hero volume** — use that advantage
- Invest in **distinct kits and quality**, not duplicate gameplay
- 2D sprite pipeline; no 8-direction attack sprites

---

# §10 — Development roadmap (LOCKED sequence)

Dependency guide — **not** “build everything now”:

| Priority | Track                                                                  |
| -------- | ---------------------------------------------------------------------- |
| **P0**   | Blueprint v3 (this document)                                           |
| **P1**   | Movement / Depth                                                       |
| **P2**   | Basic Combat (L/R attack, depth alignment, hit model)                  |
| **P3**   | 3 Skills + Ultimate framework                                          |
| **P4**   | Enemy AI                                                               |
| **P5**   | Stage 1-1 vertical slice (§5.2 variation contract + runtime framework) |
| **P6**   | Boss prototype                                                         |
| **P7**   | Chapter / Stage system                                                 |
| **P8**   | Hero Level / Skill progression                                         |
| **P9**   | Gacha / Stars                                                          |
| **P10**  | Hero Collection expansion                                              |
| **P11**  | PvE content expansion                                                  |
| **P12**  | PvP prototype                                                          |
| **P13**  | Matchmaking / Rank                                                     |
| **P14**  | Monetization / Shop (basic)                                            |
| **P15**  | Live content                                                           |

**Deferred past early phase:** Loot RPG, equipment affix, set bonus, talent, awakening.

---

# §11 — Vertical slice A (first playable target)

Before wide systems:

- **1 hero** (e.g. หนุมาน) — production 2D sprite
- Movement: L/R/U/D + diagonal input; depth alignment
- Combat: L/R basic attack, **3 skills + ultimate** (no dash button)
- **2–3 enemy types**
- **Stage 1-1:** Start → Fight → Clear → EXP/material/currency reward (may use any §5.2 `stageType` — simplest slice: `survival` or `miniBoss`)

---

# §12 — Engineering governance

1. **One topic = one PR**
2. Docs PR = classify only
3. Update `MEMORY.md` when direction/contracts change
4. Sync fork/upstream before implementation PRs
5. After docs PR: **stop for review**

---

# §13 — Source of truth

| Layer             | Document                               |
| ----------------- | -------------------------------------- |
| Product direction | `docs/MASTER_BLUEPRINT_v3.0.md`        |
| Migration reality | `docs/BLUEPRINT_V3_MIGRATION_AUDIT.md` |
| Project memory    | `MEMORY.md`                            |
| Implementation    | Source code                            |
| Verification      | Tests                                  |

---

# §14 — Superseded directions (history)

| Prior                                                 | Status                           |
| ----------------------------------------------------- | -------------------------------- |
| Blueprint v1.0 (premium, dungeon-only)                | SUPERSEDED                       |
| Blueprint v2.0 (4 skills + dash, loot RPG in roadmap) | SUPERSEDED by v3                 |
| Turn-based                                            | SUPERSEDED                       |
| Top-down combat                                       | LEGACY in code — migrate         |
| 360° attack                                           | SUPERSEDED                       |
| Ramakien-only product ceiling                         | SUPERSEDED → Universe of Legends |

---

_Operator: HetCreep · Agent: Cursor Agent (cloud) · 2026-08-07_
