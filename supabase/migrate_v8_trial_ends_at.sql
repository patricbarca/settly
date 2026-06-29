-- migrate_v8: add trial_ends_at to entitlements
-- Populated by stripe-webhook on customer.subscription.trial_will_end (fires 3 days before).
-- Run once in SQL Editor on existing DBs.

ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
