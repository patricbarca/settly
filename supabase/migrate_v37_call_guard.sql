-- ============================================================
-- Límite de llamadas por usuario para Edge Functions que NO son de IA
-- (convert-currency, send-push). Igual que ai_guard (migrate_v21/v32) pero
-- con su propia tabla, para no gastar el cupo de IA del usuario.
--   fx   → 100 conversiones / 24 h (la API de cambio es de 1500 req/mes)
--   push → 120 avisos / hora (añadir gastos en ráfaga cabe de sobra)
-- ============================================================

create table if not exists public.fn_calls (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists fn_calls_user_kind_at on public.fn_calls (user_id, kind, at desc);
-- RLS sin políticas: nadie lo lee ni escribe por la API; solo call_guard.
alter table public.fn_calls enable row level security;

create or replace function public.call_guard(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  k text := left(coalesce(p_kind, ''), 12);
  win interval;
  cap int;
  n int;
begin
  if uid is null then return false; end if;
  case k
    when 'fx'   then win := interval '24 hours'; cap := 100;
    when 'push' then win := interval '1 hour';   cap := 120;
    else return false;
  end case;
  select count(*) into n from fn_calls where user_id = uid and kind = k and at > now() - win;
  if n >= cap then return false; end if;
  insert into fn_calls (user_id, kind) values (uid, k);
  if random() < 0.02 then
    delete from fn_calls where at < now() - interval '3 days';
  end if;
  return true;
end;
$$;
revoke all on function public.call_guard(text) from public, anon;
grant execute on function public.call_guard(text) to authenticated, service_role;
