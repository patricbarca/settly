-- Página del enlace de invitación (sin sesión) + de dónde vienen las cuentas nuevas.

-- 1) Resumen público del grupo para quien abre el enlace. Solo con el token
--    (uuid imposible de adivinar). Sin saldos, sin emails, solo nombres de pila.
create or replace function public.invite_landing(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_gid text; v_owner uuid; d jsonb; cur text; owner_name text;
begin
  select l.group_id into v_gid from invite_links l where l.token::text = p_token and l.expires_at > now();
  if v_gid is null then return null; end if;
  select g.data, g.owner_id into d, v_owner from groups g where g.id = v_gid;
  if d is null then return null; end if;
  cur := coalesce(d->>'currency', 'USD');
  select split_part(coalesce(p.name, ''), ' ', 1) into owner_name from profiles p where p.id = v_owner;
  return jsonb_build_object(
    'name', d->>'name',
    'kind', coalesce(d->>'kind', 'trip'),
    'currency', cur,
    'owner', nullif(owner_name, ''),
    'members', (select count(*) from jsonb_array_elements(coalesce(d->'members','[]'::jsonb))),
    'first_names', coalesce((select jsonb_agg(n) from (
        select split_part(m->>'name', ' ', 1) n from jsonb_array_elements(coalesce(d->'members','[]'::jsonb)) m limit 8) s), '[]'::jsonb),
    'expenses', (select count(*) from jsonb_array_elements(coalesce(d->'expenses','[]'::jsonb))),
    'total', coalesce((select round(sum((e->>'amount')::numeric), 2) from jsonb_array_elements(coalesce(d->'expenses','[]'::jsonb)) e
        where coalesce(e->>'currency', cur) = cur and jsonb_typeof(e->'amount') = 'number'), 0)
  );
end $$;
grant execute on function public.invite_landing(text) to anon, authenticated;

-- 2) Origen de la cuenta: 'invite' (se unió por un enlace) o 'invite_cta'
--    (vio un enlace y pulsó "Crea tu propio grupo"). Lo pone el cliente una vez.
alter table public.profiles add column if not exists acquired_via text;

-- 3) Panel de Admin: cuentas que llegaron por un enlace, por el "crea tu propio grupo",
--    y grupos creados por estas últimas (el número que dice si el ciclo funciona).
do $$ declare d text; begin
  select pg_get_functiondef('public.get_admin_stats'::regproc) into d;
  if position('via_invite' in d) = 0 then
    d := replace(d, '''push_subs'',', '''via_invite'', (SELECT count(*) FROM public.profiles WHERE acquired_via=''invite''), ''via_invite_cta'', (SELECT count(*) FROM public.profiles WHERE acquired_via=''invite_cta''), ''groups_from_cta'', (SELECT count(*) FROM public.groups g JOIN public.profiles p ON p.id=g.owner_id WHERE p.acquired_via=''invite_cta''), ''push_subs'',');
    execute d;
  end if;
end $$;

-- 4) (mismo día) invite_landing devuelve también hero_color / hero_image (solo si
--    es URL https, no base64) / hero_pos, para que la página use la portada del grupo.
--    Aplicada como migración "invite_landing_hero" (ver la versión en producción).
