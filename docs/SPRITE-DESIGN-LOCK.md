<!--
  LICENCE NOTICE — THIS FILE ONLY

  Copyright (c) 2026 HetCreep / Katomnoi Studio. All rights reserved.

  This file is licensed under Creative Commons Attribution-NonCommercial-NoDerivatives 4.0
  International (CC BY-NC-ND 4.0): https://creativecommons.org/licenses/by-nc-nd/4.0/
  It is NOT covered by the MIT licence that governs the rest of this repository.

  Commercial use, adaptation, or redistribution as part of a paid product or service requires a
  separate written licence from the copyright holder.

  STANDING GRANT — Katomnoi Studio (github.com/KatomnoiStudio)
  Katomnoi Studio is granted a perpetual, irrevocable, royalty-free licence to use, reproduce,
  modify, and create derivative works from this file, and to apply it in the Studio's own products
  and services, including commercially.
  This grant deliberately does NOT include the right to sublicense the file, or to distribute the
  file or substantial portions of it to third parties. MIT would include both, and either one would
  release the document to anyone who received it — which is what the CC BY-NC-ND terms above exist
  to prevent. The Studio may ship what it BUILDS from this document freely; the document itself
  stays the copyright holder's to license.

  ⚠️ DRAFT — NOT LEGAL ADVICE. Written by an AI assistant at the owner's direction and NOT reviewed
  by a lawyer. Two things a lawyer must settle before this is relied on:
    1. Earlier revisions of this file were published in a public MIT-licensed repository. An MIT
       grant already made cannot be withdrawn for copies already distributed. This notice binds
       future revisions; it does not reach back.
    2. The named holder must be a real legal person or registered entity. "LegendofSoulTH" in the
       repository LICENSE is a project name, which is weak for enforcement.
-->

# SPRITE DESIGN LOCK

> **Licence — this file only.** © 2026 HetCreep / Katomnoi Studio.
> Released under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/), **not** under
> the MIT licence covering the rest of this repository. Commercial use or adaptation requires a
> separate written licence. See `LICENSE` for the carve-out, and the comment above for what a lawyer
> still has to settle.

**Locked by HetCreep (Ring 0) on 2026-08-11. Binding on both sides of this project: the code that
renders sprites, and the people who draw them.**

This is a locked decision in the sense of `AGENTS.md` rule 15 — agents do not renegotiate it, and a PR
that contradicts it is converted at intake, not filed as debt. `docs/MASTER_BLUEPRINT_v3.0.md` remains
the product-decision source of truth above it; this document governs sprite geometry and the asset
contract only.

**This file is a TEMPLATE and carries no project data.** It defines the rules, the layers, and every
tolerance that has a published external source. What this project actually ships — its canvas sizes,
its frame counts, its consumers, its measured numbers, and where it currently fails these rules — lives
in `docs/SPRITE-CONFORMANCE.md`. The separation is deliberate: a specification outlives the thing it
specifies, and mixing the two is how a spec quietly becomes a description of whatever was built.

**Terminology is kept in English throughout.** These are technical terms with exact referents; a
translation would create two vocabularies for one contract.

---

## How to read this

Every value is filed under **who locks it**, and that is the whole point.

| layer      | who locks it                            | may an agent change it?                       |
| ---------- | --------------------------------------- | --------------------------------------------- |
| **A**      | the graphics API / hardware             | no — violating it breaks at the API level     |
| **A-port** | the target device (RAM, DPR, renderer)  | no — measure again per target                 |
| **L1–L4**  | **the owner, 2026-08-11**               | no — owner ruling required                    |
| **B-ext**  | external convention with real precedent | only with a named counter-exemplar            |
| **B**      | this project's own measurement          | only by re-measuring the corpus               |
| **C**      | nobody                                  | free — but say so, and never quote it as spec |

### Three standing rules, binding on every future edit to this file

