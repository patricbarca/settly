-- Aprobación del dueño al unirse por link (2026-10-26).
-- Quien abre un link de invitación ya no entra directo: queda una solicitud
-- pendiente que el dueño del grupo acepta o rechaza. El dueño (o grupos viejos
-- sin dueño) entran directo.

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_member_id text,
  name text,
  avatar text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists join_requests_one_pending
  on public.join_requests (group_id, user_id) where status = 'pending';
alter table public.join_requests enable row level security;
revoke insert, update, delete on public.join_requests from anon, authenticated;
create policy "See own or owned join requests" on public.join_requests
  for select to authenticated using (
    user_id = (select auth.uid())
    or exists (select 1 from groups g where g.id = join_requests.group_id
               and g.owner_id = (select auth.uid())));
alter publication supabase_realtime add table public.join_requests;

-- Une a un usuario al grupo (reclamando una plaza sin cuenta si se pide y sigue
-- libre, o creando un miembro nuevo). Uso interno de las RPC de abajo.
create or replace function public._join_member(v_gid text, v_uid uuid, v_claim text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_existing text; v_data jsonb; v_name text; v_avatar text; v_nick text;
  v_target jsonb; v_mid text; v_member jsonb; v_act jsonb;
begin
  select member_id into v_existing from group_members where group_id = v_gid and user_id = v_uid;
  if v_existing is not null then return v_existing; end if;

  select data into v_data from groups where id = v_gid for update;
  if v_data is null then return null; end if;
  select name, avatar, nick into v_name, v_avatar, v_nick from profiles where id = v_uid;

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
  return v_mid;
end $$;
revoke execute on function public._join_member(text, uuid, text) from anon, public, authenticated;

-- Abrir un link: si ya eres miembro o eres el dueño, entras; si no, se crea
-- (o actualiza) una solicitud pendiente para el dueño.
create or replace function public.join_by_token(p_token text, p_claim_member_id text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_gid text; v_claim text; v_existing text; v_owner uuid;
  v_name text; v_avatar text; v_gname text; v_mid text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select group_id, claim_member_id into v_gid, v_claim
    from invite_links where token::text = p_token and expires_at > now();
  if v_gid is null then return null; end if;
  v_claim := coalesce(p_claim_member_id, v_claim);

  select member_id into v_existing from group_members where group_id = v_gid and user_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('group_id', v_gid, 'member_id', v_existing);
  end if;

  select owner_id, data->>'name' into v_owner, v_gname from groups where id = v_gid;
  if v_owner is null or v_owner = v_uid then
    v_mid := _join_member(v_gid, v_uid, v_claim);
    if v_mid is null then return null; end if;
    return jsonb_build_object('group_id', v_gid, 'member_id', v_mid);
  end if;

  select name, avatar into v_name, v_avatar from profiles where id = v_uid;
  update join_requests set claim_member_id = v_claim, name = v_name, avatar = v_avatar, created_at = now()
    where group_id = v_gid and user_id = v_uid and status = 'pending';
  if not found then
    insert into join_requests (group_id, user_id, claim_member_id, name, avatar)
      values (v_gid, v_uid, v_claim, v_name, v_avatar);
  end if;
  return jsonb_build_object('pending', true, 'group_id', v_gid, 'group_name', v_gname, 'owner_id', v_owner);
end $$;
revoke execute on function public.join_by_token(text, text) from anon, public;
grant execute on function public.join_by_token(text, text) to authenticated;

create or replace function public.approve_join_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r record; v_mid text;
begin
  select jr.* into r from join_requests jr join groups g on g.id = jr.group_id
    where jr.id = p_id and jr.status = 'pending' and g.owner_id = auth.uid() for update of jr;
  if not found then raise exception 'not_allowed'; end if;
  v_mid := _join_member(r.group_id, r.user_id, r.claim_member_id);
  update join_requests set status = 'approved', decided_at = now() where id = p_id;
  return jsonb_build_object('group_id', r.group_id, 'user_id', r.user_id, 'member_id', v_mid);
end $$;
revoke execute on function public.approve_join_request(uuid) from anon, public;
grant execute on function public.approve_join_request(uuid) to authenticated;

create or replace function public.reject_join_request(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update join_requests jr set status = 'rejected', decided_at = now()
    from groups g
    where jr.id = p_id and jr.status = 'pending' and g.id = jr.group_id and g.owner_id = auth.uid();
  if not found then raise exception 'not_allowed'; end if;
end $$;
revoke execute on function public.reject_join_request(uuid) from anon, public;
grant execute on function public.reject_join_request(uuid) to authenticated;
