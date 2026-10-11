-- ============================================================
-- Settlia – migrate_v16: una escritura de blob ya no puede borrar GASTOS
--
-- Caso real (grupo AlePat, 2026-10-06/07): Alecita añadió 3 gastos (add_expense,
-- atómico); al día siguiente otro móvil con una copia vieja del grupo guardó el
-- blob completo (update_group_data) y su lista de `expenses` REEMPLAZÓ a la del
-- servidor → los 3 gastos desaparecieron sin ningún evento de borrado.
-- migrate_v12 ya protegía settlements/notifications/activity; expenses no.
--
-- Solución:
--  * `deletedExpenseIds` (lápidas, append-only) en el JSON del grupo. Un gasto
--    borrado deja su id ahí, así un blob viejo no lo resucita.
--  * update_group_data: gastos = los del cliente (sus ediciones mandan) + los
--    que SOLO están en el servidor (añadidos por otro), quitando los borrados.
--  * delete_expense: además de quitarlo, apunta la lápida.
-- Idempotente; solo CREATE OR REPLACE (sin drops).
-- ============================================================

create or replace function public.merge_expenses(server jsonb, incoming jsonb, tombs jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
  from (
    -- Gastos que solo tiene el servidor (otro miembro los añadió): primero,
    -- como hace add_expense con los nuevos.
    select s.e, s.n as ord
    from jsonb_array_elements(coalesce(server, '[]'::jsonb)) with ordinality s(e, n)
    where (s.e->>'id') is not null
      and not exists (select 1 from jsonb_array_elements(coalesce(incoming, '[]'::jsonb)) i where i->>'id' = s.e->>'id')
    union all
    select i.e, 1000000 + i.n
    from jsonb_array_elements(coalesce(incoming, '[]'::jsonb)) with ordinality i(e, n)
  ) u
  where not exists (
    select 1 from jsonb_array_elements_text(coalesce(tombs, '[]'::jsonb)) t where t = u.e->>'id'
  )
$$;

create or replace function public.update_group_data(p_group_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare cur jsonb; tombs jsonb;
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

  select coalesce(jsonb_agg(distinct t), '[]'::jsonb) into tombs
  from (
    select jsonb_array_elements_text(coalesce(cur->'deletedExpenseIds', '[]'::jsonb)) t
    union
    select jsonb_array_elements_text(coalesce(p_data->'deletedExpenseIds', '[]'::jsonb))
  ) x;

  update groups set
    data = p_data || jsonb_build_object(
      'expenses',          public.merge_expenses(cur->'expenses', p_data->'expenses', tombs),
      'deletedExpenseIds', tombs,
      'settlements',       jsonb_union_by_id(cur->'settlements',   p_data->'settlements'),
      'notifications',     jsonb_union_by_id(cur->'notifications', p_data->'notifications'),
      'activity',          jsonb_union_by_id(cur->'activity',      p_data->'activity')
    ),
    updated_at = now()
  where id = p_group_id;
end $function$;

create or replace function public.delete_expense(p_group_id text, p_expense_id text, p_activity jsonb default null::jsonb, p_notif_remove_type text default null::text, p_notif_remove_expense_id text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_data jsonb;
begin
  if not public.is_member_of(p_group_id) then
    raise exception 'not a member of this group';
  end if;

  select data into v_data from groups where id = p_group_id for update;
  if v_data is null then
    raise exception 'group not found';
  end if;

  v_data := jsonb_set(v_data, '{expenses}', coalesce((
    select jsonb_agg(elem) from jsonb_array_elements(coalesce(v_data->'expenses', '[]'::jsonb)) elem
    where elem->>'id' <> p_expense_id
  ), '[]'::jsonb));

  -- Lápida: que un blob viejo no lo resucite.
  if not coalesce(v_data->'deletedExpenseIds', '[]'::jsonb) ? p_expense_id then
    v_data := jsonb_set(v_data, '{deletedExpenseIds}', coalesce(v_data->'deletedExpenseIds', '[]'::jsonb) || to_jsonb(p_expense_id));
  end if;

  if p_activity is not null then
    v_data := jsonb_set(v_data, '{activity}', public.jsonb_array_cap(coalesce(v_data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity), 200));
  end if;
  if p_notif_remove_type is not null then
    v_data := jsonb_set(v_data, '{notifications}', coalesce((
      select jsonb_agg(elem) from jsonb_array_elements(coalesce(v_data->'notifications', '[]'::jsonb)) elem
      where not (elem->>'type' = p_notif_remove_type and elem->>'expenseId' = p_notif_remove_expense_id)
    ), '[]'::jsonb));
  end if;

  update groups set data = v_data, updated_at = now() where id = p_group_id;
end;
$function$;