1. **Every value states who locked it.** A value nobody locks is written as unlocked, never promoted to
   spec to make a table look complete.
2. **A number measured live and a number computed carry different labels, always.** This document was
   wrong for a day because that line was blurred.
3. **Every citation states whether it is a specification, a vendor document, a tool default, or a
   recommendation.** They do not weigh the same. This document has already mis-attributed a tutorial
   sentence to "the spec" once.

> **Provenance.** The first edition was written from one person's measurement alone. It was then handed
> to an adversarial verification pass over every claim it made — **96 claims: 44 held, 50 corrected, 2
> unverifiable** — and the live product was opened in a browser and measured. A second sweep then went
> looking for published external tolerances across engine importers, atlas packers, store requirements,
> perceptual standards, community sprite standards, and graphics API specifications: **172 published
> values found, 72 quantities with no published source, 12 overclaims caught by a sceptic.**
> Every point where an earlier edition was wrong is annotated as wrong rather than quietly deleted.

---

# Layer A — locked by specification, not by us

## A1 · Aspect ratio belongs to geometry, not to the file

**Correct wording:** UV coordinates **carry no aspect-ratio information**, therefore aspect must be
carried by geometry.

> An earlier edition wrote "UV space is always 0–1". That is wrong. 0–1 is the default convention and
> the only one WebGL/WebGPU exposes, but it is not a rule at the GPU level: Vulkan offers
> `VkSamplerCreateInfo::unnormalizedCoordinates = VK_TRUE` and Metal offers
> `constexpr sampler s(coord::pixel, …)`. The new wording survives on every API; the old one does not.

> A second earlier claim — "pixel size stops meaning anything once uploaded to the GPU" — is also
> wrong. Only the **aspect ratio** stops being carried. Pixel size still governs mip/LOD selection,
> `texelFetch`/`textureSize` addressing, sampling density against screen pixels, and VRAM footprint.
> A-port's RAM ceiling and DPR floor are both arguments that pixel size matters very much.

**Rule.** Any consumer that pins an aspect ratio must either be fed art of a matching aspect, **or**
compensate explicitly with a comment naming the source canvas. **Every pinned aspect number must state
its provenance.**

**External corroboration at BREAKS_IF_VIOLATED strength**, inside a vendor's own pixel-exact pipeline:

> "After importing your textures into the project as Sprites, set all Sprites to the same Pixels Per
> Unit value."
> — Unity 2D Pixel Perfect package 5.0, _Pixel Perfect Camera_ (VENDOR_DOC)

A single px→world scale shared by every sprite in a scene is the same invariant this rule states, from
the other direction.

## A2 · Power-of-two and NPOT — a recommendation, not a requirement

Power-of-two dimensions are recommended by every engine and required by none on a modern target.

> "Ideally, Texture dimension sizes should be powers of two on each side (that is, 2, 4, 8, 16, 32, 64,
> 128, 256, 512, 1024, 2048 pixels (px), and so on)."
> — Unity Manual, _Import a texture_ (RECOMMENDATION)

The cost is stated rather than hidden: NPOT textures "generally take slightly more memory and might be
slower for the GPU to sample."

**The failure mode worth knowing**, because it changes the geometry underneath the art without telling
anyone:

> "If the platform or GPU does not support NPOT Texture sizes, Unity scales and pads the Texture up to
> the next power of two size."
> — Unity Manual, _Import a texture_ (VENDOR_DOC)

**On WebGL1 specifically**, NPOT textures are usable only with `NEAREST`/`LINEAR` filtering, no mipmaps,
and `CLAMP_TO_EDGE` wrapping. Violating that yields **opaque black** — RGBA (0,0,0,255) — not
transparent black.

> An earlier edition attributed the NPOT sentence to "the spec" while quoting MDN tutorial prose, and
> stated the failure colour as transparent black. Both were wrong. The distinction is practical: someone
> debugging looks for a missing sprite, when the symptom is a black rectangle.

