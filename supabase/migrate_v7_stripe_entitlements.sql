-- migrate_v7: Add Stripe fields to entitlements
-- Run once in SQL Editor on existing DBs.
-- Already applied to production 2026-06-29.

ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE INDEX IF NOT EXISTS idx_entitlements_stripe_customer ON entitlements (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_stripe_sub      ON entitlements (stripe_subscription_id);
