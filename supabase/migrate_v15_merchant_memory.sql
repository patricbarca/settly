-- ============================================================
-- Settlia – migrate_v15: memoria de comercios por grupo
--
-- Cada vez que alguien confirma un gasto, el grupo recuerda para ese comercio
-- la categoría, la descripción y entre quiénes se repartió. El próximo pago en
-- ese comercio (p. ej. desde Wallet) se rellena solo, sin gastar IA.
-- Por grupo: "Woolworths" en Casa (entre 4) no es lo mismo que en un viaje.
-- Solo guarda el nombre del comercio y las elecciones; nada de la tarjeta.
-- Idempotente.
-- ============================================================

create table if not exists public.merchant_memory (
  group_id text not null,
  key text not null,
  label text not null,
  category text not null,
  participant_ids jsonb not null default '[]'::jsonb,
  uses int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (group_id, key)
);

alter table public.merchant_memory enable row level security;

drop policy if exists "Members read merchant memory" on public.merchant_memory;
create policy "Members read merchant memory" on public.merchant_memory
  for select using (public.is_member_of(group_id));

drop policy if exists "Members write merchant memory" on public.merchant_memory;
create policy "Members write merchant memory" on public.merchant_memory
  for insert with check (public.is_member_of(group_id));

drop policy if exists "Members update merchant memory" on public.merchant_memory;
create policy "Members update merchant memory" on public.merchant_memory
  for update using (public.is_member_of(group_id)) with check (public.is_member_of(group_id));
