-- ============================================================
-- Settly – migrate_v5: Storage de recibos/comprobantes (bucket privado)
--
-- Crea el bucket privado `receipts` y políticas RLS para que SOLO los miembros
-- de un grupo puedan subir/leer/borrar los archivos de ese grupo. Convención de
-- ruta: `{groupId}/{archivo}.jpg` → el primer segmento es el groupId, y se valida
-- con is_member_of() (creada en migrate_v4).
--
-- Requisito previo: haber ejecutado migrate_v4 (función public.is_member_of).
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================

-- Bucket privado (no público: el acceso es siempre vía URL firmada).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Políticas sobre storage.objects, acotadas al bucket `receipts`.
drop policy if exists "receipts read"   on storage.objects;
drop policy if exists "receipts insert" on storage.objects;
drop policy if exists "receipts delete" on storage.objects;

create policy "receipts read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_member_of((storage.foldername(name))[1])
  );

create policy "receipts insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.is_member_of((storage.foldername(name))[1])
  );

create policy "receipts delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_member_of((storage.foldername(name))[1])
  );
