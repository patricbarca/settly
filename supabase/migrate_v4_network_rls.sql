-- ============================================================
-- Settly – migrate_v4: leer co-miembros para "Tu red" (sugeridos)
--
-- Problema: la política de SELECT de group_members solo dejaba leer TUS propias
-- filas (user_id = auth.uid()). getNetwork() necesita leer las filas de los
-- OTROS usuarios de tus grupos para sugerirlos al crear/añadir miembros, así que
-- la red salía siempre vacía.
--
-- Solución: una política que permita a un miembro leer las filas de
-- group_members de los grupos a los que pertenece. Para evitar la recursión
-- infinita de RLS (una política sobre group_members que consulta group_members),
-- la comprobación va en una función SECURITY DEFINER que NO está sujeta a RLS.
--
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================

create or replace function public.is_member_of(gid text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

grant execute on function public.is_member_of(text) to authenticated;

-- SELECT: puedes leer las filas de group_members de cualquier grupo del que
-- seas miembro (cubre también las tuyas). Junto con "View own memberships"
-- (se combinan con OR) no rompe nada existente.
drop policy if exists "View co-members" on group_members;
create policy "View co-members" on group_members for select
  using (public.is_member_of(group_id));
