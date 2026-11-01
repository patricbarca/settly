-- migrate_v34: añadir gastos por WhatsApp (Twilio).
-- Un número de WhatsApp se vincula a una cuenta con un código de 6 cifras que
-- la app genera (wa_link_code). La Edge Function `whatsapp-webhook` (service
-- role) usa las funciones wa_* para actuar COMO ese usuario: reutilizan
-- add_expense / delete_expense / ai_guard tal cual, fijando auth.uid() solo
-- dentro de la transacción.

create table if not exists public.whatsapp_links (
  phone text primary key,                 -- E.164, p. ej. +61400000000
  user_id uuid not null unique references auth.users(id) on delete cascade,
  lang text not null default 'es',
  linked_at timestamptz not null default now(),
  last_group text,                        -- último grupo usado (por defecto si hay dudas)
  last_expense jsonb,                     -- {group, id, label} para "deshacer"
  pending jsonb,                          -- gasto esperando que elija el grupo
  pending_at timestamptz
);
alter table public.whatsapp_links enable row level security;
create policy "Own whatsapp link" on public.whatsapp_links
  for select to authenticated using (user_id = auth.uid());

create table if not exists public.whatsapp_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null default 'es',
  expires_at timestamptz not null
);
alter table public.whatsapp_codes enable row level security; -- sin políticas: solo vía RPC

-- La app pide un código para vincular (válido 15 min).
create or replace function public.wa_link_code(p_lang text default 'es')
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  delete from whatsapp_codes where user_id = uid or expires_at < now();
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from whatsapp_codes where code = c);
  end loop;
  insert into whatsapp_codes (code, user_id, lang, expires_at)
  values (c, uid, case when p_lang = 'en' then 'en' else 'es' end, now() + interval '15 minutes');
  return c;
end $$;

create or replace function public.wa_unlink()
returns void language sql security definer set search_path = public as $$
  delete from whatsapp_links where user_id = auth.uid();
$$;

revoke all on function public.wa_link_code(text) from public, anon;
revoke all on function public.wa_unlink() from public, anon;
grant execute on function public.wa_link_code(text) to authenticated;
grant execute on function public.wa_unlink() to authenticated;

-- ---- Solo service_role (la Edge Function) ----

-- Canjea un código: vincula el número a la cuenta (quita vínculos anteriores).
create or replace function public.wa_claim_code(p_phone text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r whatsapp_codes;
begin
  select * into r from whatsapp_codes where code = p_code and expires_at > now();
  if r.code is null then return null; end if;
  delete from whatsapp_codes where code = p_code;
  delete from whatsapp_links where phone = p_phone or user_id = r.user_id;
  insert into whatsapp_links (phone, user_id, lang) values (p_phone, r.user_id, r.lang);
  return jsonb_build_object('user_id', r.user_id, 'lang', r.lang);
end $$;

create or replace function public.wa_ai_guard(p_user uuid, p_kind text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return public.ai_guard(p_kind);
end $$;

create or replace function public.wa_add_expense(p_user uuid, p_group_id text, p_expense jsonb, p_activity jsonb, p_notif_add jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform public.add_expense(p_group_id, p_expense, p_activity, p_notif_add);
end $$;

create or replace function public.wa_delete_expense(p_user uuid, p_group_id text, p_expense_id text, p_activity jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform public.delete_expense(p_group_id, p_expense_id, p_activity, 'expense_added', p_expense_id);
end $$;

revoke all on function public.wa_claim_code(text, text) from public, anon, authenticated;
revoke all on function public.wa_ai_guard(uuid, text) from public, anon, authenticated;
revoke all on function public.wa_add_expense(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.wa_delete_expense(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.wa_claim_code(text, text) to service_role;
grant execute on function public.wa_ai_guard(uuid, text) to service_role;
grant execute on function public.wa_add_expense(uuid, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.wa_delete_expense(uuid, text, text, jsonb) to service_role;
