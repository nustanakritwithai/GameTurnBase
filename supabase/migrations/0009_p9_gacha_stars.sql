-- P9 gacha + star ascension persistence (§4.1, §4.3, §7.1 skeleton)
-- Ring 1 agent, 2026-08-08 — NON-PRODUCTION stub numbers; roll resolution still client-side until full server RNG lands.

alter table public.currency_transactions drop constraint if exists currency_transactions_amount_check;
alter table public.currency_transactions
  add constraint currency_transactions_amount_check check (amount <> 0);

alter table public.currency_transactions drop constraint if exists currency_source_match;
alter table public.currency_transactions add constraint currency_source_match check (
  (currency = 'gold' and source in ('quest', 'drop', 'topup'))
  or (currency = 'gem' and source in ('topup', 'coupon', 'gacha'))
);

alter table public.owned_characters
  add column if not exists star int not null default 1 check (star >= 1 and star <= 6),
  add column if not exists duplicate_shards int not null default 0 check (duplicate_shards >= 0);

alter table public.profiles
  add column if not exists gacha_progress jsonb not null default '{}'::jsonb;

create or replace function public.apply_gacha_pull(
  p_ref_id text,
  p_gem_cost int,
  p_banner_id text,
  p_pity jsonb,
  p_results jsonb
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
  v_profile_id uuid := auth.uid();
  v_gem int;
  v_entry jsonb;
  v_character_id text;
  v_is_new boolean;
  v_star int;
  v_shards int;
  v_progress jsonb;
begin
  if v_profile_id is null then
    raise exception 'ยังไม่ได้ล็อกอิน';
  end if;
  if p_ref_id is null or length(trim(p_ref_id)) = 0 then
    raise exception 'ref_id ไม่ถูกต้อง';
  end if;
  if p_gem_cost <= 0 then
    raise exception 'ค่าใช้จ่ายไม่ถูกต้อง';
  end if;
  if p_banner_id is null or p_banner_id <> 'standard' then
    raise exception 'แบนเนอร์ไม่รองรับ: %', p_banner_id;
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception 'ผลอัญเชิญไม่ถูกต้อง';
  end if;

  if exists(
    select 1 from public.currency_transactions
    where profile_id = v_profile_id and ref_id = p_ref_id
  ) then
    raise exception 'รายการนี้ถูกประมวลผลแล้ว';
  end if;

  select gem into v_gem from public.profiles where id = v_profile_id for update;
  if v_gem is null then
    raise exception 'ไม่พบบัญชีผู้เล่น';
  end if;
  if v_gem < p_gem_cost then
    raise exception 'หยกไม่พอ';
  end if;

  insert into public.currency_transactions (profile_id, currency, source, amount, ref_id)
  values (v_profile_id, 'gem', 'gacha', -p_gem_cost, p_ref_id);

  update public.profiles
  set gem = gem - p_gem_cost
  where id = v_profile_id;

  for v_entry in select * from jsonb_array_elements(p_results)
  loop
    v_character_id := v_entry->>'character_id';
    v_is_new := coalesce((v_entry->>'is_new')::boolean, false);
    v_star := coalesce((v_entry->>'star')::int, 1);
    v_shards := coalesce((v_entry->>'duplicate_shards')::int, 0);

    if v_character_id is null or length(v_character_id) = 0 then
      raise exception 'character_id ไม่ถูกต้อง';
    end if;

    if v_is_new then
      insert into public.owned_characters (profile_id, character_id, star, duplicate_shards)
      values (v_profile_id, v_character_id, v_star, v_shards);
    else
      update public.owned_characters
      set star = v_star, duplicate_shards = v_shards
      where profile_id = v_profile_id and character_id = v_character_id;

      if not found then
        raise exception 'ไม่พบตัวละครที่จะอัปเดต: %', v_character_id;
      end if;
    end if;
  end loop;

  select coalesce(gacha_progress, '{}'::jsonb) into v_progress
  from public.profiles where id = v_profile_id;

  update public.profiles
  set gacha_progress = jsonb_set(
    v_progress,
    array['pity', p_banner_id],
    coalesce(p_pity, '{"pullsSinceLastPityRarity": 0}'::jsonb),
    true
  )
  where id = v_profile_id
  returning * into result;

  return result;
end;
$$;
