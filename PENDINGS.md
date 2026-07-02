# Settlia — Pendientes inmediatos

> Ver `ROADMAP.md` para el plan completo por fases. Este archivo es la lista
> corta de lo próximo. Última consolidación: 2026-07-02 (se fusionó con el
> duplicado `Pendings.md`, que colisionaba en filesystems case-insensitive
> como macOS/Windows e impedía clonar el repo ahí).

---

## 🔴 Stripe — próximos pasos (requieren código)

- **Edge Function `create-checkout`** — Checkout Session de Stripe con 7 días de trial, redirige al usuario. Secret: `STRIPE_SECRET_KEY`.
- **Edge Function `stripe-webhook`** — recibe `checkout.session.completed` / `customer.subscription.deleted`, actualiza `entitlements`. Secret: `STRIPE_WEBHOOK_SECRET`.
- **Migración DB**: añadir `stripe_customer_id` y `stripe_subscription_id` a `entitlements`.
- **Paywall.tsx**: conectar el botón "Go Pro" con `create-checkout` en vez del flujo de códigos.
- Sandbox ya creado: producto `prod_Un55TeYgnza89e`, precio mensual `price_1TnUvTJNzqooAsfhY6TFJXnd` ($7/mo), anual `price_1TnUvWJNzqooAsfhYmxHe7sR` ($60/yr). Ver `STRIPE.md`.

## 🟡 Producto (código) — Fase 1

- **Multi-moneda** en las pills de balance global (hoy asume una sola moneda).
- **Parser avanzado**: splits desiguales / porcentajes; glosario por grupo.
- **Recibo en el reporte**: miniatura embebida en el PDF; CSV = sí/no (no link, caduca).
- **Comprobantes de pago a Storage** (hoy base64 en `settlement.proof`) + migrar los viejos.
- (Opcional) Recurrentes por servidor (cron) que materialice ocurrencias aunque nadie abra el grupo.

## 🔵 Infra / hosting — Fase 2

- **Migrar hosting a Cloudflare Pages** (repos privados gratis + sin límite de ancho de banda + cabeceras de seguridad/CSP). DNS ya está en Cloudflare.

## 🧹 Deuda técnica / limpieza

- Borrar `PayMethodModal.tsx` (huérfano; edición de métodos solo en perfil).
- Revisar concurrencia de `processRecurring` (posible doble generación si dos abren a la vez).
- **Pre-existentes (TS)**: `auth.ts(94)` `.catch` sobre `PromiseLike<void>` y `store.ts(245)` falta `loading` en `State` — no rompen el build (`vite build` usa esbuild) pero conviene limpiarlos.

---

## ✅ Ya cerrado (referencia)

- Fase 0 completa (delete-account, correo de dominio Cloudflare, Web Push, recordatorios diarios).
- Rebrand SettliA → **Settlia** (wordmark plano) en app + landing.
- `migrate_v4` (co-miembros/sugeridos), `migrate_v5` (bucket `receipts` privado), `migrate_v6` (seguridad + performance: search_path, REVOKE, índices, RLS initplan).
- Pestañas Groups | Contacts, escaneo de tickets mejorado, gastos por plato editables, logo S ribbon + liquid glass en toda la app y landing.
- Fase 1.5 completa: Cloudflare Web Analytics, admin dashboard, RLS auditado, `npm audit` limpio, quota de IA, `terms.html` con ley/jurisdicción, DPA firmados con Supabase y Groq, **leaked password protection activado** (no requiere plan pago, se activó gratis en Auth settings — la nota vieja de "requiere Plan Pro" estaba desactualizada).
- Fix del parser LLM contra splits alucinados; UI oculta el input mientras se revisa un gasto.
- Capacitor scaffolding para empaquetar iOS (`capacitor.config.ts`, deps, `npm run ios:sync`/`ios:open`).