**A2 is a conditional external owner of canvas size.** It binds nothing on a WebGL2/WebGPU target. It
returns in full the day a render target regresses to WebGL1.

## A3 · Block compression — no divisibility requirement

> **This is where an earlier edition was most seriously wrong.** It asserted that ASTC requires the
> texture dimensions to be a multiple of the block size, built a divisibility table on that assertion,
> and concluded that a future mobile port could not compress part of the shipped art.
>
> ASTC has no such requirement. Edge blocks are padded and the padding is discarded on decode; the data
> size is `ceil(w / bw) × ceil(h / bh) × 16` bytes for any `w`, `h`.
>
> The multiple-of-four rule that does exist belongs to **BCn on Direct3D 11 and earlier** — a different
> format family on an API this project does not target.

**Honest weakness, recorded rather than hidden:** the external sweep could not reach a Khronos
_specification_ stating the padding behaviour. The correction above is corroborated at **vendor level
only** (block-compression documentation from tooling vendors). It should be cited as such — not as
"the spec says" — which is the same discipline A2 just failed once.

**What differs between canvases at a given ASTC footprint is bitrate and edge-block quality, not
encodability.**

**Not applicable while the project ships an uncompressed web image format.** It binds on a port to
mobile or a move to GPU-compressed containers, and **on that day the specification must be re-read
rather than trusted from this page.**

---

# Layer A-port — variables that appear when a device target is chosen

## P1 · RAM ceiling

Compute the decode ceiling as `frames × width × height × 4` bytes (RGBA8). State it as a **theoretical
ceiling**, never as measured usage — browsers evict decoded bitmaps, and nothing on the page can observe
the eviction policy.

**No external source bounds the acceptability of that ceiling.** No vendor publishes a per-application
texture-RAM budget for a browser tab; the real limit is set by the device, the tab count, and an
eviction policy the page cannot see.

## P2 · Resolution floor

Compute the required device pixels as `CSS box width × devicePixelRatio`, and compare against the source
width **for the state actually on screen** — a project with different canvases per animation state has a
different floor per state, and the worst case is the one that matters.

**Include any runtime scale factor in the box width.** A box that is multiplied by a perspective or
depth scale does not have one width, it has a range, and the floor must be computed at the end of the
range that demands the most pixels.

**External finding worth carrying:** non-integer upscale factors are documented as a distinct defect for
this class of art, and at least one engine ships a floor() to prevent them.

> Godot 4 documentation, _Multiple resolutions_ (RECOMMENDATION) — integer scaling is offered precisely
> because fractional scaling distorts pixel-exact art.

## P3 · Render target

A WebView port keeps the same renderer and the same contract. A native-engine port changes the whole
pipeline, and **per-frame metadata becomes more valuable, not less**, because every engine already
expects a pivot/offset per sprite.

---

# The locked rules — L1 to L4

> **What is locked is the mechanism, never a project's numbers.**

## L1 · Aspect ownership

Any consumer that pins an aspect ratio must (a) be fed matching art, or (b) compensate explicitly with a
comment naming the source canvas. **Every pinned aspect number must state its provenance.**

Both halves are binding. An implementation that satisfies (a) or (b) but leaves the number unexplained
has met half of L1.

## L2 · Crop for one consumer, record it, and walk every other consumer

Cropping or resizing shipped art obliges two things in the **same** commit:

1. record the original geometry — the source canvas and what was trimmed — somewhere other than version
   control history;
2. enumerate every consumer of that art and state the effect on each.

**External convergence, stated at the strength the evidence actually supports:** several independent
tools converge on the _concept_ of keeping the untrimmed frame of reference in metadata — Aseprite
(`sourceSize` / `spriteSourceSize`), libGDX (`offsetX` / `originalWidth`), Unity (`Sprite.pivot` in
import metadata).

