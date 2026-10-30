-- Pro: tope diario POR TIPO (uso justo): 20 escaneos, 20 dictados, 50 textos al día.
-- Gratis: sigue con el tope diario total de 30 (y 3 al mes por tipo en ai_quota).
create or replace function public.ai_guard(p_kind text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  k text := left(coalesce(p_kind, ''), 12);
  n int;
  cap int;
begin
  if uid is null then return false; end if;
  if is_pro(uid) then
    select count(*) into n from ai_calls where user_id = uid and kind = k and at > now() - interval '24 hours';
    cap := case k when 'scan' then 20 when 'voice' then 20 when 'text' then 50 else 20 end;
  else
    select count(*) into n from ai_calls where user_id = uid and at > now() - interval '24 hours';
    cap := 30;
  end if;
  if n >= cap then return false; end if;
  insert into ai_calls (user_id, kind) values (uid, k);
  if random() < 0.02 then
    delete from ai_calls where at < now() - interval '3 days';
  end if;
  return true;
end;
$$;
