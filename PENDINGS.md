# SettliA — Pendientes inmediatos

> Estado a 2026-06-29. Ver ROADMAP.md para el plan completo por fases.

---

## 🔴 Bloqueantes / críticos

### 1. Correr `migrate_v5_receipts_storage.sql` en Supabase
El código de Storage de recibos ya está desplegado (`src/lib/storage.ts`, `ReceiptButton.tsx`, `Expense.receiptPath`) pero el bucket y las políticas RLS **no existen en producción** hasta correr esta migración.

**Cómo:** SQL Editor en el dashboard de Supabase → pegar y ejecutar `supabase/migrate_v5_receipts_storage.sql`.

**Prerequisito:** `migrate_v4` ya aplicada (función `is_member_of` existe).

---

### 2. Auditar RLS (seguridad antes de ads)
Antes de empujar tráfico pagado hay que asegurarse de que ninguna tabla queda sin Row-Level Security.

**Cómo:** usar `get_advisors` de Supabase (security) o el panel Advisors del dashboard.

---

## 🟡 Pendientes técnicos próximos

### 3. Comprobantes de pago → Storage
Hoy `settlement.proof` guarda la imagen como base64 en el JSON del grupo. Hay que:
- Subir el comprobante al bucket `receipts` (mismo bucket, ruta diferente).
- Migrar los `proof` base64 existentes.
- Mostrar el recibo en el reporte (miniatura en PDF; CSV = sí/no).

### 4. Mostrar recibo en el reporte
`ReportModal` no incluye aún los recibos de `Expense.receiptPath`. Pendiente: miniatura embebida en el PDF de impresión; en CSV = columna sí/no (las URLs firmadas expiran).

### 5. Borrar `PayMethodModal.tsx`
Archivo huérfano (la edición de métodos de pago se movió al perfil). Seguro borrar.

---

## 🟢 Redeployments recientes
- **2026-06-29** — `send-push` (v10) y `daily-reminders` (v11) redespliegados desde `master`.

---

## 📋 Lo que sigue (orden recomendado)

1. **Correr `migrate_v5`** → habilita recibos en producción (10 min, cero código).
2. **Auditar RLS** → requisito antes de anunciar.
3. **Meta Pixel + GA4** → necesario para que los ads optimicen (Fase 1.5).
4. **Banner de consentimiento de cookies** → obligatorio en UE con los pixels activos.
5. **Migrar `settlement.proof`** → completar la historia de evidencias (Fase 1).
