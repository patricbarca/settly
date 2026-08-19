-- migrate_v12_update_group_data_merge.sql
-- Fix del "clobber" de pagos: `persist`/`syncOutbox` (store.ts) escribían el JSON
-- COMPLETO del grupo, así que una escritura de blob con datos viejos (desde otro
-- dispositivo o tras un back-fill) podía BORRAR un settlement ya guardado por otro
-- → pagos perdidos. Ahora esas escrituras van por `update_group_data`, que UNE por
-- id los arrays append-only (settlements, notifications, activity) con el servidor:
-- el servidor gana en conflicto de id (no se revierte un confirm), y se añaden los
-- items nuevos del cliente (pagos offline). El resto del blob (name, members,
-- expenses, recurring, settings) se escribe tal cual. Aplicada vía conector MCP.

create or replace function jsonb_union_by_id(server jsonb, incoming jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(e), '[]'::jsonb)
  from (
    select e from jsonb_array_elements(coalesce(server, '[]'::jsonb)) e
    union all
    select e from jsonb_array_elements(coalesce(incoming, '[]'::jsonb)) e
    where (e->>'id') is not null
      and not exists (
        select 1 from jsonb_array_elements(coalesce(server, '[]'::jsonb)) s
        where s->>'id' = e->>'id'
      )
  ) u
$$;

create or replace function update_group_data(p_group_id text, p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb;
begin
  if not exists (
    select 1 from group_members gm where gm.group_id = p_group_id and gm.user_id = auth.uid()
  ) then
    raise exception 'not_a_member';
  end if;

  select data into cur from groups where id = p_group_id for update;
  if cur is null then
    update groups set data = p_data, updated_at = now() where id = p_group_id;
    return;
  end if;

  update groups set
    data = p_data || jsonb_build_object(
      'settlements',   jsonb_union_by_id(cur->'settlements',   p_data->'settlements'),
      'notifications', jsonb_union_by_id(cur->'notifications', p_data->'notifications'),
      'activity',      jsonb_union_by_id(cur->'activity',      p_data->'activity')
    ),
    updated_at = now()
  where id = p_group_id;
end $$;

grant execute on function update_group_data(text, jsonb) to authenticated;
grant execute on function jsonb_union_by_id(jsonb, jsonb) to authenticated;
