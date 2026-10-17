-- ============================================================
-- v21 · Endurecimiento de seguridad (2026-10-17)
-- 1) Límite de llamadas a la IA en el SERVIDOR (ai_guard): antes el cupo solo
--    lo aplicaba el cliente, así que alguien con sesión podía llamar a las
--    Edge Functions de IA sin parar y generar coste.
-- 2) Las funciones SECURITY DEFINER dejan de ser ejecutables por `anon`
--    (ya comprobaban membresía/usuario dentro; esto cierra la puerta del todo).
-- 3) search_path fijo en los helpers que no lo tenían.
-- ============================================================

create table if not exists public.ai_calls (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists ai_calls_user_at on public.ai_calls (user_id, at desc);
-- RLS sin políticas: nadie lo lee ni escribe por la API; solo ai_guard.
alter table public.ai_calls enable row level security;

create or replace function public.ai_guard(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
  cap int;
begin
  if uid is null then return false; end if;
  select count(*) into n from ai_calls where user_id = uid and at > now() - interval '24 hours';
  -- Muy por encima del uso normal (gratis 3/mes por tipo; Pro 30-50/mes):
  -- solo corta el abuso.
  cap := case when is_pro(uid) then 300 else 30 end;
  if n >= cap then return false; end if;
  insert into ai_calls (user_id, kind) values (uid, left(coalesce(p_kind, ''), 12));
  if random() < 0.02 then
    delete from ai_calls where at < now() - interval '3 days';
  end if;
  return true;
end;
$$;
revoke all on function public.ai_guard(text) from public, anon;
grant execute on function public.ai_guard(text) to authenticated, service_role;

-- SECURITY DEFINER expuestas: fuera `anon` (is_member_of se deja: lo usan
-- políticas RLS; handle_new_user es un trigger).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname in ('add_expense','add_settlement','ai_remaining','claim_expense_items','close_claim_round',
        'consume_ai','delete_expense','get_admin_stats','is_pro','patch_expense','patch_member',
        'patch_settlement','remove_settlement','set_settlement_status','update_group_data','redeem_access_code')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- search_path fijo en helpers
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('jsonb_array_cap','ai_quota','jsonb_union_by_id','itemized_splits','merge_expenses','jsonb_strip_nulls_hero')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;
