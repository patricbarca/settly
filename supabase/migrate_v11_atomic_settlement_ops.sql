-- Run once in the SQL Editor.
--
-- Problem: payments (settlements) were still added/confirmed/rejected by
-- read-modify-write of the ENTIRE group.data JSONB from the client's
-- (possibly stale) in-memory copy — the same clobber bug that migrate_v10
-- fixed for expenses. Two people acting around the same time (e.g. the debtor
-- marks "I paid" while the creditor marks "they paid me") could overwrite each
-- other: a whole-group UPDATE reaching Postgres last wins, silently dropping
-- the other's settlement. That's how a "he paid me" pending payment vanished
-- before the creditor could accept it.
--
-- Fix: atomic, targeted functions that append / patch / remove just the
-- settlement(s), locking the row with SELECT ... FOR UPDATE so concurrent
-- calls serialize at the DB instead of racing in app code.
-- Reuses public.jsonb_array_cap + public.is_member_of from migrate_v10.

-- Append one or more settlements (at the end, matching the client's
-- [...settlements, ...new]), plus optionally one activity entry and/or an
-- array of notification entries — atomically.
CREATE OR REPLACE FUNCTION public.add_settlement(
  p_group_id text,
  p_settlements jsonb,            -- JSON array of settlement objects
  p_activity jsonb DEFAULT NULL,  -- single activity entry (optional)
  p_notifs jsonb DEFAULT NULL     -- JSON array of notification entries (optional)
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

  v_data := jsonb_set(
    v_data, '{settlements}',
    COALESCE(v_data->'settlements', '[]'::jsonb) || COALESCE(p_settlements, '[]'::jsonb)
  );
  IF p_activity IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{activity}', public.jsonb_array_cap(COALESCE(v_data->'activity', '[]'::jsonb) || jsonb_build_array(p_activity), 200));
  END IF;
  IF p_notifs IS NOT NULL THEN
    v_data := jsonb_set(v_data, '{notifications}', public.jsonb_array_cap(COALESCE(v_data->'notifications', '[]'::jsonb) || p_notifs, 100));
  END IF;

  UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_settlement(text, jsonb, jsonb, jsonb) TO authenticated;

-- Set the status of one settlement (e.g. confirm a pending payment) atomically.
CREATE OR REPLACE FUNCTION public.set_settlement_status(
  p_group_id text,
  p_settlement_id text,
  p_status text
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
  FROM jsonb_array_elements(COALESCE(v_data->'settlements', '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  WHERE elem->>'id' = p_settlement_id;

  IF v_idx IS NOT NULL THEN
    v_data := jsonb_set(v_data, ARRAY['settlements', v_idx::text, 'status'], to_jsonb(p_status));
    UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_settlement_status(text, text, text) TO authenticated;

-- Remove one settlement (reject a pending payment) atomically.
CREATE OR REPLACE FUNCTION public.remove_settlement(
  p_group_id text,
  p_settlement_id text
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

  v_data := jsonb_set(v_data, '{settlements}', COALESCE((
    SELECT jsonb_agg(elem) FROM jsonb_array_elements(COALESCE(v_data->'settlements', '[]'::jsonb)) elem
    WHERE elem->>'id' <> p_settlement_id
  ), '[]'::jsonb));

  UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_settlement(text, text) TO authenticated;
