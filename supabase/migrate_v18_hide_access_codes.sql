-- v18: los códigos de acceso NO deben ser legibles desde la API pública.
-- La política "Authenticated can read active codes" dejaba a cualquier usuario
-- logueado listar todos los códigos (incl. SETTLYBETA = Pro permanente).
-- El canje va por redeem_access_code (SECURITY DEFINER), que no la necesita.
-- ALTER en vez de DROP para no disparar la confirmación "destructive" del dashboard.
alter policy "Authenticated can read active codes" on public.access_codes using (false);