> The sceptic pass flagged an earlier overclaim here: the convergence is real **about the concept** and
> loose **about the field names**, which differ per tool. Cite the mechanism, not a shared schema.

**Why the record matters, in the tools' own terms:** a trim that keeps one frame of reference preserves
the anchor across frames; a trim that discards it desynchronises every frame by its own trimmed amount.
That is the difference between a uniform crop and a per-frame tight crop, and it is invisible until the
animation plays.

## L3 · The contract carries across platforms unchanged

| target                         | L1                    | L2                                           |
| ------------------------------ | --------------------- | -------------------------------------------- |
| browser, WebGL2 / WebGPU       | binding               | binding                                      |
| WebView (Capacitor / Cordova)  | binding — same engine | binding                                      |
| native engine (Metal / Vulkan) | binding               | binding, and per-frame metadata matters more |

It carries because **UV coordinates carry no aspect information on any API** — not because "UV is always
0–1" (see A1).

## L4 · Stores govern texture FORMAT and non-texture asset GEOMETRY

**Textures.** No store publishes a dimension or aspect requirement for in-app textures. What a store
governs is the delivered **format**, and there is one hard failure worth stating plainly: an Android App
Bundle that targets texture compression formats without shipping a default-format directory is
**uninstallable** for any device that matches none of the targeted formats.

**Non-texture assets — and this is where an earlier edition was dangerously loose.** Both stores mandate
exact pixel geometry for submitted listing assets. An unqualified "stores don't touch geometry" is read
by an art side as covering everything they hand over.

See the tolerance register below for the published numbers.

> **L4's facts are external and they move.** Device-fleet percentages, supported format lists, and
> accepted screenshot sizes must be re-checked at the moment a port is decided, not trusted from this
> page. **L1–L3 need no such re-check** — normalized texture coordinates date from OpenGL 1.0 (1992).

---

# Layer B-ext — external conventions, adoptable with citation

## E1 · Bottom-centre anchor, on the feet

For a project that sorts sprites by their ground position, the anchor belongs at the horizontal centre
of the bottom edge, on the feet.

> `SpriteAlignment.BottomCenter` — "Pivot is at the center of the bottom edge of the graphic rectangle."
> — Unity ScriptReference (VENDOR_DOC)

**The load-bearing argument is y-sorting, not the citation.** Sorting by the centre of the bounding box
makes tall and short characters swap depth against each other even when their feet are correctly
ordered; sorting by the foot position does not. Any project whose renderer already sorts by ground
position is already relying on this convention whether or not it wrote it down.

> **Two corrections to how earlier editions argued this.**
>
> **Bottom-centre is a real convention but it is NOT the industry default.** Tool defaults across the
> external sweep are centre, corner, or bottom-centre depending on vendor — cocos2d-x, for one, defaults
> to centre (0.5, 0.5) when a pivot is omitted. Adopt bottom-centre on the y-sort argument, and do not
> claim the industry has settled on it.
>
> An earlier edition cited Tiled in support. That citation **argues the other way**: Tiled defaults tile
> objects to bottom-_left_ in every orientation except isometric. It may only be cited by a project that
> explicitly treats its own view as isometric for this purpose.

## E3 · World size is DERIVED from texture pixels, never hand-authored

A sprite drawn into a 3D scene — a billboard, a camera-facing quad, a textured plane — must take its
world dimensions from a stated conversion between texture pixels and world units, declared **per sprite
family**. It must not carry a hand-typed width and height.

> `Sprite.pixelsPerUnit` — "The number of pixels in the Sprite that correspond to one unit in world
> space."
> — Unity ScriptReference (VENDOR_DOC)

> `SpriteBase3D.pixel_size` — "The size of one pixel's width on the sprite to scale it in 3D."
> Default `0.01`.
> — Godot 4 documentation (VENDOR_DOC)

Two engines from unrelated lineages expose the same mechanism under different names, and neither offers
a way to type a world width directly on a sprite. That convergence is the evidence; the names are
incidental.

