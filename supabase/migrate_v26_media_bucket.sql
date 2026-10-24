-- Imágenes fuera del blob del grupo (ahorro de egress).
-- Bucket PÚBLICO `media`: cada imagen se guarda UNA vez en img/<sha256>.<ext>
-- (direccionada por contenido: la misma foto en 10 grupos = 1 archivo, y la ruta
-- no se puede adivinar sin tener la imagen). El grupo guarda solo la URL.
-- La función `migrate-images` (cron) convierte las data URL que queden.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 3145728, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Usuarios con sesión pueden SUBIR a img/ (no modificar ni borrar).
drop policy if exists "media upload" on storage.objects;
create policy "media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'img');

-- Si llega una data URL que es la MISMA imagen que el servidor ya tiene como URL
-- de media (un cliente viejo que reescribe el blob), se conserva la URL.
create or replace function public.keep_media_url(incoming text, server text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare h text;
begin
  if incoming is null or server is null or incoming not like 'data:%' or server not like '%/media/img/%' then
    return incoming;
  end if;
  begin
    h := encode(sha256(decode(split_part(incoming, ',', 2), 'base64')), 'hex');
  exception when others then
    return incoming;
  end;
  if server like '%/media/img/' || h || '.%' then return server; end if;
  return incoming;
end $$;

create or replace function public.keep_media_urls(p_data jsonb, cur jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
declare out jsonb := p_data;
begin
  if p_data ? 'heroImage' and jsonb_typeof(p_data->'heroImage') = 'string' then
    out := jsonb_set(out, '{heroImage}', to_jsonb(keep_media_url(p_data->>'heroImage', cur->>'heroImage')));
  end if;
  if jsonb_typeof(p_data->'members') = 'array' then
    out := jsonb_set(out, '{members}', coalesce((
      select jsonb_agg(
        case when m->>'avatar' like 'data:%' then
          jsonb_set(m, '{avatar}', to_jsonb(keep_media_url(m->>'avatar',
            (select sm->>'avatar' from jsonb_array_elements(coalesce(cur->'members','[]')) sm where sm->>'id' = m->>'id' limit 1))))
        else m end order by ord)
      from jsonb_array_elements(p_data->'members') with ordinality as t(m, ord)), '[]'::jsonb));
  end if;
  return out;
end $$;

CREATE OR REPLACE FUNCTION public.update_group_data(p_group_id text, p_data jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare cur jsonb; tombs jsonb; keep jsonb := '{}'::jsonb; k text;
begin
  if not exists (select 1 from group_members gm where gm.group_id = p_group_id and gm.user_id = auth.uid()) then
    raise exception 'not_a_member';
  end if;
  select data into cur from groups where id = p_group_id for update;
  if cur is null then
    update groups set data = p_data, updated_at = now() where id = p_group_id;
    return;
  end if;
  p_data := keep_media_urls(p_data, cur);
  select coalesce(jsonb_agg(distinct t), '[]'::jsonb) into tombs from (
    select jsonb_array_elements_text(coalesce(cur->'deletedExpenseIds', '[]'::jsonb)) t
    union select jsonb_array_elements_text(coalesce(p_data->'deletedExpenseIds', '[]'::jsonb))) x;
  foreach k in array array['heroColor','heroImage','heroImagePos','defaultSplit','budget'] loop
    if not (p_data ? k) and cur ? k then keep := keep || jsonb_build_object(k, cur->k); end if;
  end loop;
  update groups set
    data = jsonb_strip_nulls_hero(p_data || keep || jsonb_build_object(
      'expenses',          public.merge_expenses(cur->'expenses', p_data->'expenses', tombs),
      'deletedExpenseIds', tombs,
      'settlements',       jsonb_union_by_id(cur->'settlements',   p_data->'settlements'),
      'notifications',     jsonb_union_by_id(cur->'notifications', p_data->'notifications'),
      'activity',          jsonb_union_by_id(cur->'activity',      p_data->'activity'))),
    updated_at = now()
  where id = p_group_id;
end $function$;
