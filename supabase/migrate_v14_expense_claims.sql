-- Run once in the SQL Editor.
--
-- Cuenta compartida con auto-asignación ("¿qué consumiste?").
--
-- Problema de concurrencia: seis personas en una mesa marcando sus platos a la
-- vez. Si cada cliente escribiera su copia del array `items` (vía patch_expense
-- con el gasto entero), el último en llegar borraría las asignaciones de los
-- demás — el mismo clobber que ya costó un pago perdido.
--
-- Fix: `claim_expense_items` toca SOLO la pertenencia de UN miembro dentro de
-- `items[].participantIds`, bajo `SELECT ... FOR UPDATE`. Dos personas marcando
-- platos distintos (o el mismo) se serializan en Postgres y se suman; ninguna
-- puede borrar lo del otro. El servidor recalcula además `splits` a partir de
-- los ítems, así el reparto siempre es coherente con lo asignado.

-- ── Reparto derivado de los ítems ──────────────────────────────────────────
-- Espejo EXACTO de la lógica del cliente (ItemizedExpenseEditor):
--   1. cada ítem se divide en partes iguales entre quienes lo comparten
--   2. recargos (y descuentos = fee negativo) proporcional al consumo
--   3. propina a partes iguales entre quienes consumieron
--   4. redondeo a 2 decimales; el céntimo suelto va a la parte más grande
-- `p_fallback_ids` = a quién repartir los ítems que NADIE ha reclamado todavía
-- (reparto provisional mientras la ronda está abierta). Si es NULL/vacío, un
-- ítem sin reclamar simplemente no se reparte.
CREATE OR REPLACE FUNCTION public.itemized_splits(p_expense jsonb, p_fallback_ids jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_splits    jsonb := '{}'::jsonb;
  v_item      jsonb;
  v_who       jsonb;
  v_n         int;
  v_price     numeric;
  v_per       numeric;
  v_id        text;
  v_items_tot numeric := 0;
  v_fees_tot  numeric := 0;
  v_tip       numeric := 0;
  v_parts     text[];
  v_total     numeric;
  v_cents     bigint;
  v_sum_cents bigint := 0;
  v_diff      bigint;
  v_target    text := NULL;
  v_best      numeric := -1;
  v_val       numeric;
  v_out       jsonb := '{}'::jsonb;
BEGIN
  -- 1. Ítems
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_expense->'items', '[]'::jsonb)) LOOP
    v_price := COALESCE((v_item->>'price')::numeric, 0);
    v_items_tot := v_items_tot + v_price;
    v_who := COALESCE(v_item->'participantIds', '[]'::jsonb);
    IF jsonb_array_length(v_who) = 0 THEN
      v_who := COALESCE(p_fallback_ids, '[]'::jsonb);
    END IF;
    v_n := jsonb_array_length(v_who);
    IF v_n > 0 AND v_price <> 0 THEN
      v_per := v_price / v_n;
      FOR v_id IN SELECT jsonb_array_elements_text(v_who) LOOP
        v_splits := jsonb_set(v_splits, ARRAY[v_id], to_jsonb(COALESCE((v_splits->>v_id)::numeric, 0) + v_per));
      END LOOP;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(COALESCE((f->>'amount')::numeric, 0)), 0)
    INTO v_fees_tot
    FROM jsonb_array_elements(COALESCE(p_expense->'fees', '[]'::jsonb)) f;
  v_tip := COALESCE((p_expense->>'tip')::numeric, 0);

  -- Quiénes consumieron (parte > 0.001)
  SELECT COALESCE(array_agg(k), '{}')
    INTO v_parts
    FROM jsonb_each(v_splits) AS e(k, v)
   WHERE (v#>>'{}')::numeric > 0.001;

  -- 2. Recargos / descuentos, proporcional al consumo
  IF abs(v_fees_tot) > 0.001 AND v_items_tot > 0 THEN
    FOREACH v_id IN ARRAY v_parts LOOP
      v_val := (v_splits->>v_id)::numeric;
      v_splits := jsonb_set(v_splits, ARRAY[v_id], to_jsonb(v_val + v_fees_tot * (v_val / v_items_tot)));
    END LOOP;
  END IF;

  -- 3. Propina, a partes iguales
  IF v_tip > 0 AND array_length(v_parts, 1) > 0 THEN
    v_per := v_tip / array_length(v_parts, 1);
    FOREACH v_id IN ARRAY v_parts LOOP
      v_splits := jsonb_set(v_splits, ARRAY[v_id], to_jsonb((v_splits->>v_id)::numeric + v_per));
    END LOOP;
  END IF;

  -- 4. Redondeo a céntimos + corrección del descuadre
  v_total := round(v_items_tot + v_fees_tot + v_tip, 2);
  FOR v_id, v_val IN SELECT k, (v#>>'{}')::numeric FROM jsonb_each(v_splits) AS e(k, v) LOOP
    v_cents := round(v_val * 100);
    v_out := jsonb_set(v_out, ARRAY[v_id], to_jsonb(v_cents::numeric / 100));
    IF v_cents > 0 THEN
      v_sum_cents := v_sum_cents + v_cents;
      IF v_val > v_best THEN v_best := v_val; v_target := v_id; END IF;
    END IF;
  END LOOP;
  v_diff := round(v_total * 100)::bigint - v_sum_cents;
  IF v_diff <> 0 AND v_target IS NOT NULL THEN
    v_out := jsonb_set(v_out, ARRAY[v_target], to_jsonb(round((v_out->>v_target)::numeric + v_diff::numeric / 100, 2)));
  END IF;

  RETURN v_out;
END;
$$;

-- ── Reclamar ítems (atómico, por miembro) ──────────────────────────────────
-- p_item_indexes: índices (0-based) de los ítems que ESTE miembro consumió.
-- El miembro se AÑADE a esos y se QUITA del resto — en una sola pasada bajo
-- lock de fila, sin tocar lo que hayan marcado los demás.
CREATE OR REPLACE FUNCTION public.claim_expense_items(
  p_group_id     text,
  p_expense_id   text,
  p_member_id    text,
  p_item_indexes int[],
  p_done         boolean DEFAULT true,
  p_activity     jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data      jsonb;
  v_owner     uuid;
  v_caller    text;
  v_expenses  jsonb;
  v_idx       int := -1;
  v_i         int;
  v_exp       jsonb;
  v_items     jsonb := '[]'::jsonb;
  v_item      jsonb;
  v_who       jsonb;
  v_round     jsonb;
  v_expected  jsonb;
  v_done      jsonb;
  v_fallback  jsonb;
  v_splits    jsonb;
  v_parts     jsonb;
BEGIN
  IF NOT public.is_member_of(p_group_id) THEN
    RAISE EXCEPTION 'not a member of this group';
  END IF;

  SELECT member_id INTO v_caller
    FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid() LIMIT 1;
  SELECT owner_id INTO v_owner FROM groups WHERE id = p_group_id;

  SELECT data INTO v_data FROM groups WHERE id = p_group_id FOR UPDATE;
  IF v_data IS NULL THEN RAISE EXCEPTION 'group not found'; END IF;

  v_expenses := COALESCE(v_data->'expenses', '[]'::jsonb);
  FOR v_i IN 0 .. jsonb_array_length(v_expenses) - 1 LOOP
    IF v_expenses->v_i->>'id' = p_expense_id THEN v_idx := v_i; EXIT; END IF;
  END LOOP;
  IF v_idx < 0 THEN RAISE EXCEPTION 'expense not found'; END IF;
  v_exp := v_expenses->v_idx;

  -- Quién puede marcar: por TI siempre; por OTROS solo el dueño del grupo,
  -- quien abrió la ronda, o quien creó el gasto (el que puso el dinero y
  -- tiene el ticket delante). Se comprueba tras leer el gasto porque dos de
  -- los tres permisos viven dentro de él.
  IF v_caller IS DISTINCT FROM p_member_id
     AND v_owner IS DISTINCT FROM auth.uid()
     AND v_caller IS DISTINCT FROM (v_exp->'claimRound'->>'openedBy')
     AND v_caller IS DISTINCT FROM (v_exp->>'createdBy') THEN
    RAISE EXCEPTION 'not allowed to claim for another member';
  END IF;

  -- Añadir/quitar a este miembro ítem a ítem
  FOR v_i IN 0 .. GREATEST(jsonb_array_length(COALESCE(v_exp->'items', '[]'::jsonb)) - 1, -1) LOOP
    v_item := v_exp->'items'->v_i;
    v_who := COALESCE(v_item->'participantIds', '[]'::jsonb);
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_who
      FROM jsonb_array_elements_text(v_who) AS t(x) WHERE x <> p_member_id;
    IF p_item_indexes IS NOT NULL AND v_i = ANY (p_item_indexes) THEN
      v_who := v_who || to_jsonb(p_member_id);
    END IF;
    v_items := v_items || jsonb_build_array(jsonb_set(v_item, '{participantIds}', v_who));
  END LOOP;
  v_exp := jsonb_set(v_exp, '{items}', v_items);

  -- Marcar a este miembro como "listo" dentro de la ronda
  v_round := v_exp->'claimRound';
  IF v_round IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_done
      FROM jsonb_array_elements_text(COALESCE(v_round->'done', '[]'::jsonb)) AS t(x)
      WHERE x <> p_member_id;
    IF p_done THEN v_done := v_done || to_jsonb(p_member_id); END IF;
    v_round := jsonb_set(v_round, '{done}', v_done);
    v_exp := jsonb_set(v_exp, '{claimRound}', v_round);
    v_expected := COALESCE(v_round->'expected', '[]'::jsonb);
  END IF;

  -- Reparto: provisional (ítems sin reclamar → entre los convocados) mientras
  -- la ronda siga abierta; definitivo si ya está cerrada.
  IF v_round IS NOT NULL AND v_round->>'status' = 'open' THEN
    v_fallback := v_expected;
  ELSE
    v_fallback := NULL;
  END IF;
  v_splits := public.itemized_splits(v_exp, v_fallback);
  SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) INTO v_parts
    FROM jsonb_each(v_splits) AS e(k, v) WHERE (v#>>'{}')::numeric > 0.001;
  v_exp := jsonb_set(jsonb_set(v_exp, '{splits}', v_splits), '{participantIds}', v_parts);

  v_data := jsonb_set(v_data, ARRAY['expenses', v_idx::text], v_exp);
  IF p_activity IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{activity}',
      public.jsonb_array_cap(COALESCE(v_data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity), 200));
  END IF;

  UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
  RETURN v_exp;
END;
$$;

-- ── Cerrar la ronda ────────────────────────────────────────────────────────
-- p_policy: 'all'       → los ítems sin reclamar se reparten entre TODOS los convocados
--           'responders'→ ... solo entre quienes sí respondieron
--           'keep'      → se dejan como están (nadie los paga)
CREATE OR REPLACE FUNCTION public.close_claim_round(
  p_group_id   text,
  p_expense_id text,
  p_policy     text DEFAULT 'all',
  p_activity   jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data     jsonb;
  v_owner    uuid;
  v_caller   text;
  v_expenses jsonb;
  v_idx      int := -1;
  v_i        int;
  v_exp      jsonb;
  v_round    jsonb;
  v_fill     jsonb;
  v_items    jsonb := '[]'::jsonb;
  v_item     jsonb;
  v_splits   jsonb;
  v_parts    jsonb;
BEGIN
  IF NOT public.is_member_of(p_group_id) THEN
    RAISE EXCEPTION 'not a member of this group';
  END IF;

  SELECT member_id INTO v_caller
    FROM group_members WHERE group_id = p_group_id AND user_id = auth.uid() LIMIT 1;
  SELECT owner_id INTO v_owner FROM groups WHERE id = p_group_id;

  SELECT data INTO v_data FROM groups WHERE id = p_group_id FOR UPDATE;
  IF v_data IS NULL THEN RAISE EXCEPTION 'group not found'; END IF;

  v_expenses := COALESCE(v_data->'expenses', '[]'::jsonb);
  FOR v_i IN 0 .. jsonb_array_length(v_expenses) - 1 LOOP
    IF v_expenses->v_i->>'id' = p_expense_id THEN v_idx := v_i; EXIT; END IF;
  END LOOP;
  IF v_idx < 0 THEN RAISE EXCEPTION 'expense not found'; END IF;
  v_exp := v_expenses->v_idx;
  v_round := COALESCE(v_exp->'claimRound', '{}'::jsonb);

  -- Cerrar congela el reparto de TODOS: solo el dueño del grupo, quien abrió
  -- la ronda o quien creó el gasto.
  IF v_owner IS DISTINCT FROM auth.uid()
     AND v_caller IS DISTINCT FROM (v_round->>'openedBy')
     AND v_caller IS DISTINCT FROM (v_exp->>'createdBy') THEN
    RAISE EXCEPTION 'not allowed to close this claim round';
  END IF;

  IF p_policy = 'responders' THEN
    v_fill := COALESCE(v_round->'done', '[]'::jsonb);
    IF jsonb_array_length(v_fill) = 0 THEN v_fill := COALESCE(v_round->'expected', '[]'::jsonb); END IF;
  ELSIF p_policy = 'all' THEN
    v_fill := COALESCE(v_round->'expected', '[]'::jsonb);
  ELSE
    v_fill := '[]'::jsonb;
  END IF;

  -- Congela el reparto: los ítems sin reclamar pasan a llevar la lista de relleno.
  FOR v_i IN 0 .. GREATEST(jsonb_array_length(COALESCE(v_exp->'items', '[]'::jsonb)) - 1, -1) LOOP
    v_item := v_exp->'items'->v_i;
    IF jsonb_array_length(COALESCE(v_item->'participantIds', '[]'::jsonb)) = 0
       AND jsonb_array_length(v_fill) > 0 THEN
      v_item := jsonb_set(v_item, '{participantIds}', v_fill);
    END IF;
    v_items := v_items || jsonb_build_array(v_item);
  END LOOP;
  v_exp := jsonb_set(v_exp, '{items}', v_items);

  v_round := jsonb_set(jsonb_set(v_round, '{status}', '"closed"'), '{closedAt}', to_jsonb(now()));
  v_exp := jsonb_set(v_exp, '{claimRound}', v_round);

  v_splits := public.itemized_splits(v_exp, NULL);
  SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) INTO v_parts
    FROM jsonb_each(v_splits) AS e(k, v) WHERE (v#>>'{}')::numeric > 0.001;
  v_exp := jsonb_set(jsonb_set(v_exp, '{splits}', v_splits), '{participantIds}', v_parts);

  v_data := jsonb_set(v_data, ARRAY['expenses', v_idx::text], v_exp);
  IF p_activity IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{activity}',
      public.jsonb_array_cap(COALESCE(v_data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity), 200));
  END IF;

  UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
  RETURN v_exp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.itemized_splits(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expense_items(text, text, text, int[], boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_claim_round(text, text, text, jsonb) TO authenticated;