**Why this is interop and not taste.** A hand-authored width/height pair encodes two independent facts
in one place: the aspect ratio and the absolute size. Change the art's canvas and the pair is wrong on
aspect; change it to fix the aspect and the character silently resizes. A derived pair has neither
failure: aspect is correct for **any** canvas, including canvases nobody has drawn yet, and size stays
where the constant puts it. This is the same invariant `L1` states, enforced by construction rather
than by remembering.

**The pivot travels in the same record.** Scale alone puts a sprite at the right size in the wrong
place. The per-family entry must also carry the foot offset — how far the art's contact point sits from
its canvas edge — because that is what lands the feet on the ground (`E1`). One family, one scale, one
offset, read together.

**What this convention does NOT give you**, and must not be pretended to:

```
the constant's value          depends on the scene's own camera and scale       -> Layer B
where the feet sit per family depends on how each piece of art was drawn        -> Layer B
```

Both are recovered by measuring the project's own corpus, once, per family — not by citation.

## E2 · The anchor must survive trimming

Whatever anchor a project adopts, it must be expressed in a frame of reference that trimming cannot
move — i.e. relative to the untrimmed source rect, not to the trimmed bounding box. This is the
mechanical half of L2 and the reason `sourceSize`-style metadata exists at all.

---

# Layer B — locked by the project's own measurement

**No external standard fixes a sprite canvas in pixels.** The sweep checked engine importers, atlas
packers, store requirements, community sprite standards, and graphics API specifications; the only
external bounds on canvas dimensions are **upper ceilings** (see the register) and the NPOT
recommendation. Everything between those ceilings is a project decision.

A project fills these slots in its conformance document, each with its provenance:

- canvas dimensions, per animation set
- frame count per direction, and direction count
- direction-to-index mapping for any set addressed by number
- animation-set lengths and playback cadence
- the anchor's position inside the canvas

**A value enters Layer B only with a corpus measurement behind it, not a rationale.**

---

# Layer C — locked by nobody

Values in this layer are legitimate, are chosen by the project, and **must never be quoted as
specification**. A project's conformance document lists its own; the classes that always land here are
enumerated in the unbounded register below.

**Promoting a value from C to B requires a corpus measurement. Promoting it to B-ext requires a named
external exemplar. Neither can be done with an argument alone.**

---

# The anchor tolerance register — measured from external corpora

**These are the numbers nobody publishes.** The sweep confirmed that no tool publishes a cross-frame
anchor tolerance, and gave the structural reason: no tool stores a per-frame anchor it could validate
(see the unbounded register). A tolerance can still be recovered — not by reading a specification, but
by **measuring the shipped work of people who have been tuning this for years**, with an instrument
stated precisely enough that anyone can re-run it.

That makes this a fourth class of evidence, distinct from the three below it:
**EXTERNAL-MEASURED — not published anywhere, derived by measuring an external corpus.**

## Method — stated so the numbers can be checked, not trusted

```
instrument      alpha threshold 8; foot band = the bottom 3.75% of character height
                (character height = alpha top to alpha bottom within the frame)
foot line       lowest opaque row
foot centre     horizontal centre of the alpha inside the foot band, NOT of the whole
                silhouette — a staff or a tail moves the bounding box without moving the feet
two axes        inDir : drift within one direction's own cycle
                xDir  : drift between the MEAN foot line of each direction
```

The two axes answer different questions and must never be merged. `inDir` may legitimately be large —
a stride lifts a foot, a lunge leaves the ground. `xDir` has no such excuse: nothing about any
animation explains why the left-facing cycle should stand at a different height from the right-facing
one.

## Does the tolerance scale with character size? — measured, and no

Tested by building the ceiling from external corpora only (n=314 sets, character heights 24–82 px) and
scoring a separate body of art against it (n=28 sets, character heights 163–566 px). Building the
ceiling from a pool that contains the sets under judgement would be circular.

