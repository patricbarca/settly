-- v19: parchear UN pago por id (como patch_expense). Lo usa "Convertir todo /
-- Volver a separar" (saldos por moneda): update_group_data une los pagos con
-- el SERVIDOR ganando por id, así que un blob no puede cambiar un pago ya
-- guardado. Solo CREATE OR REPLACE (sin drops).
CREATE OR REPLACE FUNCTION public.patch_settlement(p_group_id text, p_settlement_id text, p_patch jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_data jsonb;
  v_idx int;
BEGIN
  IF NOT public.is_member_of(p_group_id) THEN
    RAISE EXCEPTION 'not a member of this group';
  END IF;
  SELECT data INTO v_data FROM groups WHERE id = p_group_id FOR UPDATE;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'group not found';
  END IF;
  SELECT ord - 1 INTO v_idx
  FROM jsonb_array_elements(COALESCE(v_data->'settlements', '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  WHERE elem->>'id' = p_settlement_id;
  IF v_idx IS NOT NULL THEN
    v_data := jsonb_set(v_data, ARRAY['settlements', v_idx::text], (v_data->'settlements'->v_idx) || p_patch);
    UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
  END IF;
END;
$function$;
