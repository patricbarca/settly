-- Run once in the SQL Editor (already applied to the live DB).
--
-- updateMyMember (editing your own name/avatar/initials/nick/pays across all
-- your groups) still rewrote the ENTIRE group.data JSON per group — the same
-- last-write-wins clobber that migrate_v10/v11 fixed for expenses/settlements.
-- A concurrent write to a busy group (e.g. a payment) could overwrite the
-- profile edit, so a saved nickname didn't reach some groups.
--
-- Fix: atomic patch of ONE member inside the group JSON, under SELECT ... FOR
-- UPDATE. updateMyMember now calls this per group instead of a whole-group write.
CREATE OR REPLACE FUNCTION public.patch_member(
  p_group_id text,
  p_member_id text,
  p_patch jsonb
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
  FROM jsonb_array_elements(COALESCE(v_data->'members', '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
  WHERE elem->>'id' = p_member_id;
  IF v_idx IS NOT NULL THEN
    v_data := jsonb_set(v_data, ARRAY['members', v_idx::text], (v_data->'members'->v_idx) || p_patch);
    UPDATE groups SET data = v_data, updated_at = now() WHERE id = p_group_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.patch_member(text, text, jsonb) TO authenticated;