```
correlation(character height, drift in px), all six kind x axis cells:
    -0.594   0.131   0.293   0.214   -0.107   0.268
```

**Not one cell shows the strong positive correlation a proportional model requires.** The strongest is
negative — taller characters drifting _less_. And the decisive check comes from combining the ranges:
well-made pose-hold sets land on **0–1 px at character heights from 24 px to 370 px**, a 15× span.

**The reason is physical.** This drift is an authoring alignment error, not a depiction of movement. An
artist aligning to the pixel grid is off by a pixel or two regardless of how large the subject is — the
error is bounded by the precision of the hand and the tool, not by the size of what is drawn.

## The base

```
alignment error       base = 1 px, ABSOLUTE, does not scale with character height
                      per-kind multiplier applies

depicted movement     NOT absolute — a larger character's stride really does cross more pixels
                      expressed as a fraction of character height
```

| animation kind                                          | `xDir` — alignment   | `inDir` — alignment | `inDir` — depicted movement   |
| ------------------------------------------------------- | -------------------- | ------------------- | ----------------------------- |
| **pose-hold** (idle, combat idle, emote, cast-in-place) | **±1 px** (1 × base) | **±1 px**           | n/a — the body is planted     |
| **locomotion** (walk, run, jump, climb)                 | **±2 px** (2 × base) | —                   | **≤ 27% of character height** |
| **action** (slash, thrust, shoot, and similar)          | **±3 px** (3 × base) | —                   | **≤ 23% of character height** |

Every figure is the **p90 of the external corpora**, rounded up to a whole pixel. p90 rather than max
because a corpus of that size contains its own defects, and rather than median because a spec that half
of good work already fails is not a spec.

> **These are ceilings evidenced from outside, not targets.** The corpora measured have characters
> 24–82 px tall and cannot resolve drift finer than one pixel. Art drawn at several hundred pixels has
> an order of magnitude more room, and the well-made sets in that range measure **0**. Quote the ceiling
> when judging; quote your own best work when setting a target.

> **Applying it to a set of single-frame directions** — an eight-facing "turn" set, one frame per
> direction — is the `xDir` pose-hold case, not `inDir`. The body is planted in every frame; only the
> facing changes. **±1 px.**

## Provenance and limits of these numbers

```
corpora         Universal LPC Spritesheet (Liberated Pixel Cup)
                github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator
                fixed 64 px cell, filename = animation name, hundreds of contributors.
                Assets are licensed PER FILE, not per repository — CC0, CC-BY 4.0,
                CC-BY-SA 4.0, OGA-BY, or GPL 3.0 depending on the piece — and the
                repository ships CREDITS.csv naming the author and licence of every image.

                Battle for Wesnoth  ·  github.com/wesnoth/wesnoth  ·  GPL-2.0
                one file per frame, two decades of community art, unit heights varying
                inside a fixed frame. Per-file copyright is recorded in copyrights.csv.

what was used   MEASUREMENTS ONLY. No pixel of either corpus was copied into this project,
                and none is redistributed. What was taken is a set of numbers — alpha
                bounding boxes and their spreads — and a measured statistic is a fact.
                No licence obligation attaches to a fact.
                The credit here is owed for a different and stronger reason: a number whose
                source is not named cannot be re-derived by anyone, and this document's own
                third standing rule forbids that.

sample          314 external animation sets after kind classification
kind labels     unambiguous in LPC (the filename IS the animation name); inferred from
                filenames in Wesnoth, which is coarser — a drawn-bow "attack" whose feet
                never move was classified as action, so the action band is, if anything,
                slightly wider than the truth
not covered     no web-platform corpus, no commercial corpus, no 3D-rendered-to-sprite corpus
```

**Two corpora is evidence, not consensus.** A third and fourth would strengthen the base and could move
it by a pixel. The method above is written out so that adding one is a re-run, not a re-derivation.

