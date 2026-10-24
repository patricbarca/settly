-- Lista de grupos con imágenes en base64 dentro del blob (para la Edge Function
-- `migrate-images`) + tarea cada hora. Solo service_role.
create or replace function public.groups_with_inline_images()
returns table (id text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.id from groups g where strpos(g.data::text, '"data:image') > 0;
$$;
revoke execute on function public.groups_with_inline_images() from anon, public, authenticated;

select cron.unschedule('settlia-migrate-images')
where exists (select 1 from cron.job where jobname = 'settlia-migrate-images');
select cron.schedule('settlia-migrate-images', '7 * * * *',
  replace(command, '/functions/v1/daily-reminders', '/functions/v1/migrate-images'))
from cron.job where jobname = 'settlia-daily-reminders';
