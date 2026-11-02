-- migrate_v36: los pagos de Apple Pay (modo automático) van directo a Mis gastos,
-- ya no a la bandeja (sin inbox:true). Solo CREATE OR REPLACE.
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
    'source', 'wallet', 'importedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ), null, null);
  return 'ok';
end $$;