---

# The tolerance register — published external values

Every row carries its source and its strength. **Read the strength column before using a number**: a
tool default is a considered choice by one vendor, not a rule, and this register keeps them apart
deliberately.

## Hard — a gatekeeper or an API rejects violations

| quantity                           | value                                                              | source                                               |
| ---------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| Store listing screenshot, per side | **320 – 3840 px inclusive**                                        | Google Play Console Help, _Add preview assets_       |
| Store listing screenshot, aspect   | **max dimension ≤ 2 × min dimension** — any aspect from 1:2 to 2:1 | Google Play Console Help                             |
| Store listing icon                 | **exactly 512 × 512 px**, 32-bit PNG with alpha, **≤ 1024 KB**     | Google Play Console Help                             |
| Store feature graphic              | **exactly 1024 × 500 px**, JPEG or 24-bit PNG, no alpha            | Google Play Console Help                             |
| Apple screenshot sizes             | a **set** of accepted sizes per display class, not one fixed size  | Apple, App Store Connect Help                        |
| Texture dimension ceiling          | **16384 × 16384 px** — importer will not accept larger             | Unity Manual, _Import a texture_                     |
| Texture dimension ceiling          | **8192 × 8192 px** without an engine configuration change          | Unreal Engine, _Texture Format Support and Settings_ |
| Minimum size for tight sprite mesh | **32 × 32 px** — below this the engine silently forces Full Rect   | Unity Manual, _Sprite texture type reference_        |
| Pixel-exact rendering              | **one identical Pixels Per Unit across every sprite in a scene**   | Unity 2D Pixel Perfect 5.0                           |

**The 2:1 ratio rule is the strongest evidence this register contains** — it is a published tolerance
expressed as a range rather than a point, by a gatekeeper that enforces it.

## Recommendation — documented cost, no rejection

| quantity                     | guidance                                                                                            | source                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Power-of-two dimensions      | preferred; NPOT costs memory and sample speed                                                       | Unity, corroborated by Godot and Unreal |
| Integer upscale factors      | fractional scaling distorts pixel-exact art; engines ship a floor() to avoid it                     | Godot 4, _Multiple resolutions_         |
| Store listing aspect targets | 16:9 / 9:16 and similar are **highly recommended** for listing eligibility — **not** an upload gate | Google Play Console Help                |

## Tool default — one vendor's considered choice, cited as such

| quantity                             | value            | source               |
| ------------------------------------ | ---------------- | -------------------- |
| Atlas padding between packed sprites | **4 px** default | Unity Sprite Atlas   |
| Atlas padding                        | **2 px**         | libGDX TexturePacker |
| Atlas padding                        | **"at least 2"** | TexturePacker        |
| Atlas padding                        | **1 px**         | Godot                |

> ⚠️ **Do not spend these numbers on the wrong quantity.** Every one of them measures the gap **between
> two sprites sharing one texture**, so that bilinear filtering cannot sample a neighbour. Empty canvas
> **inside a single frame** — margin under a character's feet, headroom above it — is a different
> quantity that happens to share the English word "padding". The sceptic pass caught this register about
> to make exactly that substitution.

## Derived arithmetic — a consequence of a real specification

| quantity              | derivation                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decode footprint      | `frames × w × h × 4` bytes at RGBA8                                                                                                                                                                        |
| Block-compressed size | `ceil(w / bw) × ceil(h / bh) × 16` bytes — any `w`, `h`                                                                                                                                                    |
| Contain-fit scale     | `min(boxW / srcW, boxH / srcH)`; the fitted axis determines the on-screen size                                                                                                                             |
| Half-texel offset     | index-space `n − 0.5` and continuous texel-space `n` are the same point; a 0.5 gap between the two conventions is the half-texel offset, not a discrepancy (Microsoft Learn, _Bilinear Texture Filtering_) |

