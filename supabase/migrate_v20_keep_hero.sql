-- Apariencia del grupo (heroColor/heroImage/heroImagePos): un cliente viejo que
-- no conoce estas claves ya no las borra al guardar el blob. Para quitarlas, el
-- cliente nuevo manda null explícito (jsonb_strip_nulls_hero las elimina).
-- ✅ Aplicada en producción vía MCP (2026-10-15).
CREATE OR REPLACE FUNCTION public.jsonb_strip_nulls_hero(d jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  select d - (select coalesce(array_agg(k), '{}') from unnest(array['heroColor','heroImage','heroImagePos']) k where d -> k = 'null'::jsonb)
$$;
revoke execute on function public.jsonb_strip_nulls_hero(jsonb) from anon;

CREATE OR REPLACE FUNCTION public.update_group_data(p_group_id text, p_data jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare cur jsonb; tombs jsonb; keep jsonb := '{}'::jsonb; k text;
begin
  if not exists (select 1 from group_members gm where gm.group_id = p_group_id and gm.user_id = auth.uid()) then
    raise exception 'not_a_member';
  end if;
  select data into cur from groups where id = p_group_id for update;
  if cur is null then
    update groups set data = p_data, updated_at = now() where id = p_group_id;
    return;
  end if;
  select coalesce(jsonb_agg(distinct t), '[]'::jsonb) into tombs from (
    select jsonb_array_elements_text(coalesce(cur->'deletedExpenseIds', '[]'::jsonb)) t
    union select jsonb_array_elements_text(coalesce(p_data->'deletedExpenseIds', '[]'::jsonb))) x;
  foreach k in array array['heroColor','heroImage','heroImagePos'] loop
    if not (p_data ? k) and cur ? k then keep := keep || jsonb_build_object(k, cur->k); end if;
  end loop;
  update groups set
    data = jsonb_strip_nulls_hero(p_data || keep || jsonb_build_object(
      'expenses',          public.merge_expenses(cur->'expenses', p_data->'expenses', tombs),
      'deletedExpenseIds', tombs,
      'settlements',       jsonb_union_by_id(cur->'settlements',   p_data->'settlements'),
      'notifications',     jsonb_union_by_id(cur->'notifications', p_data->'notifications'),
      'activity',          jsonb_union_by_id(cur->'activity',      p_data->'activity'))),
    updated_at = now()
  where id = p_group_id;
end $function$;
