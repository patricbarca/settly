-- Estado de servicios para el panel de Admin.
-- La Edge Function `service-status` inserta una fila cada 15 min (pg_cron).
-- Nadie lee la tabla por la API: solo el admin, vía get_service_status().

create table if not exists public.service_status (
  id bigserial primary key,
  checked_at timestamptz not null default now(),
  results jsonb not null
);
create index if not exists service_status_checked_at on public.service_status (checked_at desc);
alter table public.service_status enable row level security;
revoke all on public.service_status from anon, authenticated;

-- Última revisión completa + historial compacto ({t, s: {id: status}}) de las últimas p_hours horas.
create or replace function public.get_service_status(p_hours int default 24)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  caller_email text;
begin
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is distinct from 'paabarcad@gmail.com' then
    raise exception 'unauthorized';
  end if;
  return jsonb_build_object(
    'latest', (select jsonb_build_object('checked_at', checked_at, 'results', results)
               from service_status order by checked_at desc limit 1),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               't', checked_at,
               's', (select jsonb_object_agg(r->>'id', r->>'status') from jsonb_array_elements(results) r))
             order by checked_at)
      from service_status
      where checked_at > now() - make_interval(hours => least(greatest(p_hours, 1), 72))
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.get_service_status(int) from anon, public;
grant execute on function public.get_service_status(int) to authenticated;

-- Tarea cada 15 min. Reutiliza la cabecera (con CRON_SECRET) de la tarea de recordatorios,
-- así el secreto no queda escrito en el repo.
select cron.unschedule('settlia-service-status')
where exists (select 1 from cron.job where jobname = 'settlia-service-status');
select cron.schedule('settlia-service-status', '*/15 * * * *',
  replace(command, '/functions/v1/daily-reminders', '/functions/v1/service-status'))
from cron.job where jobname = 'settlia-daily-reminders';
