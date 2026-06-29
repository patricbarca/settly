# SettliA — Pendientes inmediatos

> Estado a 2026-06-29. Ver ROADMAP.md para el plan completo por fases.

---

## ✅ Completado hoy (2026-06-29)

- **`migrate_v5`** — bucket `receipts` privado confirmado en Supabase.
- **`migrate_v6`** — seguridad + performance aplicada:
  - `handle_new_user` search_path fijado (evita SQL injection vía search_path).
  - REVOKE EXECUTE en funciones internas para rol `anon` (`handle_new_user`, `is_member_of`, `redeem_access_code`).
  - 6 índices en FKs sin cubrir (`code_redemptions`, `feedback`, `group_members`, `groups`, `invite_links`).
  - Todas las políticas RLS migradas a `(select auth.uid())` (fix initplan, mejora rendimiento).
  - Políticas duplicadas de `group_members` SELECT fusionadas en una (`View group members`).
- **`send-push` v10 + `daily-reminders` v11** redespliegados.

---

## 🟡 Pendiente manual (1 clic en Supabase dashboard)

### Leaked Password Protection
Auth → Settings → Enable "Leaked password protection" (HaveIBeenPwned check).
No requiere código ni SQL.

---

## 🟡 Pendientes técnicos próximos

### Comprobantes de pago → Storage
Hoy `settlement.proof` guarda la imagen como base64 en el JSON del grupo. Hay que:
- Subir el comprobante al bucket `receipts` (mismo bucket, ruta diferente).
- Migrar los `proof` base64 existentes.
- Mostrar el recibo en el reporte (miniatura en PDF; CSV = sí/no).

### Mostrar recibo en el reporte
`ReportModal` no incluye aún los recibos de `Expense.receiptPath`. Pendiente: miniatura embebida en el PDF de impresión; en CSV = columna sí/no.

### Borrar `PayMethodModal.tsx`
Archivo huérfano (la edición de métodos de pago se movió al perfil). Seguro borrar.

---

## 📋 Lo que sigue (orden recomendado)

1. **Leaked Password Protection** → 1 clic en Auth Settings (tú).
2. **Meta Pixel + GA4** → necesario para que los ads optimicen (Fase 1.5).
3. **Banner de consentimiento de cookies** → obligatorio en UE con los pixels activos.
4. **Migrar `settlement.proof`** → completar la historia de evidencias (Fase 1).
