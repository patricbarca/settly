-- migrate_v11_main_currency.sql
-- Moneda principal por usuario para las pills de balance global (Home).
-- Las pills convierten el aporte de cada grupo a esta moneda (tasa diaria vía
-- fxCache/convert-currency). Vacío/null = automática (la moneda más usada entre
-- los grupos activos). Editable en el perfil (AccountModal). Aplicada vía conector.
alter table profiles add column if not exists main_currency text;
