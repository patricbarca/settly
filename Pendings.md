# Settlia — Pendientes

> Lista viva de lo que queda. Para el plan completo por fases ver `ROADMAP.md`.
> Estado al cierre de la sesión del 2026-06-29.

## 🔧 Acciones manuales tuyas (paneles / redeploys)
Estas no las puede hacer el agente; requieren tu dashboard.

- [ ] **Re-desplegar `send-push` y `daily-reminders`** (Edge Functions) → para que el **título de las notificaciones push** muestre **"Settlia"** (ya cambiado en el código; las funciones se despliegan a mano). El resto del rebrand (app + landing + manifest) ya está en producción.
- [x] ~~Re-desplegar `scan-receipt`~~ (lectura mejorada: qty/recargos/tax) — hecho.
- [x] ~~`migrate_v4_network_rls.sql`~~ (co-miembros / sugeridos) — hecho.
- [x] ~~`migrate_v5_receipts_storage.sql`~~ (bucket privado de recibos) — hecho, la foto del recibo funciona.

## 🟠 Pre-lanzamiento (antes de gastar en ads) — ver ROADMAP "Fase 1.5"
- [ ] **Tracking**: Meta Pixel + Google Ads/GA4 con eventos de conversión (código: agente; IDs: tú).
- [ ] **Banner de consentimiento de cookies** + carga condicional de pixels (obligatorio UE). Bloquea anunciar legalmente en UE.
- [ ] **Actualizar `privacy.html`** con sección cookies + proveedores Meta/Google (al añadir tracking).
- [ ] **Revisar `terms.html`**: descargo (no procesador de pagos / no responsable de deudas), ley/jurisdicción, terminación.
- [ ] **Firmar DPA** con Supabase y Groq (RGPD Art. 28).
- [ ] **Identidad legal/operador** (persona o empresa + país).
- [ ] **Auditar RLS** de Supabase (security advisors): que ninguna tabla quede sin RLS. *Crítico.*
- [ ] **Verificación de dominio** en Meta Business y Google.
- [ ] `npm audit` + **quota de IA por usuario** (anti-abuso de coste).

## 🟡 Producto (código, agente) — Fase 1
- [ ] **Multi-moneda** en las pills de balance global (hoy asume una sola moneda).
- [ ] **Parser avanzado**: splits desiguales / porcentajes; glosario por grupo.
- [ ] **Recibo en el reporte**: miniatura embebida en el PDF; CSV = sí/no (no link, caduca).
- [ ] **Comprobantes de pago a Storage** (hoy base64 en `settlement.proof`) + migrar los viejos.
- [ ] (Opcional) Recurrentes por servidor (cron) que materialice ocurrencias aunque nadie abra el grupo.

## 🔵 Infra / hosting — Fase 2
- [ ] **Migrar hosting a Cloudflare Pages** (repos privados gratis + sin límite de ancho de banda + cabeceras de seguridad/CSP). DNS ya está en Cloudflare.

## 🧹 Deuda técnica / limpieza
- [ ] Borrar `PayMethodModal.tsx` (huérfano).
- [ ] Revisar concurrencia de `processRecurring` (posible doble generación si dos abren a la vez).
- [ ] **Pre-existentes (TS)**: `auth.ts(94)` `.catch` sobre `PromiseLike<void>` y `store.ts(245)` falta `loading` en `State` — no rompen el build (`vite build` usa esbuild) pero conviene limpiarlos.
- [ ] Actualizar `CLAUDE.md`: la marca ya **no** es "Settl·iA con la iA resaltada" → ahora es **"Settlia"** plano (sin acento de color).

## ✅ Hecho en la última sesión (resumen)
Fase 0 cerrada (delete-account, correo de dominio Cloudflare) · pestañas **Groups | Contacts** con ocultar/restaurar · solo usuarios registrados + sugeridos ordenados por grupo reciente + búsqueda por email · escaneo de tickets mejorado (qty/recargos proporcionales/propina igual/tax visible) · gastos por plato **editables** con desglose por ítem en el detalle · **recibo en Storage** (privado) visible con "Ver recibo" · rebrand **SettliA → Settlia** (wordmark plano) en app + landing.
