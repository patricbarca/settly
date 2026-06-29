# SettliA — Stripe

> **Cuenta:** Settlia sandbox (`acct_1TmiRnJNzqooAsfh`)
> **Modo:** sandbox (test). Cuando vayas a producción, recrear el producto y precios en live mode.
> **Moneda:** USD siempre.

---

## Producto

| Campo | Valor |
|-------|-------|
| ID | `prod_Un55TeYgnza89e` |
| Nombre | Settlia Pro |
| Descripción | Unlimited groups, unlimited AI (scan, voice, text), recurring expenses, exportable reports and advanced stats. |

## Precios

| Plan | Precio | Interval | ID |
|------|--------|----------|----|
| Pro Monthly | $7.00/mo | month | `price_1TnUvTJNzqooAsfhY6TFJXnd` |
| Pro Annual | $60.00/yr (~$5/mo) | year | `price_1TnUvWJNzqooAsfhYmxHe7sR` |

**Free trial:** 7 días — se aplica en el checkout (parámetro `subscription_data.trial_period_days: 7`), no en el precio en sí.

---

## Flujo de integración (pendiente de implementar)

### 1. Checkout (frontend → Edge Function)
```
Usuario pulsa "Go Pro" en Paywall
→ POST /functions/v1/create-checkout
→ Edge Function crea Stripe Checkout Session con:
    - price_id (mensual o anual según selección)
    - trial_period_days: 7
    - success_url: https://app.settlia.app/?upgraded=1
    - cancel_url: https://app.settlia.app/
    - client_reference_id: supabase_user_id
→ Redirige al usuario a session.url
```

### 2. Webhook (Stripe → Edge Function `stripe-webhook`)
Eventos a manejar:
- `checkout.session.completed` → crear/actualizar `entitlements` (plan = 'pro')
- `customer.subscription.deleted` → degradar a free (`entitlements` plan = 'free')
- `invoice.payment_failed` → opcional: notificar al usuario

### 3. Edge Functions necesarias
- `create-checkout` — crea Checkout Session (requiere `STRIPE_SECRET_KEY`)
- `stripe-webhook` — recibe eventos de Stripe (requiere `STRIPE_WEBHOOK_SECRET`)

### 4. Secrets a configurar en Supabase
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 5. Tabla `entitlements` (ya existe)
Ya tiene `plan: 'free' | 'pro'` y `user_id`. Solo hay que añadir:
- `stripe_customer_id` — para gestionar la suscripción
- `stripe_subscription_id` — para cancelaciones/renovaciones

---

## Variables de entorno en la app (frontend)
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```
Solo se necesita si usas Stripe.js para elementos embebidos. Con Checkout redirect no hace falta.

---

## Notas
- **Regla de tiendas:** el pago de Pro debe hacerse por web, nunca dentro de la app iOS (evita comisión 30% IAP).
- **Códigos de acceso** (`SETTLYBETA`) siguen funcionando en paralelo — no hay conflicto.
- El `trial_period_days: 7` se pasa en la Checkout Session, no en el precio, para poder cambiarlo sin recrear precios.
