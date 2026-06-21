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
- `src/components/Hero.tsx` — hero card inside GroupView (group name + owe/owed pills + Settle Score ring)
- `src/components/ExpenseForm.tsx` — add/edit expense form (voice input, receipt scan, recurring toggle)
- `src/components/RecurringList.tsx` — recurring expenses list (hidden when empty)
- `src/components/AddForm.tsx` — wrapper for the add expense flow

## Design system
- **Glass morphism**: `.glass` and `.glass-strong` utility classes with `backdrop-filter`
- **iOS fix**: `@supports (-webkit-touch-callout: none)` disables backdrop-filter on iOS Safari (corner artifact bug), falls back to opaque `--glass-solid` / `--glass-strong-solid` variables
- **Colors**: `--teal` (#0FA3A3), `--indigo` (#5B5BF0), `--coral` (#FF5A4D), `--amber` (#E8920C), `--ink`, `--muted`
- **Fonts**: Bricolage Grotesque (display), Instrument Sans (body), Space Mono (mono/numbers)
- **Rounded corners**: all cards use `rounded-3xl`
- **Dark mode**: `[data-theme="dark"]` on `<html>`

## Recent work completed
- iOS Safari glass corner artifacts fixed via `@supports (-webkit-touch-callout: none)` — disables backdrop-filter on iOS
- GroupView tabs (Expenses / Balances / Stats / Achievements) sized to content with `flex-auto whitespace-nowrap` (was `flex-1`, which left Stats roomy and cramped Achievements)
- Hero card shows two small pills under the group name: red = total you owe, green = total you're owed (`Hero.tsx`, derived from `computeSettle` net)
- Redundant balance card below the hero was removed (the owe/owed pills replace it)
- Settle Score ring text is always white
- Recurring expense hint pill removed from empty state (list only shows when items exist)
- Add form title changed to "Add an Expense"
- Landing page (`settly-landing`): real landing restored at repo root (the Vite app had been committed there, blanking the page); added decorative App Store / Google Play badges (hero + CTA), `assets/receipt.svg` for the demo, a real SVG favicon, and Open Graph / Twitter meta with `assets/og.png` (1200×630)

## PWA / deployment notes
- `vite-plugin-pwa` with `registerType: "autoUpdate"`, `skipWaiting`, `clientsClaim`
- iOS home-screen PWAs cache aggressively — to force an update: force-quit twice, or delete+re-add, or clear Safari website data for the domain
- CI deploys from `master` branch only (`.github/workflows/`)

## AI expense entry (voice / text / scan → form)
- The **Interpret** button and the **Scan** button both call the `parse-expense` Edge Function (`supabase/functions/parse-expense/index.ts`), which sends text (typed or dictated) *or* a receipt image to Claude (`AI_MODEL`, default `claude-haiku-4-5`, reuses `ANTHROPIC_API_KEY`) and returns a structured, categorized expense `{ label, amount, payerId, participantIds, category, interval? }`. The result pre-fills the manual `ExpenseForm` draft so the user just reviews and taps OK.
- Client wrapper: `parseExpenseAI()` in `src/lib/ai.ts`. Flow lives in `src/components/AddExpense.tsx` (`interpret()` for text, `onScanFile()` for images, both via `fillFrom()`).
- **Graceful degradation:** if `parse-expense` isn't deployed or the free AI quota is spent, Interpret falls back to the local regex parser (`src/lib/parse.ts`); Scan falls back to an empty manual form. The app never hard-blocks.
- Quota: AI calls consume one unit of `plan.consumeAI()` for free users (Pro = unlimited); when exhausted, text still works via the local parser.
- `src/components/ScanReceiptModal.tsx` + `scanReceipt()` (per-item split flow) are kept but no longer wired into the default Add flow — available to re-enable as a "detailed split" option.

## Pending / known issues
- Hero owe/owed pills always render both, showing `0` on the side that doesn't apply (could hide the zero side or show a "settled" state).
- When reusing the same working branch across multiple PRs, reset it to `origin/master` before starting new work — squash-merges otherwise cause merge conflicts on the next PR.
