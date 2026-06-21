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
- `src/lib/store.ts` — localStorage state management
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

## Pending / known issues
- The "Interpret" button parser (`src/lib/parse.ts`) is local/regex-only (no AI yet). The code notes the plan is to replace/augment it with an LLM (voice → expense) from a backend with an API key.
- Hero owe/owed pills always render both, showing `0` on the side that doesn't apply (could hide the zero side or show a "settled" state).
- When reusing the same working branch across multiple PRs, reset it to `origin/master` before starting new work — squash-merges otherwise cause merge conflicts on the next PR.
