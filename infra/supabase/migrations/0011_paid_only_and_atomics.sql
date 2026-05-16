-- 0011_paid_only_and_atomics.sql
--
-- 1) Kill the free signup credit. New `candidates` rows start at 0
--    credits_remaining. The product is now strictly paid; the $4 intro
--    pack is the entry point (gated to first-purchase-only in app code).
-- 2) Add `processed_stripe_events` so the webhook can dedupe `event.id`
--    on Stripe retries / replays.
-- 3) Add atomic RPCs so credit consumption / increment / rewrite-counter
--    bumps run as single SQL statements (no read-then-write race).

-- (1) Default to 0 credits at signup.
alter table candidates
  alter column credits_remaining set default 0;

-- (2) Webhook idempotency table.
create table if not exists processed_stripe_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

-- (3a) Apply a Stripe purchase atomically. Idempotency MUST be enforced
-- by the caller (insert into processed_stripe_events first; bail on conflict).
create or replace function public.apply_credit_purchase(
  p_user_id uuid,
  p_count int
) returns void
language sql
security definer
set search_path = public
as $$
  update candidates
    set credits_remaining = credits_remaining + p_count,
        credits_purchased = credits_purchased + p_count,
        updated_at = now()
    where id = p_user_id;
$$;

-- (3b) Atomic decrement. Returns the new credits_remaining if a credit
-- was consumed, NULL otherwise (so the caller can 402 without racing).
create or replace function public.consume_credit(
  p_user_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_remaining int;
begin
  update candidates
    set credits_remaining = credits_remaining - 1,
        updated_at = now()
    where id = p_user_id
      and credits_remaining > 0
    returning credits_remaining into new_remaining;
  return new_remaining;
end;
$$;

-- (3c) Refund a credit (used if the caller reserved one and then the
-- downstream work failed). Idempotent at the row level — just adds 1.
create or replace function public.refund_credit(
  p_user_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  update candidates
    set credits_remaining = credits_remaining + 1,
        updated_at = now()
    where id = p_user_id;
$$;

-- (3d) Atomic rewrite-counter bump. Returns the new value if under the
-- cap, NULL if at/above. Caller checks NULL → 429.
create or replace function public.consume_builder_rewrite(
  p_resume_id uuid,
  p_cap int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_used int;
begin
  update resumes
    set builder_rewrites_used = builder_rewrites_used + 1
    where id = p_resume_id
      and builder_rewrites_used < p_cap
    returning builder_rewrites_used into new_used;
  return new_used;
end;
$$;
