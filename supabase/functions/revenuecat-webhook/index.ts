// ============================================================
// Settlia – Edge Function: revenuecat-webhook
// Recibe los eventos de RevenueCat (compras/renovaciones/expiraciones de IAP en
// iOS/Android) y refleja el entitlement "pro" en la tabla `entitlements` de
// Supabase. Así, si un usuario compra Pro en la app nativa, también queda Pro
// en la WEB (que lee el entitlement de Supabase). Cierra el hueco iOS→web.
//
// Web (Stripe) sigue escribiendo esta misma tabla por su lado; este webhook
// solo toca las filas cuyo Pro proviene de RevenueCat (source='revenuecat'),
// para no pisar una suscripción de Stripe.
//
// Config:
//   - Deploy con verify_jwt = false (RevenueCat no manda un JWT de Supabase).
//   - Secret REVENUECAT_WEBHOOK_SECRET: valor del header Authorization que se
//     configura en RevenueCat → Integrations → Webhooks. Se verifica aquí.
//   - SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase solo.
//
// RevenueCat → Project settings → Integrations → Webhooks:
//   URL: https://<PROJECT_REF>.supabase.co/functions/v1/revenuecat-webhook
//   Authorization header: el mismo valor de REVENUECAT_WEBHOOK_SECRET
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Entitlement que desbloquea Pro (debe coincidir con el de RevenueCat / iap.ts). */
const PRO_ENTITLEMENT = "pro";

// Eventos que CONCEDEN acceso vs los que lo RETIRAN.
const GRANT = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);
const REVOKE = new Set(["EXPIRATION", "REFUND", "SUBSCRIPTION_PAUSED"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Auth: RevenueCat envía el valor configurado en el header Authorization.
  const auth = req.headers.get("authorization") ?? "";
  if (!WEBHOOK_SECRET || auth !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "not_configured" }, 503);

  let event: Record<string, unknown>;
  try {
    const body = await req.json();
    event = (body?.event ?? {}) as Record<string, unknown>;
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const type = String(event.type ?? "");
  // app_user_id = el id de usuario de Supabase (lo fijamos con Purchases.logIn).
  const appUserId = String(event.app_user_id ?? "");
  const entitlementIds = Array.isArray(event.entitlement_ids)
    ? (event.entitlement_ids as string[])
    : [];
  const expirationMs = typeof event.expiration_at_ms === "number"
    ? event.expiration_at_ms
    : null;

  // Ignora ids anónimos de RevenueCat (usuario no logueado) o no-UUID.
  if (!UUID_RE.test(appUserId)) return json({ ok: true, skipped: "no_supabase_user" });
  // Solo nos interesa el entitlement "pro".
  if (!entitlementIds.includes(PRO_ENTITLEMENT)) {
    return json({ ok: true, skipped: "not_pro_entitlement" });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    if (GRANT.has(type)) {
      // Concede/renueva Pro. No tocamos trial_ends_at ni stripe_customer_id.
      const { error } = await sb.from("entitlements").upsert(
        {
          user_id: appUserId,
          plan: "pro",
          expires_at: expirationMs ? new Date(expirationMs).toISOString() : null,
          source: "revenuecat",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      return json({ ok: true, action: "granted", user: appUserId });
    }

    if (REVOKE.has(type)) {
      // Retira Pro SOLO si venía de RevenueCat (no pisa una suscripción Stripe).
      const { error } = await sb
        .from("entitlements")
        .update({ plan: "free", updated_at: new Date().toISOString() })
        .eq("user_id", appUserId)
        .eq("source", "revenuecat");
      if (error) throw error;
      return json({ ok: true, action: "revoked", user: appUserId });
    }

    // Otros tipos (CANCELLATION = auto-renovación off pero sigue activo hasta
    // expirar, BILLING_ISSUE, TRANSFER, TEST…): no cambian el acceso aquí.
    return json({ ok: true, action: "ignored", type });
  } catch (e) {
    console.error("revenuecat-webhook", e);
    return json({ error: "db_error", detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
