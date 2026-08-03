-- Run once in the SQL Editor (already applied to the live DB).
--
-- Global nickname / display name: stored on the profile so it applies to ALL
-- of a user's groups (current and future), the same single-source-of-truth as
-- name/avatar/initials. Members created for new groups seed `nick` from here.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nick text;
