# Settly — Claude Context

## What this app is
SettliA (brand styled **Settl·iA**, the "iA" highlighted = AI) is a PWA for splitting group expenses. Stack: React 18 + Vite 6 + TypeScript + Tailwind CSS v4. Deployed via GitHub Actions to GitHub Pages on the custom domain **`app.settlia.app`** (Vite `base: "/"`). The marketing landing is **`settlia.app`**.

> **Rebrand history:** was "Settly", briefly "Cow.ai", now **SettliA** with Settly's original colors/logo (teal `#0FA3A3` / indigo `#5B5BF0`, two-circle+check mark). The pre-rebrand state is preserved on the `settly-original` branch of both repos.

## Repos & domains
- **`patricbarca/settly`** — the app. Branch `master` → GitHub Pages → **`app.settlia.app`** (CNAME in `public/CNAME`, `base: "/"`).
- **`patricbarca/settly-landing`** — landing. Plain HTML/CSS at repo root, no build. "Deploy from a branch" → `master` / root → **`settlia.app`** (root `CNAME`).
- **DNS (GoDaddy):** apex `settlia.app` → 4 A records to GitHub Pages (185.199.108–111.153); `app` → CNAME `patricbarca.github.io`; `www` → CNAME `settlia.app`.
- **Auth note:** Supabase Site URL + Redirect URLs must include `https://app.settlia.app` (Google OAuth redirects via the Supabase callback, so Google Cloud needs no domain change).

## Key files
- `src/index.css` — CSS variables, glass/glass-strong components, dark mode, animations
- `src/lib/i18n.ts` — all UI strings (bilingual ES/EN)
- `src/lib/types.ts` — TypeScript types (Group, Expense, RecurringExpense, etc.)
- `src/lib/store.ts` — group state, synced to **Supabase** (Postgres + realtime) with an IndexedDB offline cache + outbox; auth in `src/lib/auth.ts`, client in `src/lib/supabase.ts`
- `src/lib/plan.ts` — freemium plan + AI-quota scaffolding (free/pro + monthly scan count in localStorage). **Free = max 3 active groups (`FREE_GROUP_LIMIT`)**; creating a 4th opens the Paywall (gated in `Home.startCreate`). Pro = unlimited. Plan from Supabase `entitlements` via access codes.
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
- `src/lib/contacts.ts` — `getNetwork()`: registered users you share groups with (for the create-group selector). Returns `{userId,name,avatar,email}`, **ordered by most-recently-active shared group** (excludes archived/trashed). Requires the `View co-members` RLS policy (see migrate_v4) — without it the network is always empty (RLS only let you read your own `group_members` rows). Members are **registered-only**: CreateGroupModal + UsersModal search by email/name; the "add without account" (manual) flow was removed (non-users join by invite link). UsersModal has a search bar over the suggestions.
- `src/lib/image.ts` — `fileToAvatarDataUrl()` crop/resize an uploaded photo to a small JPEG data URL
- `src/components/Avatar.tsx` — renders a member's photo (`<img>` for URL/data URL) or emoji/initials fallback
- `supabase/functions/parse-expense|scan-receipt|transcribe/` — Deno Edge Functions, all on **Groq** (OpenAI-compatible API, key `STT_API_KEY`). `parse-expense` (text→expense, `llama-3.1-8b-instant`), `scan-receipt` (vision, `meta-llama/llama-4-scout-17b-16e-instruct` — Maverick not available on the account; override with `AI_VISION_MODEL`. No `response_format` here: Groq vision returns `json_validate_failed` under strict JSON mode and small models degenerate under constrained decoding, so we rely on the prompt + `extractJson`), `transcribe` (STT, `whisper-large-v3-turbo`). All use `response_format: json_object` + **server-side sanitize**. **`transcribe` + `parse-expense` deployed; `scan-receipt` ready to deploy.**
- `supabase/setup_all.sql` — idempotent full schema (tables + RLS + `redeem_access_code` SECURITY DEFINER fn + `profiles.avatar`). Includes `is_member_of()` SECURITY DEFINER + `View co-members` policy so the network/suggestions work.
- `supabase/migrate_v4_network_rls.sql` — **run once in SQL Editor** on existing DBs: adds `is_member_of()` + `View co-members` SELECT policy on `group_members` so `getNetwork` can read other members of your groups (fixes empty suggested list). Definer fn avoids RLS recursion.

