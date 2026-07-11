-- Settlia – tokens de push NATIVO (APNs iOS / FCM Android). Separada de
-- push_subscriptions (Web Push de la PWA). Ejecutar en el SQL Editor. Idempotente.
create table if not exists device_push_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null default 'ios',   -- 'ios' (APNs) | 'android' (FCM)
  lang        text not null default 'es',
  tz          text not null default 'UTC',
  created_at  timestamptz not null default now()
);

alter table device_push_tokens enable row level security;

-- Cada usuario gestiona solo sus propios tokens. Las Edge Functions
-- (send-push / daily-reminders) usan la service-role key (saltan RLS) para
-- leer los de los demás miembros del grupo.
drop policy if exists "own device tokens" on device_push_tokens;
create policy "own device tokens" on device_push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists device_push_tokens_user_idx on device_push_tokens(user_id);
