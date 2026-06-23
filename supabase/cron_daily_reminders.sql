-- ============================================================
-- SettliA – Cron diario de recordatorios (Fase 2.5)
-- Programa una llamada diaria a la Edge Function `daily-reminders`.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- ANTES de ejecutar, reemplaza:
--   <PROJECT_REF>  → la ref de tu proyecto (xxxx en xxxx.supabase.co)
--   <CRON_SECRET>  → el mismo valor que pusiste con:
--                    supabase secrets set CRON_SECRET=<...>
--
-- Requisitos previos:
--   1) Web Push desplegado (send-push + VAPID secrets + tabla push_subscriptions)
--   2) supabase functions deploy daily-reminders --no-verify-jwt
--   3) supabase secrets set CRON_SECRET=<...>
-- ============================================================

-- Extensiones necesarias (cron + http saliente).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Borra el job anterior si ya existía (para poder re-ejecutar este SQL).
select cron.unschedule('settlia-daily-reminders')
where exists (select 1 from cron.job where jobname = 'settlia-daily-reminders');

-- Programa el recordatorio diario.
-- '0 17 * * *' = todos los días a las 17:00 UTC. Ajusta la hora a tu zona
-- (p. ej. para ~10:00 en Australia/Sydney usa una hora UTC distinta).
select cron.schedule(
  'settlia-daily-reminders',
  '0 17 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/daily-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Para comprobar / borrar:
--   select * from cron.job;
--   select cron.unschedule('settlia-daily-reminders');
