-- Run once in the SQL Editor. Lets an invite link target a specific manually
-- added (no-account) Member, so joining via that link "claims" the existing
-- placeholder member instead of creating a brand-new one.
ALTER TABLE invite_links ADD COLUMN IF NOT EXISTS claim_member_id TEXT;
