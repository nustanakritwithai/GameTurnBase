# Backend handoff — Production Gacha สองฮีโร่

> Operator: `nustanakritwithai` · Agent: Codex (Project Lead) · 2026-08-12
> สถานะ: ข้อกำหนดส่งมอบให้ Backend — เอกสารนี้ไม่ deploy และไม่แก้ฐานข้อมูล

## เป้าหมาย

Standard Banner ต้องสุ่มได้เพียงสองตัว:

| Character ID | ชื่อ | Rarity | อัตรา |
| --- | --- | --- | ---: |
| `monkey-king` | ซุนหงอคง (Wukong v4) | `legendary` | 50% |
| `spear-warrior` | เอ้อหลางเสิน | `legendary` | 50% |

ห้ามมี `pig-warrior`, `celestial-archer`, `nezha-warden` หรือ `sand-sage`
ใน `standard-banner` หลัง migration

## งาน Backend

1. สร้าง forward-only migration ใหม่ด้วย `supabase migration new two_hero_production_gacha`;
   ห้ามแก้ migration ที่ deploy แล้ว
2. คงราคาและ pity threshold เดิมจนกว่า Game Design จะอนุมัติตัวเลขใหม่
3. ใน transaction เดียว ลบ pool เดิมเฉพาะ Standard Banner แล้วใส่สองตัวคนละ
   `0.5000000`; ตรวจจำนวนแถวและผลรวม rate ก่อนจบ migration
4. Client ส่งได้เฉพาะ request ID, banner ID และจำนวน 1/10; server ต้องสุ่ม หัก Gem
   คำนวณ pity และเขียน Hero/shard
5. ตรวจว่า `spear-warrior` เป็น Character ID ที่ ownership ยอมรับ
6. อัปเดต integration tests โดยไม่ลด coverage atomicity, idempotency, RLS, ledger และ pity

## หลักฐานดิบที่ต้องแนบใน PR

```sql
select character_id, rarity, drop_rate
from public.gacha_banner_pool
where banner_id = 'standard-banner'
order by character_id;
```

ต้องได้เพียง:

```text
monkey-king    | legendary | 0.5000000
spear-warrior | legendary | 0.5000000
```

```sql
select count(*) as pool_size, sum(drop_rate) as total_rate
from public.gacha_banner_pool
where banner_id = 'standard-banner';
```

ต้องได้ `pool_size = 2` และ `total_rate = 1.0000000`

แนบ output จริงของ:

```bash
npm test -- src/data/gachaAuthority.integration.test.ts
npm test -- src/data/accountRepository.supabase.test.ts
npm run typecheck
npm run lint
```

เพิ่ม test ว่า pool ไม่คืนตัวอื่น, request เดิมไม่หัก/แจกซ้ำ, เงินไม่พอไม่มี partial
writes, anonymous เรียก RPC ไม่ได้, RLS กันข้อมูลข้ามผู้ใช้ และ rate ไม่ครบแล้ว RPC ปฏิเสธ

## Release gate

- เปิด Backend PR เป็น Draft ก่อน
- sync `origin/master` ล่าสุด ไม่มี conflict และ CI ผ่านจริง
- migration ผ่านทั้งฐานสะอาดและฐานที่มีข้อมูลเดิม
- Frontend/Asset PR ผ่านแยก
- Ring 0 อนุมัติหลัง mobile playtest

ห้าม deploy อัตโนมัติ การ apply production เป็นหน้าที่ Backend/Ring 0 หลัง review

## นอกขอบเขต

PNG/WebP, animation mapping, การลบ asset เก่า, UI, การเปลี่ยนราคา/pity/economy
และการเปิด client flag ก่อน Asset PR กับ mobile playtest ผ่าน
