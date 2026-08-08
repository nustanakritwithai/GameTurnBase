# Fork Staging — `nustanakritwithai/GameTurnBase`

> **Upstream (product repo):** [KatomnoiStudio/LegendOfSoulTH](https://github.com/KatomnoiStudio/LegendOfSoulTH)  
> **Live play:** https://katomnoistudio.github.io/LegendOfSoulTH/  
> **Operator:** HetCreep · **Last synced:** 2026-08-08

Fork นี้เป็น **staging branch holder** สำหรับ Cursor Cloud Agent — delivery จริงคือ upstream PR บน `KatomnoiStudio/LegendOfSoulTH` (ดู `.agents/rules/upstream-submission-workflow.md`)

---

## Delivery chain — **CLOSED (all landed upstream 2026-08-08)**

| #   | Version | Topic                     | Fork PR                                                          | Upstream PR                                                     | สถานะ                           |
| --- | ------- | ------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| 1   | v0.10.0 | P5 Dungeon vertical slice | [#65](https://github.com/nustanakritwithai/GameTurnBase/pull/65) | [#30](https://github.com/KatomnoiStudio/LegendOfSoulTH/pull/30) | **Merged upstream**             |
| 2   | v0.11.0 | Result / Reward pipeline  | [#66](https://github.com/nustanakritwithai/GameTurnBase/pull/66) | [#31](https://github.com/KatomnoiStudio/LegendOfSoulTH/pull/31) | **Merged upstream**             |
| 3   | v0.11.1 | Camera +30% height fix    | [#67](https://github.com/nustanakritwithai/GameTurnBase/pull/67) | [#32](https://github.com/KatomnoiStudio/LegendOfSoulTH/pull/32) | **Merged upstream**             |
| 4   | v0.12.0 | P8 Character Progression  | [#68](https://github.com/nustanakritwithai/GameTurnBase/pull/68) | [#33](https://github.com/KatomnoiStudio/LegendOfSoulTH/pull/33) | **Merged upstream** (`d54eee2`) |

Fork PRs #65–#68 ปิดแล้ว (superseded) — โค้ดจริงอยู่บน upstream `master` @ **v0.12.0**.

---

## Active branches (remote)

หลังเก็บกวาด 2026-08-08 เหลือเฉพาะ:

- `master` — sync กับ upstream `master` (v0.12.0)

กิ่ง `cursor/*-35fc` ถูกลบจาก fork remote แล้ว (งาน merge ครบ)

---

## Agent / contributor pointers

- **Rules:** [`AGENTS.md`](../AGENTS.md) · **State journal:** [`MEMORY.md`](../MEMORY.md)
- **Blueprint:** [`docs/MASTER_BLUEPRINT_v3.0.md`](MASTER_BLUEPRINT_v3.0.md)
- **Changelog:** [`CHANGELOG.md`](../CHANGELOG.md)

---

## หมายเหตุ

- Upstream deploy ผูก `GAME_INFO.version` — live ที่ https://katomnoistudio.github.io/LegendOfSoulTH/
- P8 balance numerics ยัง NON-PRODUCTION — รอ Ring 0 lock (ดู `MEMORY.md` item 119)
