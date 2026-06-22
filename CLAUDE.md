# Settly — Claude Context

## What this app is
Settly is a PWA for splitting group expenses. Stack: React 18 + Vite 6 + TypeScript + Tailwind CSS v4. Deployed via GitHub Actions to GitHub Pages at `https://patricbarca.github.io/settly/`.

## Repos
- **`patricbarca/settly`** — the main app (this repo). Branch `master` deploys to GitHub Pages automatically.
- **`patricbarca/settly-landing`** — separate landing page. Plain HTML/CSS at the repo root (`index.html`, `styles.css`, `assets/`), no build step. GitHub Pages serves it via "Deploy from a branch" → `master` / root (the auto-generated `pages build and deployment` workflow). Both repos are in scope and pushed directly from Claude Code sessions.

## Key files
- `src/index.css` — CSS variables, glass/glass-strong components, dark mode, animations
- `src/lib/i18n.ts` — all UI strings (bilingual ES/EN)
- `src/lib/types.ts` — TypeScript types (Group, Expense, RecurringExpense, etc.)
- `src/lib/store.ts` — group state, synced to **Supabase** (Postgres + realtime) with an IndexedDB offline cache + outbox; auth in `src/lib/auth.ts`, client in `src/lib/supabase.ts`
- `src/lib/plan.ts` — freemium plan + AI-quota scaffolding (free/pro + monthly scan count in localStorage; `activatePro` is a stub to be replaced by Stripe/Supabase)
- `src/components/Paywall.tsx` / `InstallButton.tsx` — upgrade modal and PWA install button (`src/lib/pwa.ts` captures `beforeinstallprompt` + iOS detection)
- `src/components/GroupView.tsx` — main group screen (tabs: Expenses, Balances, Stats, Achievements)
- `src/components/Hero.tsx` — hero card inside GroupView (group name + total/owe/owed pills + Settle Score ring)
- `src/components/ExpenseForm.tsx` — add/edit expense form (voice input, receipt scan, recurring toggle)
- `src/components/RecurringList.tsx` — recurring expenses list (hidden when empty)
- `src/components/AddForm.tsx` — wrapper for the add expense flow
- `src/lib/auth.ts` — Supabase Auth (Google + email/OTP); phase machine incl. a **guest** mode for testing; reads/persists `profiles.avatar` (Google photo by default); `setProfileAvatar`/`setProfileName`. Phone step is optional in beta.
- `src/lib/ai.ts` — client for the AI Edge Functions: `parseExpenseAI` (text→expense), `scanReceipt` (vision), `transcribeAudio` (server STT via the `transcribe` function → Groq/Whisper)
- `src/lib/speech.ts` — `useSpeech(onText, lang)` dictation hook. Web Speech on Android/desktop; **on iOS records→server STT** (`transcribeAudio`, since iOS exposes a broken `webkitSpeechRecognition`). Needs connection (offline → add expense manually). Follows the ES/EN toggle. Exposes `listening`/`busy`/`error`.
- `src/lib/parse.ts` — local (regex) natural-language → expense parser + category + recurrence interval (fallback when the LLM isn't deployed)
- `src/lib/contacts.ts` — `getNetwork()`: registered users you share groups with (for the create-group selector)
- `src/lib/image.ts` — `fileToAvatarDataUrl()` crop/resize an uploaded photo to a small JPEG data URL
- `src/components/Avatar.tsx` — renders a member's photo (`<img>` for URL/data URL) or emoji/initials fallback
- `supabase/functions/parse-expense|scan-receipt|transcribe/` — Deno Edge Functions (Claude text/vision, Groq/Whisper STT). Keys in Supabase secrets (`ANTHROPIC_API_KEY`; STT: `STT_API_KEY` + `STT_API_URL` + `STT_MODEL`). **`transcribe` deployed (Groq `whisper-large-v3-turbo`); `parse-expense`/`scan-receipt` not deployed yet.**
- `supabase/setup_all.sql` — idempotent full schema (tables + RLS + `redeem_access_code` SECURITY DEFINER fn + `profiles.avatar`)

## Design system
- **Glass morphism**: `.glass` and `.glass-strong` utility classes with `backdrop-filter`
- **iOS fix**: `@supports (-webkit-touch-callout: none)` disables backdrop-filter on iOS Safari (corner artifact bug), falls back to opaque `--glass-solid` / `--glass-strong-solid` variables
- **Colors**: `--teal` (#0FA3A3), `--indigo` (#5B5BF0), `--coral` (#FF5A4D), `--amber` (#E8920C), `--ink`, `--muted`
- **Fonts**: Bricolage Grotesque (display), Instrument Sans (body), Space Mono (mono/numbers)
- **Rounded corners**: all cards use `rounded-3xl`
- **Dark mode**: `[data-theme="dark"]` on `<html>`

## Recent work completed
### Backend, auth & AI (PRs #19–#32)
- **Supabase Auth**: Google login + email/OTP + account creation. Phone/SMS step made **optional** in beta (was blocking login with no SMS provider). A **guest mode** exists for quick testing (no session → groups don't persist/sync; only real accounts persist).
- **Groups persist & sync** across devices for logged-in users; `addGroup` awaits ordered inserts (owner membership before others, per RLS). Fixed the "create share link" error (idempotent upsert of group+member before link creation, `src/lib/invite.ts`).
- **Create group = registered users only**: selector of your network (`getNetwork`); no free-text people. Empty when you have no network (invite others by link).
- **Profile avatar**: Google photo by default, can upload your own (saved as data URL in `profiles.avatar`). Avatars now render as images everywhere (fixed a bug where the avatar URL showed as raw text in the expense form).
- **Freemium / Pro**: plan read from Supabase `entitlements`; Pro unlocked via **access codes** (`redeem_access_code` SECURITY DEFINER fn; beta code `SETTLYBETA`). No Stripe yet. Recurring expenses + unlimited AI are **Pro-gated** (decision: keep recurring as Pro).
- **Three AI paths wired** (Edge Functions, keys server-side only): `parse-expense` (text→expense+category, Claude Haiku), `scan-receipt` (vision, Claude), `transcribe` (Whisper). Interpret uses the LLM when Pro/quota, else the local regex parser. **Functions still need deploying** to actually work.
- **Voice→text**: Web Speech on Android/desktop; on iPhone records→**server STT** (Edge Function `transcribe` → Groq `whisper-large-v3-turbo`). Needs connection; offline → add manually. Language follows the ES/EN toggle. (Replaced the old in-browser Whisper, which failed on iPhone — `src/lib/whisper.ts` + `@huggingface/transformers` removed.)
- **Categories** expanded 6→12 (added Groceries, Drinks, Travel, Health, Bills/Services, Gifts) with icons, i18n, and parser keywords.
- **UI**: login top-aligned; onboarding shows every launch (testing) and is vertically centered.

### Earlier
- iOS Safari glass corner artifacts fixed via `@supports (-webkit-touch-callout: none)` — disables backdrop-filter on iOS
- GroupView tabs (Expenses / Balances / Stats / Achievements) sized to content with `flex-auto whitespace-nowrap` (was `flex-1`, which left Stats roomy and cramped Achievements)
- Hero card shows three small pills under the group name: white = total group expense (T), red = total you owe (↓), green = total you're owed (↑) (`Hero.tsx`)
- Redundant balance card below the hero was removed (the owe/owed pills replace it)
- Settle Score ring text is always white
- Recurring expense hint pill removed from empty state (list only shows when items exist)
- Add form title changed to "Add an Expense"
- Landing page (`settly-landing`): real landing restored at repo root (the Vite app had been committed there, blanking the page); added decorative App Store / Google Play badges (hero + CTA), `assets/receipt.svg` for the demo, a real SVG favicon, and Open Graph / Twitter meta with `assets/og.png` (1200×630)

## PWA / deployment notes
- `vite-plugin-pwa` with `registerType: "autoUpdate"`, `skipWaiting`, `clientsClaim`
- iOS home-screen PWAs cache aggressively — to force an update: force-quit twice, or delete+re-add, or clear Safari website data for the domain
- CI deploys from `master` branch only (`.github/workflows/`)

## Pending / known issues
- **`parse-expense` / `scan-receipt` not deployed**: exist but need `supabase functions deploy` + `ANTHROPIC_API_KEY`. Until then: Interpret falls back to the local parser, scan falls back to its demo. (`transcribe` is already deployed on Groq.)
- **Voice STT now server-side (Groq)**, resolving the old iPhone failure. Trade-off: dictation needs a connection; offline the mic shows an error and the user adds the expense manually.
- Interpret/parser: local regex parser is the fallback; the LLM (`parse-expense`) is the smart path once deployed.
- Hero pills render even when `0` on a side (could hide the zero side or show a "settled" state).
- When reusing the same working branch across multiple PRs, reset it to `origin/master` before starting new work — squash-merges otherwise cause merge conflicts on the next PR.

## Multi-session / concurrency notes
- CLAUDE.md is a normal repo file — it is **not** auto-updated; it only changes when a session edits + commits it. Keep it current manually.
- **Multiple Claude sessions can run on the same repo at once.** Git does not auto-merge silently: edits land via commits/PRs, and concurrent edits to the same lines cause merge conflicts (not silent loss). Risk of clobbering exists mainly when two sessions push to the **same branch** with force-push.
- Safe pattern (what we use): one branch per session, `--force-with-lease` (fails if remote moved), squash-merge to `master`, then `git reset --hard origin/master` before new work to pick up other sessions' merges.
