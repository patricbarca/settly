-- Pro: sin tope mensual de IA (uso justo). El freno contra abusos es ai_guard
-- (tope diario por usuario en las Edge Functions: Pro 300/día, gratis 30/día).
create or replace function public.ai_quota(p_kind text, p_pro boolean)
returns integer language sql immutable set search_path to 'public' as $$
  select case when p_pro then 100000 else 3 end;
$$;
