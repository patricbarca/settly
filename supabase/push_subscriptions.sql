-- Settly – suscripciones Web Push (Fase 2).
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
create table if not exists push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  lang         text not null default 'es',
  created_at   timestamptz not null default now()
);

-- Idioma del usuario para localizar los recordatorios (idempotente si la tabla ya existía).
alter table push_subscriptions add column if not exists lang text not null default 'es';

alter table push_subscriptions enable row level security;

-- Cada usuario gestiona solo sus propias suscripciones. La Edge Function
-- send-push usa la service-role key (salta RLS) para leer las de los demás.
drop policy if exists "own push subs" on push_subscriptions;
create policy "own push subs" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);