## Logo y assets de marca
- **Logo actual:** `public/icons/logo-s.png` — letra S estilo ribbon, gradiente teal→azul, fondo transparente (452×552 RGBA). Es el logo canónico para toda generación de imágenes y contenido de marketing.
- **Ícono PWA** (logo sobre fondo navy `#0D1B2A`, esquinas redondeadas estilo iOS squircle): `public/icons/icon-512.png` (512×512), `icon-192.png` (192×192), `apple-touch-icon.png` (180×180). Padding 10% en cada lado.
- **En la app** (`src/components/Logo.tsx`): la S se muestra dentro de un cuadro redondeado con `background: linear-gradient(145deg, #0f2d54, #0a1a2e, #0d2340)`, `border-radius` al 22% del tamaño, borde translúcido y sombra inset — efecto liquid glass oscuro.
- **Para redes sociales / imágenes de marketing:** usar `public/icons/logo-s.png` como logo. Fondo recomendado: navy `#0D1B2A` o el gradiente hero (`#241C53 → #0D1B2A`). Colores de marca: teal `#0FA3A3`, indigo `#5B5BF0`, azul claro `#0EA5E9`. Tipografía display: Bricolage Grotesque.

## Design system
- **Glass morphism**: `.glass` and `.glass-strong` utility classes with `backdrop-filter`
- **iOS fix**: `@supports (-webkit-touch-callout: none)` disables backdrop-filter on iOS Safari (corner artifact bug), falls back to opaque `--glass-solid` / `--glass-strong-solid` variables
- **Colors**: `--teal` (#0FA3A3), `--indigo` (#5B5BF0), `--coral` (#FF5A4D), `--amber` (#E8920C), `--ink`, `--muted`
- **Fonts**: Bricolage Grotesque (display), Instrument Sans (body), Space Mono (mono/numbers)
- **Rounded corners**: all cards use `rounded-3xl`
- **Dark mode**: `[data-theme="dark"]` on `<html>`

## Recent work completed
### Contacts tab, itemized scan expenses + receipts in Storage
- **Home tabs Groups | Contacts:** segmented toggle in `Home.tsx`. **Contacts** = your network (people you've shared a group with) via `getNetwork`, searchable by name/email, ordered by most-recent active group. **Hide/restore** contacts locally (`src/lib/hiddenContacts.ts`, localStorage + hook): hidden ones drop from the Contacts list AND from suggestions (CreateGroupModal/UsersModal) but aren't deleted (restore or re-add by email). New `ContactsView.tsx`.
- **Registered-only members + suggestions:** CreateGroupModal & UsersModal suggest your network (click to add) with a search bar; the "add without account" (manual) flow was removed. **Needs `migrate_v4` RLS** (`View co-members`) or the network is empty.
- **Scan receipt overhaul (`scan-receipt` + `ScanReceiptModal` + `ItemizedExpenseEditor`):** the AI now returns priced line items only (modifiers folded/ignored) with `qty`/`unitPrice`, plus `fees[]` (surcharges), `tax{amount,rate,included}`, `subtotal`. UI: quantities **expand into individual assignable rows** (per-plate split; solves the "x2" / invited-person case), a per-row **split-in-two** fallback, **surcharges split proportionally** to consumption, **tip split equally**, **tax shown read-only**. **`scan-receipt` must be re-deployed manually** (CORS inlined for dashboard paste).
- **Itemized expenses are editable per-plate:** `Expense.items[]/fees[]/tip` persisted; editing such an expense reopens the shared `ItemizedExpenseEditor` (not the totals-only `ExpenseForm`). Normal expenses still use `ExpenseForm`.
- **Receipt photo in Supabase Storage:** `src/lib/storage.ts` (`uploadReceipt` compressed → private bucket `receipts/{groupId}/{uid}.jpg`; `getReceiptUrl` signed 1h). `ScanReceiptModal` uploads on save → `Expense.receiptPath`; `ReceiptButton.tsx` in the expense detail shows it full-screen. **Needs `migrate_v5_receipts_storage.sql`** (private bucket + member-only RLS via `is_member_of`). Receipt is **not yet in the report** (planned: embed thumbnail in the print PDF; CSV = yes/no, no expiring link).

### Avatar bubbles, delete confirmation + expense filters
- **Burbujas de iniciales no solapadas:** las burbujas con iniciales (participantes en cada gasto/recurrente y miembros en las tarjetas de grupo de Home) van ahora **una al lado de la otra** (`gap-1` + `flex-wrap`) en vez de superpuestas (antes `-mr-1.5` / `-space-x-2`). En `ExpenseList.tsx`, `RecurringList.tsx`, `Home.tsx`.
- **Iniciales + color únicos por grupo:** `memberLabels(group.members)` en `src/lib/format.ts` genera una etiqueta (iniciales) y color **únicos por persona dentro del grupo** (alarga las iniciales si chocan: PA/PAU; respeta las personalizadas; garantiza color distinto). Usado en burbujas de gastos, recurrentes y avatar del pagador.
- **Confirmación antes de borrar:** nuevo `src/components/ConfirmModal.tsx` (genérico, danger). Eliminar un **gasto** (o aprobar una eliminación solicitada) y un **recurrente** abre un diálogo de confirmación ("no se puede deshacer") → evita borrados accidentales. Gasto: `ExpenseList` intercepta el botón con `confirmId`; recurrente: `RecurringList` con `confirmId`.
- **Borrado de recurrente en Actividad:** nuevo `ActivityType` **`recurring_deleted`**; `deleteRecurring` (store) lo registra con `withActivity` (label+amount); icono `trash` + string `activity.recurring_deleted` en `i18n.ts`/`NotificationsBell.tsx`.
- **Filtros en la sección de Gastos (`ExpenseList`):** botón **Filtros** (icono nuevo `filter`) junto al título con badge de filtros activos. Panel con chips de **pagador** (quién puso el dinero, incl. multi-pagador → lo que le deben), **participante** (quién comparte el coste → lo que tiene que pagar), **categoría** (solo categorías presentes) y **mes-año** (reutiliza `monthsWithExpenses`/`monthKey`/`monthLabel` de `report.ts`). Las listas de pagador/participante solo muestran a quien aparece en ese rol. Combinables, muestran "N de Total", botón **Limpiar**, y mensaje `filter.none` si nada coincide. Strings `filter.*` en `i18n.ts`.

### Reports (Pro) + expense polish
- **Reportes exportables (Pro):** botón "doc" en la cabecera de GroupView → `ReportModal` (pantalla completa, gateado con Paywall si no eres Pro). Filtrable **por mes** (chips: "Todo el histórico" + cada mes con gastos). Muestra cabecera con marca, totales, saldos por persona, liquidación, detalle de gastos y pagos realizados. **Descargar PDF** = `window.print()` con CSS `@media print` (solo imprime `#report-print`, fuerza colores claros) → "Guardar como PDF". **Descargar CSV** = multi-sección (BOM para acentos en Excel). Lógica en `src/lib/report.ts` (reutiliza `computeSettle`/`directTransfers`); icono `doc` añadido a `Icon.tsx`. Cero dependencias nuevas, offline.
- **Gastos:** la fila colapsada muestra burbujas con las iniciales de los participantes (sin abrir el gasto). Pagos confirmados ya **no se pueden deshacer** (se quitó el botón "Deshacer" en `Balances`; rechazar un pago *pendiente* sigue existiendo). Notificaciones/actividad: `payment_made` ahora lleva `toId`, así el destinatario aparece como "TuNombre (tú/you)" cuando eres tú.

### Rebrand to SettliA + custom domain + settle/reminders
- **Rebrand → SettliA** in both repos (logo + colors reverted to Settly's; `settly-original` branch keeps the old state). Wordmark: `Settl` + `iA` accent. In-app hero the `iA` uses `.wm-ai` (bright blue `#7DB8FF` + dark halo) so it doesn't blend into the hero gradient; landing uses `#2563EB` (nav) / `#60A5FA` (dark mockup). "Powered by AI" line under the tagline (`app.poweredAI`).
- **Custom domain:** app on `app.settlia.app` (`base: "/"`, `public/CNAME`, manifest/`index.html`/`push-sw.js`/`fonts.css` paths all root-relative), landing on `settlia.app`.
- **Activity log (separate from notifications):** `group.activity: ActivityEvent[]` (JSON, no SQL, realtime-synced). `src/lib/activity.ts` (`withActivity`, `buildActivity`). Includes your OWN actions + more event types (group/member/expense/payment/ready/recurring/scan). The bell opens a full-screen view with a **Notificaciones | Actividad** segmented toggle. Notifications badge moved OUTSIDE the `.glass` button (it was clipped by `overflow:hidden`).
- **Settle-up by role (`Balances.tsx`):** "Group balances" stacked above "To settle up" (was 2-col). **Pay** button only for the debtor (`from === me`); **Mark paid** only for the creditor (`to === me`) and it now creates a `confirmed` settlement directly (MarkPaidModal reworded to "confirm received"). Removed the payment-methods editor from Balances (`PayMethodModal` now orphaned) — pay methods are edited **only** in the profile (`AccountModal`); `PaySheet` still shows them read-only when paying.
- **Home overall balance pills:** above the groups list, aggregated across active groups — `T:` total spent (your share), `↓` total you owe (red), `↑` total you're owed (green). Assumes one currency (uses first group's).
- **Parser "per person":** "X cada uno / c/u / each / por persona" → total = X × participants. In both `parse.ts` (local) and the `parse-expense` LLM prompt.
- **"Added everything" status** (`ReadyToSettle`): mark you're done + see everyone's status. The manual **Remind** button was removed (reminders are now automatic/daily); non-ready members show a "Pending" label.
- **Daily reminders (code ready, NOT deployed):** `supabase/functions/daily-reminders/index.ts` (cron-triggered push: phase A = nudge those not "ready" if the group has expenses; phase B = once all ready, nudge debtors until settled) + `supabase/cron_daily_reminders.sql` (pg_cron + pg_net, daily). Protected by `CRON_SECRET`; reuses VAPID + `push_subscriptions`. **Requires Web Push deployed first** (see Pending).
- **Payment mode (`Group.simplifyDebts`, default true):** Balances picks `directTransfers()` (pay whoever fronted each expense) when `simplifyDebts === false`, else `computeSettle`'s minimal transfers. Toggle in GroupSettings (Simplificado/Directo). Free for everyone.
- **Group kind (`Group.kind: "trip" | "home"`, default trip):** chosen on create + editable in settings. **"home"** (household/ongoing) hides the "I added everything" (`ReadyToSettle`) block — shows a "continuous accounts" note instead — and in `daily-reminders` skips phase A and only nudges debtors **weekly (Mondays UTC)**. **"trip"** = current behavior.

### AI live on Groq + receipt scanning (PRs #34–#37)
- **All three AI functions deployed on Groq** (one key, `STT_API_KEY`): `transcribe` (Whisper turbo), `parse-expense` (`llama-3.1-8b-instant`), `scan-receipt` (`llama-4-scout`). Deployed manually via the Supabase dashboard editor (single-file paste); Edge Functions do **not** deploy via CI.
- **`parse-expense`**: forces JSON, server-side **sanitize** (valid member IDs, allowed category, valid interval), matches **nicknames/diminutives** ("Ale"→"Alecita"), and a hardened system prompt (note is untrusted data, never instructions; non-expense → amount 0).
- **Multiple payers**: `parse-expense` returns `payments` (payer→amount), independent from `participantIds` (who shares the cost). `AddExpense` enables multi-pay only when ≥2 payers and amounts sum to total. Wired through `ai.ts`/`parse.ts` types.
- **`scan-receipt` (vision)**: **no `response_format`** — Groq's strict JSON mode makes vision models degenerate (`json_validate_failed`); rely on prompt + `extractJson`. Receipt photo is **compressed/resized** (`fileToScanImage`, ≤1600px) before upload — large photos were blowing the Edge Function limit and silently falling back to the demo.
- **Scan UX**: removed the misleading Italian demo fallback (now shows a real error + blank row), added **gallery upload** (not just camera), an optional **tip** split among those who consumed, and the final button now says "Add expense".
- **Cost note**: Groq is the cheapest path (scan ~€0.00025, parse ~€0.00002, STT ~€0.003/min). No Stripe yet; AI cost is negligible vs payment fees at scale.
- **UI**: recurring-expenses section moved **below the "Expenses" title** (now rendered inside `ExpenseList`, not `GroupView`).
- **Editable initials** per member (`Member.initials`, helper `memberInitials`, used in all avatars) and **bank transfer = two fields** (BSB + account, `PayMethod.value2`); pay methods shown inline when settling. Fixed a "blank pay" bug (collapsed multiple `updateMyMember` writes into one to avoid out-of-order persists).
- **Multiple pay methods saved separately** (`Member.pays: PayMethod[]`, helper `memberPays`; `pay` kept = `pays[0]` for compat). AccountModal/PayMethodModal keep a per-type draft so values no longer bleed across types; Balances lists all of the payee's methods. Notifications bell opens a **full-screen view** (not a floating dropdown).
- **In-app notifications (Phase 1)**: bell in the header (`NotificationsBell`) showing a feed of `expense_added` / `payment_made` / `review_requested` (anonymous) events. Stored in `group.notifications` (group JSON, no SQL), synced via realtime; read-state per device in localStorage (`src/lib/notifications.ts`).
- **Web Push (Phase 2)**: `src/lib/push.ts` (subscribe + `notifyGroup`), `public/push-sw.js` (push/notificationclick handlers, imported via `workbox.importScripts`), Edge Function `send-push` (npm:web-push + service-role; resolves recipients = other group members, excludes the JWT caller), table `push_subscriptions` (`supabase/push_subscriptions.sql`). Toggle in `AccountModal`. **Needs deploy**: run the SQL, `supabase functions deploy send-push`, set secrets `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (+ optional `VAPID_SUBJECT`). VAPID **public** key is committed in `push.ts`; **private** key is a secret only. iOS requires the PWA installed (16.4+).

### Backend, auth & AI (PRs #19–#32)
- **Supabase Auth**: Google login + email/OTP + account creation. Phone/SMS step made **optional** in beta (was blocking login with no SMS provider). A **guest mode** exists for quick testing (no session → groups don't persist/sync; only real accounts persist).
- **Groups persist & sync** across devices for logged-in users; `addGroup` awaits ordered inserts (owner membership before others, per RLS). Fixed the "create share link" error (idempotent upsert of group+member before link creation, `src/lib/invite.ts`).
- **Create group = registered users only**: selector of your network (`getNetwork`); no free-text people. Empty when you have no network (invite others by link).
- **Profile avatar**: Google photo by default, can upload your own (saved as data URL in `profiles.avatar`). Avatars now render as images everywhere (fixed a bug where the avatar URL showed as raw text in the expense form).
- **Freemium / Pro**: plan read from Supabase `entitlements`; Pro unlocked via **access codes** (`redeem_access_code` SECURITY DEFINER fn; beta code `SETTLYBETA`). No Stripe yet. Recurring expenses + unlimited AI are **Pro-gated** (decision: keep recurring as Pro).
- **Three AI paths wired** (Edge Functions, keys server-side only), all on **Groq**: `parse-expense` (text→expense+category, `llama-3.1-8b-instant`), `scan-receipt` (vision, Llama 4 Scout), `transcribe` (Whisper). Interpret uses the LLM when Pro/quota, else the local regex parser. **`transcribe`/`parse-expense` deployed; `scan-receipt` ready to deploy** (reuses `STT_API_KEY`, no new secret).
- **Voice→text**: Web Speech on Android/desktop; on iPhone records→**server STT** (Edge Function `transcribe` → Groq `whisper-large-v3-turbo`). Needs connection; offline → add manually. Language follows the ES/EN toggle. (Replaced the old in-browser Whisper, which failed on iPhone — `src/lib/whisper.ts` + `@huggingface/transformers` removed.)
- **Categories** expanded 6→12 (added Groceries, Drinks, Travel, Health, Bills/Services, Gifts) with icons, i18n, and parser keywords.
- **UI**: login top-aligned; onboarding shows **once** (localStorage `settly.onboarded`; skip/finish both set it) with a **replay "?" button** in the header. Final onboarding slide + the header Install button both render the device-aware `InstallGuide` (iOS steps / Android native prompt / standalone "installed").

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
> Plan completo y fases en **`ROADMAP.md`**.
- **Receipt/proof images:** scanned receipts are now stored in **Supabase Storage** (private bucket `receipts`, `Expense.receiptPath`, signed URLs, member-only RLS — `src/lib/storage.ts`; run `migrate_v5_receipts_storage.sql`). Still pending: **payment proof** is still a **base64 data URL in the group JSON** (`settlement.proof`) — migrate it to Storage too + migrate legacy base64; and **show the receipt in the report** (embed thumbnail in the print PDF; CSV = yes/no, signed links expire). (ROADMAP Fase 1.)
- **Recurring expenses** generate a real expense per cycle via `processRecurring` (client-side, on group open, catch-up ≤12). Each pass now logs a `recurring_generated` event to **Activity + Notifications + push** (one entry per rule per pass, even across catch-up cycles). Still optional/planned: **server cron generation** (materialize occurrences even if nobody opens the group). (ROADMAP Fase 1.)
- **Web Push not deployed yet** (blocks daily reminders): run `push_subscriptions.sql`, `supabase functions deploy send-push`, set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`. Then for reminders: `supabase functions deploy daily-reminders --no-verify-jwt`, `supabase secrets set CRON_SECRET=…`, and run `supabase/cron_daily_reminders.sql` (fill `<PROJECT_REF>` + `<CRON_SECRET>`). Cron is set to **`0 23 * * *` (≈9–10am Australia/Sydney)**.
- **Daily reminders are bilingual (ES/EN):** `push_subscriptions.lang` stores each user's language (set on subscribe from `settly.lang`); `daily-reminders` localizes the message per subscription.
- **Overall balance pills assume one currency** (first active group's); mixed-currency groups would total incorrectly.
- **`PayMethodModal.tsx` is now orphaned** (editing moved to the profile). Safe to delete later.
- **Edge Functions deploy manually**, not via CI — when you change `supabase/functions/*`, re-paste the single file in the Supabase dashboard editor and Deploy. The repo copy is just the source of truth.
- **`delete-account` Edge Function** (RGPD/stores) **deployed & verified**. Service-role; explicitly clears all user-referencing rows (push subs, memberships, invite_links, entitlements, code_redemptions, feedback, profile) before `auth.admin.deleteUser` so a missing FK CASCADE on the live DB doesn't 500; transfers ownership of shared groups to another member first; returns the real error in `detail` on failure. CORS is inlined (no `../_shared` import) so it pastes into the dashboard editor. Called from `auth.deleteAccount()` + "Delete account" button in `AccountModal`.
- **Legal pages** live in the landing repo (`privacy.html`, `terms.html`, bilingual, linked in footer). Update the contact email + get a lawyer review before ads.
- **Groq has no Maverick on this account** (`model_not_found`); `scan-receipt` defaults to Llama 4 Scout. For better dense-receipt accuracy later, set `AI_VISION_MODEL` (e.g. a Claude vision model via OpenRouter) — no code change.
- **Voice STT is server-side (Groq)**: dictation needs a connection; offline the mic shows an error and the user adds the expense manually.
- Interpret/parser: local regex parser (`parse.ts`) is the free fallback; the LLM (`parse-expense`) is the smart path. Falls back automatically on error/no quota.
- Hero pills render even when `0` on a side (could hide the zero side or show a "settled" state).
- When reusing the same working branch across multiple PRs, reset it to `origin/master` before starting new work — squash-merges otherwise cause merge conflicts on the next PR.

## Multi-session / concurrency notes
- CLAUDE.md is a normal repo file — it is **not** auto-updated; it only changes when a session edits + commits it. Keep it current manually.
- **Multiple Claude sessions can run on the same repo at once.** Git does not auto-merge silently: edits land via commits/PRs, and concurrent edits to the same lines cause merge conflicts (not silent loss). Risk of clobbering exists mainly when two sessions push to the **same branch** with force-push.
- Safe pattern (what we use): one branch per session, `--force-with-lease` (fails if remote moved), squash-merge to `master`, then `git reset --hard origin/master` before new work to pick up other sessions' merges.
