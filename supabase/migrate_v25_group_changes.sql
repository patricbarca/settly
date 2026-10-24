-- Aviso ligero de cambios para el tiempo real (ahorro de egress).
-- Antes la app escuchaba la tabla `groups`: cada cambio mandaba el blob ENTERO
-- (hasta 1,3 MB) a cada miembro conectado y, encima, la app recargaba TODOS sus
-- grupos. Ahora escucha `group_changes` (unos bytes: qué grupo cambió y quién lo
-- cambió) y descarga solo ese grupo, y nada si el cambio lo hizo él mismo.
-- `groups` sigue en la publicación para los builds viejos de iOS; quitarla cuando
-- ya no quede ninguno (ver CLAUDE.md).

create table if not exists public.group_changes (
  group_id text primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
alter table public.group_changes enable row level security;
drop policy if exists "Members see group changes" on public.group_changes;
create policy "Members see group changes" on public.group_changes
  for select to authenticated using (public.is_member_of(group_id));
revoke insert, update, delete on public.group_changes from anon, authenticated;

create or replace function public.touch_group_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into group_changes (group_id, changed_at, changed_by)
  values (coalesce(new.id, old.id), now(), auth.uid())
  on conflict (group_id) do update
    set changed_at = excluded.changed_at, changed_by = excluded.changed_by;
  return null;
end $$;
revoke execute on function public.touch_group_change() from anon, public, authenticated;

drop trigger if exists groups_touch_change on public.groups;
create trigger groups_touch_change
  after insert or update on public.groups
  for each row execute function public.touch_group_change();

alter publication supabase_realtime add table public.group_changes;
