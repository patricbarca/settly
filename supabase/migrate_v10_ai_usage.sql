-- migrate_v10_ai_usage.sql
-- Contador de uso de IA server-side (no reseteable desde el navegador).
-- Aplicado en Supabase vía conector MCP (apply_migration "ai_usage_server_quota").
-- Reemplaza el contador en localStorage (`settly.aiUsage`) de src/lib/plan.ts.
--
-- Modelo: tabla `ai_usage(user_id, month, kind, count)` + RPCs SECURITY DEFINER:
--   - consume_ai(kind)  → incremento ATÓMICO si queda cuota; devuelve remaining o -1.
--   - ai_remaining()    → remaining/quota de los 3 tipos para mostrar en la UI.
--   - is_pro(uid)       → Pro según `entitlements` (fuente de verdad server-side).
-- Las cuotas DEBEN coincidir con plan.ts (FREE_AI_QUOTA=3; PRO scan/voice=30, text=50).

create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,           -- 'YYYY-MM' (UTC)
  kind text not null,            -- 'scan' | 'voice' | 'text'
  count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month, kind)
);
alter table ai_usage enable row level security;

drop policy if exists "read own ai_usage" on ai_usage;
create policy "read own ai_usage" on ai_usage for select using (auth.uid() = user_id);
-- Sin políticas de insert/update: solo las funciones SECURITY DEFINER escriben.

create or replace function is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from entitlements e
    where e.user_id = uid and e.plan = 'pro'
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

create or replace function ai_quota(p_kind text, p_pro boolean) returns int
language sql immutable as $$
  select case
    when p_pro then case p_kind
      when 'scan' then 30 when 'voice' then 30 when 'text' then 50 else 30 end
    else 3
  end;
$$;

create or replace function consume_ai(p_kind text) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m   text := to_char(now() at time zone 'utc', 'YYYY-MM');
  pro boolean;
  q   int;
  cur int;
begin
  if uid is null or p_kind not in ('scan','voice','text') then return -1; end if;
  pro := is_pro(uid);
  q := ai_quota(p_kind, pro);
  insert into ai_usage(user_id, month, kind, count)
    values (uid, m, p_kind, 0)
    on conflict (user_id, month, kind) do nothing;
  update ai_usage set count = count + 1, updated_at = now()
    where user_id = uid and month = m and kind = p_kind and count < q
    returning count into cur;
  if cur is null then return -1; end if;   -- agotada
  return q - cur;
end;
$$;

create or replace function ai_remaining() returns table(kind text, remaining int, quota int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m   text := to_char(now() at time zone 'utc', 'YYYY-MM');
  pro boolean := is_pro(auth.uid());
begin
  return query
  select k.kind,
         greatest(0, ai_quota(k.kind, pro) - coalesce(u.count, 0))::int as remaining,
         ai_quota(k.kind, pro)::int as quota
  from (values ('scan'),('voice'),('text')) as k(kind)
  left join ai_usage u on u.user_id = uid and u.month = m and u.kind = k.kind;
end;
$$;

grant execute on function consume_ai(text) to authenticated;
grant execute on function ai_remaining() to authenticated;
grant execute on function is_pro(uuid) to authenticated;
