# SettliA — Pendientes inmediatos

> Estado a 2026-06-29. Ver ROADMAP.md para el plan completo por fases.

---

## ✅ Completado hoy (2026-06-29)

- **`migrate_v5`** — bucket `receipts` privado confirmado en Supabase.
- **`migrate_v6`** — seguridad + performance aplicada (search_path, REVOKE, 6 índices, RLS initplan, merge políticas).
- **`send-push` v10 + `daily-reminders` v11** redespliegados.
- **Stripe sandbox** — producto `prod_Un55TeYgnza89e` + precios mensual (`price_1TnUvTJNzqooAsfhY6TFJXnd` $7/mo) y anual (`price_1TnUvWJNzqooAsfhYmxHe7sR` $60/yr). Ver `STRIPE.md`.

---

## 🔴 Stripe — próximos pasos (requieren código)

### Edge Function `create-checkout`
Crea una Checkout Session de Stripe con 7 días de trial y redirige al usuario.
- Secret necesario: `STRIPE_SECRET_KEY`

### Edge Function `stripe-webhook`
Recibe eventos de Stripe (`checkout.session.completed`, `customer.subscription.deleted`) y actualiza `entitlements` en Supabase.
- Secret necesario: `STRIPE_WEBHOOK_SECRET`

### Migración DB: campos Stripe en `entitlements`
Añadir `stripe_customer_id` y `stripe_subscription_id` a la tabla.

### Paywall en la app
Conectar el botón "Go Pro" del `Paywall.tsx` con `create-checkout` en vez del flujo de códigos.

---

## 🟡 Pendiente manual

### Leaked Password Protection
Requiere Plan Pro de Supabase (~$25/mes). Ignorar por ahora — login principal es Google OAuth.

---

## 🟡 Pendientes técnicos próximos

### Comprobantes de pago → Storage
Hoy `settlement.proof` guarda la imagen como base64. Migrar a bucket `receipts` + mostrar en reporte.

### Borrar `PayMethodModal.tsx`
Archivo huérfano. Seguro borrar.

---

## 📋 Lo que sigue (orden recomendado)

1. **Edge Functions Stripe** (`create-checkout` + `stripe-webhook`) → yo puedo implementarlas.
2. **Migración DB** (`stripe_customer_id` + `stripe_subscription_id` en `entitlements`).
3. **Conectar Paywall.tsx** con el checkout.
4. **Meta Pixel + GA4** → necesario para que los ads optimicen (Fase 1.5).
5. **Banner de consentimiento de cookies** → obligatorio en UE.
