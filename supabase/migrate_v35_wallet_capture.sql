-- migrate_v35: pagos de Apple Pay guardados al momento en la bandeja.
-- La acción de Atajos (PaymentPromptIntent) corre sin la web y no tiene la
-- sesión de Supabase. En vez de compartirle el refresh token (rota y rompería
-- la sesión de la app), la app genera un TOKEN DE DISPOSITIVO propio que solo
-- sirve para esto: añadir un pago a la bandeja del grupo Personal.
-- En la DB solo se guarda su sha256.

create table if not exists public.wallet_devices (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used timestamptz,
  uses_day date,
  uses int not null default 0
);
alter table public.wallet_devices enable row level security; -- sin políticas: solo vía RPC

-- La app pide un token (se guarda en el App Group del iPhone).
create or replace function public.wallet_device_token()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); tok text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into wallet_devices (token_hash, user_id) values (encode(digest(tok, 'sha256'), 'hex'), uid);
  -- como mucho 5 dispositivos por persona: se borran los más viejos
  delete from wallet_devices where user_id = uid and token_hash not in (
    select token_hash from wallet_devices where user_id = uid order by created_at desc limit 5);
  return tok;
end $$;

create or replace function public.wallet_revoke_tokens()
returns void language sql security definer set search_path = public as $$
  delete from wallet_devices where user_id = auth.uid();
$$;

-- La llama la acción de Atajos con la clave anon + el token del dispositivo.
-- Devuelve 'ok' | 'dup' | 'bad_token' | 'limit' | 'no_personal' | 'bad_input'.
create or replace function public.wallet_capture(p_token text, p_id text, p_merchant text, p_amount numeric, p_date text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  d wallet_devices; gid text; me text; v_data jsonb; eid text; label text; dt date;
begin
  if p_token is null or length(p_token) < 20 then return 'bad_token'; end if;
  select * into d from wallet_devices where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if d.user_id is null then return 'bad_token'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return 'bad_input'; end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9-]{8,64}$' then return 'bad_input'; end if;

  -- tope anti-abuso: 200 pagos al día por dispositivo
  if d.uses_day = current_date and d.uses >= 200 then return 'limit'; end if;
  update wallet_devices
     set last_used = now(),
         uses = case when uses_day = current_date then uses + 1 else 1 end,
         uses_day = current_date
   where token_hash = d.token_hash;

  select g.id, gm.member_id, g.data into gid, me, v_data
    from groups g join group_members gm on gm.group_id = g.id and gm.user_id = d.user_id
   where coalesce(g.data->>'personal', 'false') = 'true'
   order by g.created_at limit 1;
  if gid is null then return 'no_personal'; end if;

  eid := 'wal_' || p_id;
  if exists (select 1 from jsonb_array_elements(coalesce(v_data->'expenses', '[]'::jsonb)) e where e->>'id' = eid) then
    return 'dup';
  end if;

  -- "WOOLWORTHS 2393 YEERONGPILLY" → "Woolworths Yeerongpilly"
  label := initcap(trim(regexp_replace(regexp_replace(coalesce(p_merchant, ''), '\m\d+\M', ' ', 'g'), '\s+', ' ', 'g')));
  if label = '' then label := 'Apple Pay'; end if;
  label := left(label, 80);
  begin dt := p_date::date; exception when others then dt := current_date; end;

  perform set_config('request.jwt.claims', json_build_object('sub', d.user_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', d.user_id::text, true);
  perform public.add_expense(gid, jsonb_build_object(
    'id', eid, 'label', label, 'amount', round(p_amount, 2),
    'payerId', me, 'participantIds', jsonb_build_array(me), 'splits', null,
    'category', 'otros', 'date', to_char(dt, 'YYYY-MM-DD'), 'createdBy', me,
    'inbox', true, 'source', 'wallet', 'importedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ), null, null);
  return 'ok';
end $$;

revoke all on function public.wallet_device_token() from public, anon;
revoke all on function public.wallet_revoke_tokens() from public, anon;
grant execute on function public.wallet_device_token() to authenticated;
grant execute on function public.wallet_revoke_tokens() to authenticated;
revoke all on function public.wallet_capture(text, text, text, numeric, text) from public;
grant execute on function public.wallet_capture(text, text, text, numeric, text) to anon, authenticated;
