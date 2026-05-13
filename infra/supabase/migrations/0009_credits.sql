-- M9: Pay-per-report credits system
-- Each new user gets 1 free credit. Paid credits are added via Stripe webhook.

alter table candidates
  add column if not exists credits_remaining integer not null default 1,
  add column if not exists credits_purchased integer not null default 0,
  add column if not exists stripe_customer_id text,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists candidates_stripe_customer_id_key
  on candidates (stripe_customer_id)
  where stripe_customer_id is not null;

-- Give existing users their 1 free credit
update candidates set credits_remaining = 1 where credits_remaining = 0;

-- Priority flag on resumes: set true when user has credits at upload time
alter table resumes
  add column if not exists is_priority boolean not null default false;
