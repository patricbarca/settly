-- ============================================================
-- Settly – Migración v2
-- Ejecuta en Supabase → SQL Editor → New query
-- ============================================================

-- 1. Añadir columnas a profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Sincronizar emails existentes desde auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email = '';

-- 3. Actualizar trigger para incluir email al registrarse
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4. Actualizar políticas de profiles para permitir búsqueda entre usuarios
DROP POLICY IF EXISTS "Own profile" ON profiles;

CREATE POLICY "Read profiles" ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Insert own profile" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 5. Actualizar política de group_members para que miembros puedan añadir otros usuarios
DROP POLICY IF EXISTS "Join group" ON group_members;

CREATE POLICY "Join group" ON group_members FOR INSERT
  WITH CHECK (
    (
      -- El propio usuario se añade vía invite link
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM invite_links
        WHERE group_id = group_members.group_id AND expires_at > NOW()
      )
    )
    OR (
      -- El creador al crear el grupo
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM groups
        WHERE id = group_id AND owner_id = auth.uid()
      )
    )
    OR (
      -- Miembro existente añade a otro usuario registrado
      user_id != auth.uid()
      AND EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
      )
    )
  );
