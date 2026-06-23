-- ─────────────────────────────────────────────────────────────────────────────
-- Feedback de usuarios: valoraciones (1–5 ⭐ + comentario) y reportes de bugs.
-- Idempotente. Ejecutar una vez en el SQL editor de Supabase.
-- Los usuarios SOLO pueden INSERTAR su propia fila; NO hay política de SELECT,
-- así que nadie lee el feedback desde la app — se consulta desde el panel de
-- Supabase (Table editor / SQL).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL CHECK (type IN ('rating', 'bug')),
  rating     INT  CHECK (rating BETWEEN 1 AND 5),
  message    TEXT NOT NULL DEFAULT '',
  context    JSONB,                       -- versión, navegador/OS, idioma, grupo
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Cada usuario autenticado puede crear su propio feedback.
DROP POLICY IF EXISTS "Insert own feedback" ON feedback;
CREATE POLICY "Insert own feedback" ON feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- (Deliberadamente SIN política de SELECT/UPDATE/DELETE: solo el service-role
--  y el panel de Supabase pueden leerlo.)

-- Consulta rápida para revisarlo desde el SQL editor:
--   SELECT created_at, type, rating, message, context->>'version' AS version
--   FROM feedback ORDER BY created_at DESC;
