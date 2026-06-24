-- Datos de perfil del usuario como FUENTE ÚNICA.
-- Antes vivían duplicados dentro del JSON de cada grupo (data.members[]), lo que
-- causaba pérdidas al mover grupos a la papelera. Ahora se guardan aquí, en la
-- fila del usuario, y solo se *reflejan* en los grupos para mostrarlos a los demás.
-- Idempotente. Ejecutar una vez en el SQL Editor de Supabase.
-- (La columna `phone` ya existe desde setup_all.sql.)

alter table profiles
  add column if not exists country  text  not null default '',
  add column if not exists initials text  not null default '',
  add column if not exists pays     jsonb not null default '[]'::jsonb;

-- Consulta para revisarlo:
--   select id, name, country, phone, initials, pays from profiles;
