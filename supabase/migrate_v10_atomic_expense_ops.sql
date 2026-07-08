-- Run once in the SQL Editor.
--
-- Problem: every expense add/edit/delete used to read-modify-write the
-- ENTIRE group.data JSONB blob from whatever (possibly stale) copy the
-- client had in memory. Two people editing the group around the same time
-- — even completely different expenses — could silently clobber each
-- other's change: whoever's UPDATE reached Postgres last would overwrite
-- the other's edit with their own stale copy of unrelated fields.
--
-- Fix: atomic, targeted functions that patch just ONE expense (or append
-- one activity/notification entry) inside the JSONB, using `SELECT ... FOR
-- UPDATE` to lock the row for the duration of the read-modify-write. Two
-- concurrent calls now serialize at the database level instead of racing
-- in application code — the second one always merges on top of the first,
-- never overwrites unrelated data.

-- Helper: keep an activity/notifications array capped at N entries (mirrors
-- the client-side `.slice(-200)` / `.slice(-100)` behavior).
CREATE OR REPLACE FUNCTION public.jsonb_array_cap(p_arr jsonb, p_max int)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_arr IS NULL THEN '[]'::jsonb
    WHEN jsonb_array_length(p_arr) > p_max THEN (
      SELECT COALESCE(jsonb_agg(x ORDER BY i), '[]'::jsonb)
      FROM jsonb_array_elements(p_arr) WITH ORDINALITY AS t(x, i)
      WHERE i > jsonb_array_length(p_arr) - p_max
    )
    ELSE p_arr
  END;
$$;

-- Adds a new expense (prepended, matching client behavior) and optionally
-- appends one activity entry and/or one notification — atomically.
CREATE OR REPLACE FUNCTION public.add_expense(
  p_group_id text,
  p_expense jsonb,
  p_activity jsonb DEFAULT NULL,
  p_notif_add jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb;
BEGIN
  IF NOT public.is_member_of(p_group_id) THEN
    RAISE EXCEPTION 'not a member of this group';
  END IF;

  SELECT data INTO v_data FROM groups WHERE id = p_group_id FOR UPDATE;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'group not found';
  END IF;

  v_data := jsonb_set(v_data, '{expenses}', jsonb_build_array(p_expense) || COALESCE(v_data->'expenses', '[]'::jsonb));
  IF p_activity IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{activity}', public.jsonb_array_cap(COALESCE(v_data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity), 200));
  END IF;
  IF p_notif_add IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{notifications}', public.jsonb_array_cap(COALESCE(v_data->'notifications', '[]'::jsonb) || jsonb_build_array(p_notif_add), 100));
  END IF;

  UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_expense(text, jsonb, jsonb, jsonb) TO authenticated;

-- Merges `p_patch` into the expense matching `p_expense_id` (shallow merge —
-- same semantics as client-side `{ ...expense, ...patch }`), and optionally
-- appends an activity entry, adds a notification, and/or removes
-- notifications matching a (type, expenseId) predicate — all atomically.
CREATE OR REPLACE FUNCTION public.patch_expense(
  p_group_id text,
  p_expense_id text,
  p_patch jsonb,
  p_activity jsonb DEFAULT NULL,
  p_notif_add jsonb DEFAULT NULL,
  p_notif_remove_type text DEFAULT NULL,
  p_notif_remove_expense_id text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  FROM jsonb_array_elements(COALESCE(v_data->'expenses', '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  WHERE elem->>'id' = p_expense_id;

  IF v_idx IS NOT NULL THEN
    v_data := jsonb_set(v_data, ARRAY['expenses', v_idx::text], (v_data->'expenses'->v_idx) || p_patch);
  END IF;
  -- Si no se encuentra (alguien más lo borró justo antes), no hay nada que
  -- parchear — seguimos igualmente con actividad/notificaciones si vinieran.

  IF p_activity IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{activity}', public.jsonb_array_cap(COALESCE(v_data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity), 200));
  END IF;
  IF p_notif_add IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{notifications}', public.jsonb_array_cap(COALESCE(v_data->'notifications', '[]'::jsonb) || jsonb_build_array(p_notif_add), 100));
  END IF;
  IF p_notif_remove_type IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{notifications}', COALESCE((
      SELECT jsonb_agg(elem) FROM jsonb_array_elements(COALESCE(v_data->'notifications', '[]'::jsonb)) elem
      WHERE NOT (elem->>'type' = p_notif_remove_type AND elem->>'expenseId' = p_notif_remove_expense_id)
    ), '[]'::jsonb));
  END IF;

  UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.patch_expense(text, text, jsonb, jsonb, jsonb, text, text) TO authenticated;

-- Removes the expense matching `p_expense_id`, optionally appends an
-- activity entry, and optionally removes notifications matching a (type,
-- expenseId) predicate (e.g. a pending "delete requested" notice for it) —
-- atomically.
CREATE OR REPLACE FUNCTION public.delete_expense(
  p_group_id text,
  p_expense_id text,
  p_activity jsonb DEFAULT NULL,
  p_notif_remove_type text DEFAULT NULL,
  p_notif_remove_expense_id text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb;
BEGIN
  IF NOT public.is_member_of(p_group_id) THEN
    RAISE EXCEPTION 'not a member of this group';
  END IF;

  SELECT data INTO v_data FROM groups WHERE id = p_group_id FOR UPDATE;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'group not found';
  END IF;

  v_data := jsonb_set(v_data, '{expenses}', COALESCE((
    SELECT jsonb_agg(elem) FROM jsonb_array_elements(COALESCE(v_data->'expenses', '[]'::jsonb)) elem
    WHERE elem->>'id' <> p_expense_id
  ), '[]'::jsonb));

  IF p_activity IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{activity}', public.jsonb_array_cap(COALESCE(v_data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity), 200));
  END IF;
  IF p_notif_remove_type IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{notifications}', COALESCE((
      SELECT jsonb_agg(elem) FROM jsonb_array_elements(COALESCE(v_data->'notifications', '[]'::jsonb)) elem
      WHERE NOT (elem->>'type' = p_notif_remove_type AND elem->>'expenseId' = p_notif_remove_expense_id)
    ), '[]'::jsonb));
  END IF;

  UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_expense(text, text, jsonb, text, text) TO authenticated;
