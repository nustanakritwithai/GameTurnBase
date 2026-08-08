-- Coupon double-redemption TOCTOU fix — split from 0009 per a CoalBoard truth-lens finding:
-- redeem_coupon's dedup check was app-level only (SELECT exists(...) then INSERT, no DB
-- backstop) — two concurrent calls could both pass the check before either commits,
-- double-crediting gems for one code. If that race already produced a duplicate row in
-- production, a bare CREATE UNIQUE INDEX would fail outright and (since this file is its
-- own transaction, separate from 0009) roll back only this fix, never the other three.
--
-- Safe even if duplicates already exist: keep the earliest row per (profile_id, ref_id)
-- under the same predicate the index will enforce, remove any later duplicates first, then
-- create the index. If no duplicates exist, the delete affects zero rows and this is a no-op
-- before the index creation.

delete from public.currency_transactions t
where t.currency = 'gem'
  and t.source = 'coupon'
  and t.id <> (
    -- keep the chronologically earliest row (created_at, then id as a stable tiebreak for
    -- same-instant rows) — NOT min(id), since id is a random uuid with no time ordering
    select t2.id
    from public.currency_transactions t2
    where t2.profile_id = t.profile_id
      and t2.ref_id = t.ref_id
      and t2.currency = 'gem'
      and t2.source = 'coupon'
    order by t2.created_at asc, t2.id asc
    limit 1
  );

create unique index if not exists currency_transactions_coupon_dedup
  on public.currency_transactions (profile_id, ref_id)
  where currency = 'gem' and source = 'coupon';
