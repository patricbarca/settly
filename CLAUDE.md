# Settly — Claude Context

## What this app is
Settly is a PWA for splitting group expenses. Stack: React 18 + Vite 6 + TypeScript + Tailwind CSS v4. Deployed via GitHub Actions to GitHub Pages at `https://patricbarca.github.io/settly/`.

## Repos
- **`patricbarca/settly`** — the main app (this repo). Branch `master` deploys to GitHub Pages automatically.
- **`patricbarca/settly-landing`** — separate landing page (plain HTML/CSS, no build step). Located locally at `C:\Users\paaba\Desktop\settly\settly-landing\`.

## Key files
- `src/index.css` — CSS variables, glass/glass-strong components, dark mode, animations
- `src/lib/i18n.ts` — all UI strings (bilingual ES/EN)
- `src/lib/types.ts` — TypeScript types (Group, Expense, RecurringExpense, etc.)
- `src/lib/store.ts` — localStorage state management
- `src/components/GroupView.tsx` — main group screen (tabs: Expenses, Balances, Stats, Achievements)
- `src/components/Hero.tsx` — hero card inside GroupView (balance + Settle Score ring)
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
- GroupView tabs (Expenses / Balances / Stats / Achievements) fit on one line with `flex-1 whitespace-nowrap`
- Hero card balance amount has a label above it (e.g. "You're owed in total")
- Settle Score ring text is always white
- Recurring expense hint pill removed from empty state (list only shows when items exist)
- Add form title changed to "Add an Expense"
- Landing page (`settly-landing`) updated: 5 phone mockup slides (added Stats), 4 mini-tabs, 6 feature cards, all CTA buttons point to `https://patricbarca.github.io/settly/`

## PWA / deployment notes
- `vite-plugin-pwa` with `registerType: "autoUpdate"`, `skipWaiting`, `clientsClaim`
- iOS home-screen PWAs cache aggressively — to force an update: force-quit twice, or delete+re-add, or clear Safari website data for the domain
- CI deploys from `master` branch only (`.github/workflows/`)

## Pending / known issues
- Landing page changes need to be pushed manually from local machine (`C:\Users\paaba\Desktop\settly\settly-landing\`) — the `settly-landing` repo is not in this session's GitHub scope
