-- migrate_v6_notif_prefs.sql — run once in the Supabase SQL Editor.
-- Per-user notification preferences: which categories the user wants to receive.
-- Read client-side (feed filter) and by the send-push / daily-reminders Edge
-- Functions (push filter). Shape: {"expenses":true,"payments":true,
-- "requests":true,"reminders":true}. A missing key = enabled (opt-out model).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notif_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
