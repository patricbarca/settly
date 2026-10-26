-- Auditoría de seguridad 2026-10-26.
-- 1) profiles: antes cualquier usuario con sesión leía email, teléfono y datos de
--    cobro de TODOS. Ahora solo el propio perfil y el de quien comparte grupo
--    contigo. Buscar a alguien por email/teléfono pasa por find_user (exacto).
-- 2) invite_links: antes cualquiera listaba los tokens vigentes y podía unirse a
--    cualquier grupo; groups dejaba leer cualquier grupo con un link vigente.
--    Ahora la vista previa y la unión van por RPC y exigen el token.

create or replace function public.shares_group_with(p_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_user = auth.uid() or exists (
    select 1 from group_members a join group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = p_user);
$$;
revoke execute on function public.shares_group_with(uuid) from anon, public;
grant execute on function public.shares_group_with(uuid) to authenticated;

drop policy if exists "Read profiles" on public.profiles;
create policy "Read own and co-member profiles" on public.profiles
  for select to authenticated using (public.shares_group_with(id));

create or replace function public.find_user(p_query text)
returns table(id uuid, name text) language sql stable security definer set search_path to 'public' as $$
  select p.id, p.name from profiles p
  where auth.uid() is not null and p.id <> auth.uid()
    and length(trim(p_query)) >= 5
    and (lower(p.email) = lower(trim(p_query)) or (coalesce(p.phone,'') <> '' and p.phone = trim(p_query)))
  limit 1;
$$;
revoke execute on function public.find_user(text) from anon, public;
grant execute on function public.find_user(text) to authenticated;

drop policy if exists "Auth users view invites" on public.invite_links;
drop policy if exists "Creator views own invites" on public.invite_links;
create policy "Creator views own invites" on public.invite_links
  for select to authenticated using (created_by = (select auth.uid()));

drop policy if exists "Members view groups" on public.groups;
create policy "Members view groups" on public.groups for select using (
  owner_id = (select auth.uid())
  or exists (select 1 from group_members where group_members.group_id = groups.id
             and group_members.user_id = (select auth.uid())));

drop policy if exists "Join group" on public.group_members;
create policy "Join group" on public.group_members for insert with check (
  ((user_id = (select auth.uid())) and exists (select 1 from groups
     where groups.id = group_members.group_id and groups.owner_id = (select auth.uid())))
  or ((user_id <> (select auth.uid())) and exists (select 1 from group_members gm
     where gm.group_id = group_members.group_id and gm.user_id = (select auth.uid()))));

create or replace function public.preview_invite(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_gid text; v_data jsonb;
begin
  if auth.uid() is null then return null; end if;
  select group_id into v_gid from invite_links where token::text = p_token and expires_at > now();
  if v_gid is null then return null; end if;
  select data into v_data from groups where id = v_gid;
  if v_data is null then return null; end if;
  return jsonb_build_object(
    'group_name', v_data->>'name',
    'unclaimed', coalesce((select jsonb_agg(jsonb_build_object('id', m->>'id', 'name', m->>'name'))
                           from jsonb_array_elements(coalesce(v_data->'members','[]'::jsonb)) m
                           where m->'claimed' = 'false'::jsonb), '[]'::jsonb));
end $$;
revoke execute on function public.preview_invite(text) from anon, public;
grant execute on function public.preview_invite(text) to authenticated;

create or replace function public.join_by_token(p_token text, p_claim_member_id text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_gid text; v_claim text; v_existing text; v_data jsonb;
  v_name text; v_avatar text; v_nick text; v_target jsonb; v_mid text; v_member jsonb; v_act jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select group_id, claim_member_id into v_gid, v_claim
    from invite_links where token::text = p_token and expires_at > now();
  if v_gid is null then return null; end if;

  select member_id into v_existing from group_members where group_id = v_gid and user_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('group_id', v_gid, 'member_id', v_existing);
  end if;

  select data into v_data from groups where id = v_gid for update;
  if v_data is null then return null; end if;
  select name, avatar, nick into v_name, v_avatar, v_nick from profiles where id = v_uid;

  v_claim := coalesce(p_claim_member_id, v_claim);
  if v_claim is not null then
    select m into v_target from jsonb_array_elements(coalesce(v_data->'members','[]'::jsonb)) m
      where m->>'id' = v_claim and m->'claimed' = 'false'::jsonb;
    if v_target is not null and not exists
       (select 1 from group_members where group_id = v_gid and member_id = v_claim) then
      v_mid := v_claim;
      v_data := jsonb_set(v_data, '{members}', (
        select jsonb_agg(case when m->>'id' = v_mid
          then m || jsonb_build_object('claimed', true,
                 'avatar', coalesce(nullif(m->>'avatar',''), v_avatar, ''))
          else m end order by o)
        from jsonb_array_elements(v_data->'members') with ordinality t(m, o)));
      v_name := v_target->>'name';
    end if;
  end if;

  if v_mid is null then
    v_mid := substr(md5(random()::text || clock_timestamp()::text), 1, 7);
    v_member := jsonb_build_object('id', v_mid, 'name', coalesce(nullif(v_name,''), 'Nuevo miembro'), 'avatar', '');
    if coalesce(v_nick,'') <> '' then v_member := v_member || jsonb_build_object('nick', v_nick); end if;
    v_data := jsonb_set(v_data, '{members}', coalesce(v_data->'members','[]'::jsonb) || jsonb_build_array(v_member));
    v_name := v_member->>'name';
  end if;

  insert into group_members (group_id, user_id, member_id) values (v_gid, v_uid, v_mid);

  v_act := jsonb_build_object('id', substr(md5(random()::text), 1, 7),
    'ts', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'type', 'member_joined', 'actorId', v_mid, 'actorName', v_name);
  v_data := jsonb_set(v_data, '{activity}', (
    select coalesce(jsonb_agg(e order by o), '[]'::jsonb) from (
      select e, o from jsonb_array_elements(coalesce(v_data->'activity','[]'::jsonb) || jsonb_build_array(v_act))
        with ordinality t(e, o) order by o desc limit 200) s));

  update groups set data = v_data, updated_at = now() where id = v_gid;
  return jsonb_build_object('group_id', v_gid, 'member_id', v_mid);
end $$;
revoke execute on function public.join_by_token(text, text) from anon, public;
grant execute on function public.join_by_token(text, text) to authenticated;