---

# The unbounded register — quantities with no published external value

**This half of the document is as load-bearing as the tolerance register, and it is the honest answer to
"why not just use the international number?".** For each class below, the sweep looked and found
nothing — and in most cases can say why nothing exists.

| quantity                                                                                                    | why no external source exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-frame anchor consistency** — how far a foot line or an anchor may drift between the frames of one set | **The strongest negative result of the sweep.** Four tools were checked for a cross-frame anchor consistency check; **none publishes one**, because none stores a per-frame anchor it could validate. Pivot data, where it exists at all, is optional and user-authored. Nobody can publish a tolerance on a quantity their format does not record. **The finding stands — and the number was recovered anyway, by measuring external corpora rather than citing one. See the anchor tolerance register above.** |
| Anchor tolerance in general                                                                                 | Same evidence: five tools, zero published tolerances, zero validation hooks, one human-eyeball preview. **Same resolution: measured, never cited.**                                                                                                                                                                                                                                                                                                                                                              |
| Frame count per direction; animation-set length                                                             | An animation-density choice traded against file count and RAM. Tools publish frame _ordering_ support and never a frame _count_ — there is no interoperation surface.                                                                                                                                                                                                                                                                                                                                            |
| Direction-to-index mapping                                                                                  | An application-private key into a filename template. No external consumer exists, so no external body can bound it.                                                                                                                                                                                                                                                                                                                                                                                              |
| Filename templates                                                                                          | A private contract between a project's art side and its own loader.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Playback cadence, sampling stride, movement constants, camera scale ramps                                   | Feel-tuning constants. Standards publish timing only where it crosses safety or interop (flash thresholds, frame pacing); a cadence crosses neither. Violating them changes how a game **feels**.                                                                                                                                                                                                                                                                                                                |
| Component box geometry and its internal margins                                                             | Layout of one component in one application. No external consumer, therefore no external bound even in principle.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Cache lifetime for shipped assets                                                                           | HTTP standards define the `max-age` **mechanism** and deliberately never a value: the correct TTL is a function of deploy cadence and whether URLs are content-addressed.                                                                                                                                                                                                                                                                                                                                        |
| Art payload budget                                                                                          | Set by target download time on target networks — a product decision, not a format property.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Image format choice among universally-supported options                                                     | Standards publish what a decoder must **accept**, never which accepted format a producer should **emit**.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Acceptability of a RAM ceiling                                                                              | The number derives cleanly; its acceptability does not. No vendor publishes a per-app texture-RAM budget for a browser tab.                                                                                                                                                                                                                                                                                                                                                                                      |
| Requiring every frame of one set to share a canvas                                                          | **No format requires this, and the industry answer is the opposite**: carry the untrimmed frame of reference in per-frame metadata and let frames differ. A project may still adopt the stricter rule — but as its own Layer B choice, not as a standard.                                                                                                                                                                                                                                                        |
| Device-fleet format support percentages                                                                     | Telemetry that moves month to month as the installed base turns over. Re-check at port-decision time; never carry the number forward.                                                                                                                                                                                                                                                                                                                                                                            |

## Known coverage gap in this register

**Not one web-platform source appears in it.** Every finding above is a native engine, a desktop atlas
packer, a Direct3D page, a container specification, or a store listing — while this project renders
through WebGL2/WebGPU inside a DOM box under CSS transforms. Any tolerance concerning
`devicePixelRatio`, CSS box sizing, `object-fit` behaviour, or browser image decoding is **unsearched**,
not absent. A future sweep should start there.

---

# Conformance

A project bound by this document maintains a conformance record — for this repository,
`docs/SPRITE-CONFORMANCE.md` — which for **every** slot above states the project's chosen value, its
provenance, and its current status. A rule with no conformance entry is a rule nobody is checking.

**The conformance record is where measured numbers, file paths, commit references, and open violations
belong. None of them belong in this file.**
