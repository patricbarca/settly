-- Escrituras directas a `groups` (API REST, rol authenticated) — 2026-10-26.
-- Antes, un miembro podía hacer UPDATE directo del blob y saltarse las uniones
-- de update_group_data (borrar gastos/pagos ajenos) o cambiar owner_id.
-- No se revoca el UPDATE porque builds viejos de iOS (y leaveGroup) lo usan; en
-- su lugar un trigger aplica las MISMAS reglas que update_group_data y bloquea
-- el cambio de dueño. Las RPC SECURITY DEFINER (current_user = postgres) y el
-- service_role no pasan por aquí.

create or replace function public.merge_group_data(cur jsonb, p_data jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare tombs jsonb; keep jsonb := '{}'::jsonb; k text;
begin
  if cur is null then return p_data; end if;
  p_data := keep_media_urls(p_data, cur);
  select coalesce(jsonb_agg(distinct t), '[]'::jsonb) into tombs from (
    select jsonb_array_elements_text(coalesce(cur->'deletedExpenseIds', '[]'::jsonb)) t
    union select jsonb_array_elements_text(coalesce(p_data->'deletedExpenseIds', '[]'::jsonb))) x;
  foreach k in array array['heroColor','heroImage','heroImagePos','defaultSplit','budget'] loop
    if not (p_data ? k) and cur ? k then keep := keep || jsonb_build_object(k, cur->k); end if;
  end loop;
  return jsonb_strip_nulls_hero(p_data || keep || jsonb_build_object(
    'expenses',          merge_expenses(cur->'expenses', p_data->'expenses', tombs),
    'deletedExpenseIds', tombs,
    'settlements',       jsonb_union_by_id(cur->'settlements',   p_data->'settlements'),
    'notifications',     jsonb_union_by_id(cur->'notifications', p_data->'notifications'),
    'activity',          jsonb_union_by_id(cur->'activity',      p_data->'activity')));
end $$;
-- Función pura (no lee ni escribe tablas): la necesita el trigger, que corre como authenticated.
revoke execute on function public.merge_group_data(jsonb, jsonb) from anon, public;
grant execute on function public.merge_group_data(jsonb, jsonb) to authenticated;

create or replace function public.update_group_data(p_group_id text, p_data jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare cur jsonb;
begin
  if not exists (select 1 from group_members gm where gm.group_id = p_group_id and gm.user_id = auth.uid()) then
    raise exception 'not_a_member';
  end if;
  select data into cur from groups where id = p_group_id for update;
  update groups set data = merge_group_data(cur, p_data), updated_at = now() where id = p_group_id;
end $$;

create or replace function public.guard_direct_group_update()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_change_not_allowed';
  end if;
  if new.data is distinct from old.data then
    new.data := merge_group_data(old.data, new.data);
  end if;
  return new;
end $$;

create trigger groups_guard_direct_update
  before update on public.groups
  for each row execute function public.guard_direct_group_update();
