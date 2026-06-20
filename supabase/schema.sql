-- ============================================================
-- Settly – Schema
-- Ejecuta este SQL en Supabase → SQL Editor → New query
-- ============================================================

-- Profiles (uno por usuario de auth)
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: crea el perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Groups
CREATE TABLE groups (
  id         TEXT PRIMARY KEY,
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group memberships (control de acceso)
CREATE TABLE group_members (
  group_id  TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- Invite links
CREATE TABLE invite_links (
  token      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_links  ENABLE ROW LEVEL SECURITY;

-- Profiles: cada usuario solo ve/edita el suyo
CREATE POLICY "Own profile" ON profiles
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Groups: miembros pueden ver y editar; invite permite previsualizar
CREATE POLICY "Members view groups" ON groups FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM invite_links   WHERE group_id = groups.id AND expires_at > NOW())
  );

CREATE POLICY "Members update groups" ON groups FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())
  );

CREATE POLICY "Authenticated insert groups" ON groups FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner delete groups" ON groups FOR DELETE
  USING (auth.uid() = owner_id);

-- Group members
CREATE POLICY "View own memberships" ON group_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Join group" ON group_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM groups       WHERE id = group_id AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM invite_links WHERE group_id = group_members.group_id AND expires_at > NOW())
    )
  );

CREATE POLICY "Leave group" ON group_members FOR DELETE
  USING (user_id = auth.uid());

-- Invite links
CREATE POLICY "Auth users view invites" ON invite_links FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Members create invites" ON invite_links FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM group_members WHERE group_id = invite_links.group_id AND user_id = auth.uid())
  );

-- ============================================================
-- Configurar en Supabase Dashboard antes de usar:
--
-- 1. Authentication → URL Configuration
--    Site URL:      https://patricbarca.github.io/settly/
--    Redirect URLs: https://patricbarca.github.io/settly/
--
-- 2. Authentication → Providers → Email
--    Confirm email: ON (usa OTP por código, no magic link)
--    OTP expiry:    3600 (1 hora)
--
-- 3. Authentication → Providers → Google (opcional)
--    Client ID y Secret desde Google Cloud Console
-- ============================================================
