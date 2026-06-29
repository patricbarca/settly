-- ============================================================
-- migrate_v6: security + performance hardening
-- Fixes from Supabase advisors (2026-06-29)
-- ============================================================

-- 1. Fix handle_new_user search_path (prevents search_path injection)
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 2. Revoke direct REST API access to internal/trigger functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_member_of(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_access_code(text) FROM anon;

-- 3. Add missing indexes on foreign keys (performance)
CREATE INDEX IF NOT EXISTS idx_code_redemptions_user_id ON public.code_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_owner_id ON public.groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_created_by ON public.invite_links(created_by);
CREATE INDEX IF NOT EXISTS idx_invite_links_group_id ON public.invite_links(group_id);

-- 4. Fix RLS initplan: replace auth.uid() with (select auth.uid()) everywhere
--    This prevents re-evaluation per row and improves query performance at scale.

-- profiles
DROP POLICY IF EXISTS "Read profiles" ON public.profiles;
CREATE POLICY "Read profiles" ON public.profiles FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Insert own profile" ON public.profiles;
CREATE POLICY "Insert own profile" ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Update own profile" ON public.profiles;
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- groups
DROP POLICY IF EXISTS "Members view groups" ON public.groups;
CREATE POLICY "Members view groups" ON public.groups FOR SELECT USING (
  (owner_id = (select auth.uid()))
  OR (EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = groups.id AND group_members.user_id = (select auth.uid())))
  OR (EXISTS (SELECT 1 FROM invite_links WHERE invite_links.group_id = groups.id AND invite_links.expires_at > now()))
);

DROP POLICY IF EXISTS "Members update groups" ON public.groups;
CREATE POLICY "Members update groups" ON public.groups FOR UPDATE USING (
  EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = groups.id AND group_members.user_id = (select auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated insert groups" ON public.groups;
CREATE POLICY "Authenticated insert groups" ON public.groups FOR INSERT
  WITH CHECK ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS "Owner delete groups" ON public.groups;
CREATE POLICY "Owner delete groups" ON public.groups FOR DELETE
  USING ((select auth.uid()) = owner_id);

-- group_members: merge "View own memberships" + "View co-members" into one
-- is_member_of() already covers own rows (SECURITY DEFINER, no RLS recursion)
DROP POLICY IF EXISTS "View own memberships" ON public.group_members;
DROP POLICY IF EXISTS "View co-members" ON public.group_members;
CREATE POLICY "View group members" ON public.group_members FOR SELECT
  USING (is_member_of(group_id));

DROP POLICY IF EXISTS "Join group" ON public.group_members;
CREATE POLICY "Join group" ON public.group_members FOR INSERT WITH CHECK (
  ((user_id = (select auth.uid())) AND (EXISTS (SELECT 1 FROM invite_links WHERE invite_links.group_id = group_members.group_id AND invite_links.expires_at > now())))
  OR ((user_id = (select auth.uid())) AND (EXISTS (SELECT 1 FROM groups WHERE groups.id = group_members.group_id AND groups.owner_id = (select auth.uid()))))
  OR ((user_id <> (select auth.uid())) AND (EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id AND gm.user_id = (select auth.uid()))))
);

DROP POLICY IF EXISTS "Leave group" ON public.group_members;
CREATE POLICY "Leave group" ON public.group_members FOR DELETE
  USING (user_id = (select auth.uid()));

-- invite_links
DROP POLICY IF EXISTS "Auth users view invites" ON public.invite_links;
CREATE POLICY "Auth users view invites" ON public.invite_links FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Members create invites" ON public.invite_links;
CREATE POLICY "Members create invites" ON public.invite_links FOR INSERT WITH CHECK (
  ((select auth.uid()) = created_by)
  AND (EXISTS (SELECT 1 FROM group_members WHERE group_members.group_id = invite_links.group_id AND group_members.user_id = (select auth.uid())))
);

-- entitlements
DROP POLICY IF EXISTS "read own entitlement" ON public.entitlements;
CREATE POLICY "read own entitlement" ON public.entitlements FOR SELECT
  USING (user_id = (select auth.uid()));

-- code_redemptions
DROP POLICY IF EXISTS "read own redemptions" ON public.code_redemptions;
CREATE POLICY "read own redemptions" ON public.code_redemptions FOR SELECT
  USING (user_id = (select auth.uid()));

-- feedback
DROP POLICY IF EXISTS "Insert own feedback" ON public.feedback;
CREATE POLICY "Insert own feedback" ON public.feedback FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- push_subscriptions
DROP POLICY IF EXISTS "own push subs" ON public.push_subscriptions;
CREATE POLICY "own push subs" ON public.push_subscriptions FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
