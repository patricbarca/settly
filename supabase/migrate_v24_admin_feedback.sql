-- Feedback para el panel de Admin (pestaña "Feedback"). Solo el admin.
create or replace function public.get_admin_feedback(p_limit int default 5)
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
    'total',      (select count(*) from feedback),
    'ratings',    (select count(*) from feedback where type = 'rating'),
    'bugs',       (select count(*) from feedback where type = 'bug'),
    'avg_rating', (select round(avg(rating)::numeric, 2) from feedback where rating is not null),
    'last_30d',   (select count(*) from feedback where created_at > now() - interval '30 days'),
    'with_text',  (select count(*) from feedback where coalesce(trim(message), '') <> ''),
    'by_stars',   (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb) from (
                     select rating s, count(*) c from feedback where rating is not null group by rating) x),
    'latest', coalesce((select jsonb_agg(f order by f.created_at desc) from (
        select fb.id, fb.type, fb.rating, fb.message, fb.created_at,
               coalesce(nullif(p.name, ''), u.raw_user_meta_data->>'full_name', '') as name,
               u.email,
               fb.context->>'lang' as lang,
               case when (fb.context->>'ios')::boolean then 'iPhone'
                    when fb.context->>'ua' ilike '%android%' then 'Android' else 'Web' end as device,
               fb.context->>'version' as version
        from feedback fb
        left join auth.users u on u.id = fb.user_id
        left join profiles p on p.id = fb.user_id
        order by fb.created_at desc
        limit least(greatest(p_limit, 1), 200)) f), '[]'::jsonb)
  );
end $$;
revoke execute on function public.get_admin_feedback(int) from anon, public;
grant execute on function public.get_admin_feedback(int) to authenticated;
