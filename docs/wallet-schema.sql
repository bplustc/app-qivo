-- Qivo wallet and payments schema (PostgreSQL)
-- This schema is designed for driver wallet topups and automatic $1 fee per completed service.

create table if not exists drivers (
  id uuid primary key,
  full_name text not null,
  email text unique,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references drivers(id) on delete cascade,
  balance_usd numeric(10,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'active' check (status in ('active','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references drivers(id) on delete cascade,
  wallet_id uuid not null references wallets(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  idempotency_key text not null unique,
  amount_usd numeric(10,2) not null check (amount_usd > 0),
  status text not null check (status in ('pending','paid','failed','refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_driver on payments(driver_id);
create index if not exists idx_payments_status on payments(status);

create table if not exists services (
  id uuid primary key,
  driver_id uuid references drivers(id),
  passenger_name text,
  status text not null check (status in ('requested','assigned','in_progress','completed','cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists wallet_movements (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets(id) on delete cascade,
  driver_id uuid not null references drivers(id) on delete cascade,
  type text not null check (type in ('topup','service_fee','refund','adjustment')),
  amount_usd numeric(10,2) not null,
  balance_before numeric(10,2) not null,
  balance_after numeric(10,2) not null,
  service_id uuid references services(id),
  payment_id uuid references payments(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_movements_wallet on wallet_movements(wallet_id, created_at desc);
create index if not exists idx_wallet_movements_driver on wallet_movements(driver_id, created_at desc);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  signature text,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists idx_webhooks_provider on webhook_events(provider, created_at desc);

-- Helper function: update timestamps
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_wallets_updated_at on wallets;
create trigger trg_wallets_updated_at
before update on wallets
for each row execute function set_updated_at();

drop trigger if exists trg_payments_updated_at on payments;
create trigger trg_payments_updated_at
before update on payments
for each row execute function set_updated_at();

-- Atomic balance update example for service fee charge
-- Run inside a transaction:
-- 1) Lock wallet row
--    select id, balance_usd from wallets where driver_id = $1 for update;
-- 2) Validate balance_usd >= 1.00
-- 3) Update wallet balance
--    update wallets set balance_usd = balance_usd - 1.00 where driver_id = $1;
-- 4) Insert movement with balance_before and balance_after
