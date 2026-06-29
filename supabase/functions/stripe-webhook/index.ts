import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("No signature", { status: 400 });

  const body = await req.text();
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(`Webhook Error: ${String(err)}`, { status: 400 });
  }

  const sbAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        const { data: ent } = await sbAdmin
          .from("entitlements")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (ent?.user_id) {
          await sbAdmin.from("entitlements").upsert({
            user_id: ent.user_id,
            plan: "pro",
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            expires_at: null,
          }, { onConflict: "user_id" });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const isActive = sub.status === "active" || sub.status === "trialing";

        const { data: ent } = await sbAdmin
          .from("entitlements")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (ent?.user_id) {
          await sbAdmin.from("entitlements").upsert({
            user_id: ent.user_id,
            plan: isActive ? "pro" : "free",
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            expires_at: isActive ? null : new Date().toISOString(),
          }, { onConflict: "user_id" });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: ent } = await sbAdmin
          .from("entitlements")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (ent?.user_id) {
          await sbAdmin.from("entitlements").upsert({
            user_id: ent.user_id,
            plan: "free",
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            expires_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }
        break;
      }

      case "customer.subscription.trial_will_end": {
        // Fires 3 days before trial ends
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

        const { data: ent } = await sbAdmin
          .from("entitlements")
          .select("user_id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (ent?.user_id && trialEnd) {
          await sbAdmin.from("entitlements").upsert({
            user_id: ent.user_id,
            trial_ends_at: trialEnd,
            stripe_customer_id: customerId,
          }, { onConflict: "user_id" });
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error("Error processing webhook:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
