# SettliA — Roadmap

> Estado vivo del producto. La app ya está online como PWA en **app.settlia.app**
> (landing en **settlia.app**). Esto ordena lo que falta de aquí al lanzamiento.

Leyenda: ✅ hecho · 🔧 código listo, falta desplegar · ⬜ por hacer

---

## Fase 0 — Cerrar pendientes técnicos (antes de tiendas)
Bloquean lanzamiento serio / publicación en stores.

- ✅ **Web Push** — desplegado (`send-push` + `push_subscriptions` + VAPID).
- ✅ **Recordatorios diarios** — desplegados (`daily-reminders` + `CRON_SECRET` + cron).
- ✅ **`parse-expense`** — desplegado con "por persona" forzado + few-shot.
- ✅ **`scan-receipt`** — desplegado, escaneo de tickets funcionando (Groq Llama 4 Scout).
- ✅ **Supabase Auth** — Site URL + Redirect URLs en `https://app.settlia.app`; origen Google OAuth añadido.
- ✅ **Deploy `delete-account`** — desplegada y verificada (borra perfil, membresías, push subs, entitlements y la cuenta de auth; limpia dependientes antes de `deleteUser` y transfiere propiedad de grupos compartidos).
- ✅ **Correo de dominio** (`hello@settlia.app`) — recibiendo vía **Cloudflare Email Routing** (catch-all → `settlia.app@gmail.com`); nameservers movidos a Cloudflare. Páginas legales y `VAPID_SUBJECT` apuntan a `hello@settlia.app`. (Envío saliente vía SMTP queda opcional para más adelante.)

> **Fase 0 cerrada.** Nota: al mover los nameservers a Cloudflare, el DNS ya está allí — facilita la migración de hosting a Cloudflare Pages (Fase 2).

## Fase 1 — Producto (UX / robustez)
- 🔧 **Recibos en Supabase Storage** (evidencia) — **tickets escaneados YA** (`src/lib/storage.ts`, bucket privado `receipts`, URL firmada, `Expense.receiptPath`, `ReceiptButton`; **falta correr `migrate_v5_receipts_storage.sql`**). Pendiente: extender a **comprobantes de pago** (hoy base64 en `settlement.proof`), **migrar los `proof` base64 viejos**, y **mostrar el recibo en el reporte** (miniatura embebida en el PDF; CSV = sí/no).
- ✅ **Recurrentes → eventos** — `processRecurring` registra cada pasada en Actividad + Notificaciones + push (`recurring_generated`).
- ⬜ **Recurrentes por servidor** (opcional) — cron que materialice las ocurrencias aunque nadie abra el grupo.
- ⬜ **Parser avanzado** — splits desiguales / porcentajes; glosario por grupo (apodos, comercios); pregunta de confirmación solo si hay ambigüedad.
- ⬜ **Multi-moneda** en las pills de balance global (hoy asume una sola).
- ✅ **Miembros sin cuenta ("añadir manual")** — se puede añadir a alguien a un grupo solo con su nombre, sin necesidad de que tenga cuenta todavía (`CreateGroupModal` y `UsersModal`, nombres separados por coma, sin cerrar teclado entre uno y otro). `Member.claimed: false` marca el placeholder. Al compartir el **link único del grupo**, quien se une ve un picker "¿cuál de estos eres tú?" (`ClaimMemberModal`) si hay miembros sin reclamar — elegir uno vincula su cuenta real a ese miembro (conserva el historial de gastos ya asignado) en vez de crear uno nuevo. `invite_links.claim_member_id` + `getJoinPreview`/`joinByToken` en `src/lib/invite.ts`. Requiere `migrate_v9_claim_member.sql` (ya aplicada en producción).
- ✅ **Concurrencia — gastos (Fase 1)** — arreglado el caso de dos personas editando el grupo a la vez: antes cualquier alta/edición/borrado de gasto sobrescribía **todo** el JSON del grupo desde la copia local (posiblemente desactualizada), pudiendo pisar el cambio de otro dispositivo aunque tocaran gastos distintos. Ahora `add_expense`/`patch_expense`/`delete_expense` (funciones Postgres, `SELECT ... FOR UPDATE`) parchean solo el gasto afectado de forma atómica — verificado en producción que dos ediciones "simultáneas" a campos distintos del mismo gasto ya no se pisan. `migrate_v10_atomic_expense_ops.sql` (aplicada). **Pendiente (Fase 2, no crítico):** miembros, settlements, recurrentes y notificaciones siguen usando el `updateGroup` de blob completo — colisionan mucho menos en la práctica (raro que dos editen ajustes del grupo o marquen pagos en el mismo instante), pero sería lo próximo si se quiere cerrar del todo. Tampoco cubre el caso offline (dos móviles sin conexión editando lo mismo; ese camino sigue siendo "el último en sincronizar gana").
- ✅ **Escaneo de tickets — cantidades múltiples** — un ítem "x24" ya no se explota automáticamente en 24 líneas: queda en una sola línea con botón **"Partir en N ítems"** para explotarla a demanda (asignar cada unidad a una persona distinta). Por defecto: si la cantidad ≤ nº de miembros, se preseleccionan todos (fácil deseleccionar quien no participó); si es mayor, no se preselecciona nadie (no hay default razonable). Botones **Seleccionar todos / Ninguno** en cada ítem.
- ✅ **Fix impuesto duplicado en tickets escaneados** — si el ticket ya incluye el IVA/GST en los precios (frecuente en AU/NZ: desglose informativo "GST Sales/Amount" que NO es un cargo aparte), antes a veces se sumaba de nuevo como recargo, inflando el total. Ahora se compara `subtotal` vs `total` del propio ticket: solo se añade como recargo si hay un hueco real del tamaño del impuesto. Nueva línea **"Subtotal (ítems)"** visible cuando hay recargos, para detectar a simple vista si algo se sumó de más.

## Fase 1.5 — Pre-lanzamiento: analítica, legal y seguridad
> La app ya es funcional y online; **no hacen falta las tiendas para empujar tráfico**. Esto es lo que hay que cerrar antes de lanzar en Product Hunt / redes.

**Tracking / analítica:**
- ✅ **Cloudflare Web Analytics** — activo en `settlia.app` y `app.settlia.app` (gratis, sin cookies, sin banner necesario). Sitios creados y tokens reales en producción. Se descartó Plausible (9 USD/mes) por ser de pago.
- ✅ **Admin dashboard interno** (`AdminDashboard.tsx`, solo `paabarcad@gmail.com`) — usuarios totales/Pro/nuevos 7-30d, grupos activos, códigos canjeados, push subs, registros por mes, últimos 15 usuarios. Función SQL `get_admin_stats()`.
- ⬜ **GA4** — descartado por ahora, Cloudflare Web Analytics cubre lo esencial sin fricción legal (RGPD) y sin coste.

**Legal (para no entrar en líos + requisito de las plataformas de ads):**
- ✅ **Privacy policy** sólida (datos, IA/Groq, Supabase, Google, descargo de pagos, RGPD/Australia, menores, contacto) — `privacy.html`.
- ✅ **Sin banner de cookies necesario** — Cloudflare Web Analytics no usa cookies ni recopila datos personales (decisión: sobre GA4, evita fricción legal RGPD y es gratis).
- ✅ **Revisado `terms.html`**: ya cubría descargo de responsabilidad, uso aceptable y terminación; se añadió la cláusula de **ley aplicable y jurisdicción** (Australia, con reserva de derechos de consumidor imperativos) en EN/ES (2026-07-01).
- ✅ **DPA firmados** con **Supabase** y **Groq** (RGPD Art. 28).
- ⬜ **Identidad legal/operador** (persona/empresa + país) para cuentas de ads y jurisdicción de los términos.

**Seguridad:**
- ✅ **Auditar RLS** — todas las tablas con RLS activo. Políticas añadidas a `access_codes`; EXECUTE revocado a `anon` en `handle_new_user`, `is_member_of`, `redeem_access_code` (migraciones v9 + v10, 2026-07-01). Warnings restantes son falsos positivos (`is_member_of`/`redeem_access_code` para `authenticated` es correcto e intencional) o limitaciones de plataforma (`pg_net` en public schema).
- ✅ **Leaked password protection** — activado en Supabase Dashboard → Authentication → Password Settings.
- ⬜ **Cabeceras de seguridad / CSP** (HSTS, CSP, X-Frame-Options, Referrer-Policy) — GitHub Pages no las permite; **Cloudflare Pages sí** (otra razón para migrar el hosting, Fase 2).
- ✅ **`npm audit`** — 0 vulnerabilidades (verificado 2026-07-01).
- ✅ **Quota/abuso de IA** — límites en `plan.ts`: free 3/mes, Pro scan 30 · voice 30 · text 50/mes. Edge Functions pendientes de rate-limit server-side.
- ✅ HTTPS · RLS por grupo · borrar cuenta (RGPD) · recibos en bucket privado · service-role solo en servidor.

## Fase 2 — Lanzamiento web (growth)
- ⬜ **Migrar hosting a Cloudflare Pages + privatizar repos** — pasar `settly` y `settly-landing` a Cloudflare Pages (conectado al mismo repo de GitHub; el `git push` no cambia) para poder **poner los repos en privado gratis** y quitar el límite de ancho de banda de GitHub Pages. Implica: conectar repo, build (`npm run build` → `dist`), variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `_redirects` (`/* /index.html 200`), y mover/recrear el DNS (idealmente nameservers a Cloudflare, aprovechando el correo del dominio). Las Redirect URLs de Supabase no cambian. **Disparador: el día que quieras privatizar o antes de empujar tráfico (Product Hunt/ads); hazlo con poco tráfico, el cutover es indoloro.** Alternativa rápida sin migrar: GitHub Pro (~4 USD/mes) para Pages desde repo privado.
- ⬜ **Viralidad por invitaciones** — pulir el flujo de compartir (1 toque, valor en 10 s).
- ⬜ **Comunidades nicho** — pisos compartidos, estudiantes/Erasmus, viajeros, expats (AUD → Australia).
- ⬜ **Contenido corto** (TikTok/Reels): "lo dices y la IA reparte".
  - Ideas: (1) restaurante — dictás el gasto, la IA reparte; (2) escaneo de ticket en tiempo real; (3) casa compartida con recurrentes. Formato: 30-45s, hook 3s, demo en pantalla, CTA final. Hashtags: `#splitbills #groupexpenses #gastosengrupo #lifehack #australia`.
- ⬜ **Product Hunt launch** — preparación: cuenta activa 1-2 semanas antes, capturas 1270×760px (shots.so), GIF demo, tagline "AI-powered bill splitter. Type it, say it, or scan the receipt.", descripción en inglés. Lanzar a las **00:01 PST (18:01 AEST)**. Avisar a contactos con antelación para upvotes el día D. Responder cada comentario. Buscar hunter con seguidores en PH (hunterscored.com).
- ⬜ **AlternativeTo + GetApp** — listar Settlia como alternativa a Splitwise/Tricount para capturar tráfico de usuarios que quieren cambiar.
- ⬜ **Google Ads (Search)** — campaña preparada (keywords + copy), falta crearla en ads.google.com y activar presupuesto. 2 grupos de anuncios: (1) genérico "group shared expenses app" / "gastos de grupos compartidos" → landing en `blog-app-gastos-grupos-compartidos.html`; (2) comparativa "splitwise alternative" / "tricount alternative" → landing en `settlia.app/`. Presupuesto de prueba sugerido: 10-15 USD/día, 1-2 semanas. Ubicación Australia, ampliar después.
  - ⬜ **Conversion tracking (bloqueante antes de gastar presupuesto real)** — se retomó la idea de GA4 (antes descartada para analítica general, Cloudflare Web Analytics ya cubre eso) específicamente para medir conversiones de Ads: eventos `sign_up` / `first_group_created` importados como conversión en Google Ads. **Pendiente del usuario:** crear la propiedad GA4 (Measurement ID `G-XXXXXXX`) y la cuenta de Google Ads, vincularlas, y pasar el ID para cablear el tag + los eventos en la landing y en `src/lib/auth.ts`/`src/lib/store.ts`. Sin esto, correr ads es gastar a ciegas.
- 🔧 **SEO landing** — ✅ hecho lo técnico (`sitemap.xml`, `robots.txt`, JSON-LD `SoftwareApplication`/`FAQPage`/`BlogPosting`, title/description con keywords). **Falta:** enviar sitemap a **Google Search Console** + Bing Webmaster, **páginas comparativa** ("vs Splitwise", "alternativa a Splitwise en Australia"), más artículos de blog (clusters long-tail), y conseguir **backlinks** (Product Hunt, AlternativeTo, Reddit, comunidades). Métricas privacy-friendly (Plausible/Umami).
- ⬜ **Link de pago / split sin registro (estilo BillBoss)** — el amigo abre un enlace y ve su parte + datos de pago **sin instalar ni registrarse**. Hoy hay que crear cuenta para unirse a un grupo = fricción. Evaluar un flujo ligero de "pagar por link" para gastos puntuales.

## Fase 3 — Google Play (~25 USD único)
- ✅ Empaquetado con **Capacitor** (no TWA) — `android/` scaffolded (mismo appId `app.settlia.pwa`), íconos/splash de marca, deep link `app.settlia.pwa://` para OAuth, firma release por Gradle properties. CI `.github/workflows/android-release.yml` (build `.aab` firmado) — **necesita 4 secrets** (`ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_STORE_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS=settlia`, `ANDROID_RELEASE_KEY_PASSWORD`).
- ⬜ **Cuenta Google Play Console** ($25 único) + crear el app listing (capturas, feature graphic, política de privacidad, cuestionario de clasificación de contenido, "Seguridad de los datos", target API).
- ⬜ **Primer `.aab` se sube a mano** (Play lo exige la primera vez); auto-publish vía service-account JSON queda como TODO comentado en el workflow.
- ⬜ **20 testers durante 14 días** (prueba cerrada) antes de producción.
- ⬜ `assetlinks.json` si se quiere verificación de dominio / app links.

## Fase 4 — App Store (~99 USD/año)
- ✅ Empaquetar con **Capacitor** (WKWebView + plugins) — `ios/App` scaffolded, `codemagic.yaml` con workflow `ios-testflight` (build + auto-submit a TestFlight). Íconos/splash nativos reemplazados (placeholder de Capacitor → navy `#0D1B2A` + logo real); permisos `NSCameraUsageDescription`/`NSMicrophoneUsageDescription`/`NSPhotoLibraryUsageDescription` agregados a `Info.plist` (faltaban — hubieran causado crash/rechazo).
- ✅ **Sign in with Apple**: entitlement `com.apple.developer.applesignin` ya está en `App.entitlements` y el flujo OAuth nativo (`app.settlia.pwa://` + PKCE) ya soporta Apple. **Pendiente del lado de Apple**: habilitar la capability "Sign In with Apple" en el App ID desde el Apple Developer portal (paso manual, no se puede hacer desde el repo).
- ⬜ Borrar cuenta in-app (Fase 0, ya implementado) + **App Privacy label** (cuestionario en App Store Connect), capturas de pantalla por tamaño de dispositivo, descripción/keywords — todo pendiente en App Store Connect.
- ⬜ **Cuenta de Apple Developer Program** ($99/año) + registrar el app record en App Store Connect (`app.settlia.pwa`) + integración `codemagic_appstore` en Codemagic (API key de App Store Connect: Issuer ID + Key ID + .p8).
- ⚠️ Cuidar guía 4.2 ("minimum functionality"): el push/offline/instalación ayudan.
- ✅ **Push en la app nativa** — resuelto con **APNs directo** (`@capacitor/push-notifications` + `device_push_tokens` + `send-push`/`daily-reminders` firmando JWT ES256 con la `.p8`). El Web Push no funciona en WKWebView; APNs es el canal nativo. Secrets `APNS_KEY_P8`/`APNS_KEY_ID`/`APNS_TEAM_ID` puestos; `daily-reminders` **pendiente de re-deploy manual** con el código APNs.
- 🚀 **Enviado a App Store review (2026-07)** — build con push nativo subido, screenshots iPhone + iPad 13", App Privacy, Pricing (Free), cuenta demo `demo.review@settlia.app`. Esperando veredicto de Apple.

### Pendientes técnicos / CI (anotados 2026-07)
- 🔧 **Codemagic ya NO construye automáticamente en push a `master`** (`codemagic.yaml` → `branch_patterns include: false`). Solo build manual (Start new build) o por API. Motivo: poder desplegar cambios de la PWA a `master` sin generar builds de iOS mientras la app está en review. **Para reactivar el auto-build:** volver a poner `include: true`.
- ⚠️ **No lanzar un build de iOS a Codemagic mientras la app siga "In Review"** (subiría un build nuevo a TestFlight; no rompe la review pero conviene esperar el veredicto).

## Fase 4.5 — Vault personal de gastos (idea a evaluar)
> Inspirado en Easy Expense. Complementa el core de gastos grupales con un módulo **personal** para rastrear gastos individuales deducibles de impuestos. Especialmente relevante para Australia (año fiscal ATO: 1 jul → 30 jun).

- ⬜ **Tab "Vault" en Home** — junto a Grupos y Contactos. Gastos personales, no compartidos.
- ⬜ **Escanear recibo → vault** — reutiliza el scanner AI existente (`scan-receipt` Edge Function). Extrae monto, fecha, proveedor, categoría automáticamente.
- ⬜ **Categorías ATO** — Work from home, Vehicle & travel, Phone & internet, Education, Clothing, Meals (client), Other. Distintas a las categorías de gastos grupales.
- ⬜ **Resumen Jul–Jun** — vista de gastos deducibles por año fiscal australiano, agrupados por categoría, con total acumulado.
- ⬜ **Export CSV/PDF para el contador** — todos los recibos del año fiscal en un solo archivo. PDF = printable con logo + tabla. CSV = para contadores/software contable.
- ⬜ **Recibos en Storage** — cada recibo del vault en bucket privado `vault-receipts/{userId}/{uid}.jpg` (igual que los de grupos).
- ⬜ **"Mover al vault"** — desde un gasto grupal, guardar tu parte como gasto personal deducible en el vault con un toque.
- ⬜ **Pro gate** — vault ilimitado en Pro; free = hasta 10 recibos/año.

> **Dependencias:** bucket Storage en Supabase + nueva tabla `vault_expenses` con RLS por `user_id`. Reutiliza el componente `ScanReceiptModal` y `src/lib/storage.ts`.
> **Por qué Australia:** el ATO exige comprobante por cada deducción >$300; trabajadores en relación de dependencia pueden deducir gastos de trabajo; autónomos (ABN) necesitan llevar libros. La app ya tiene usuarios en AU.

## Fase 5 — Monetización
- ⬜ **Stripe** (web) para Pro. Definir límites free vs Pro.
- ⚠️ **Reglas de tiendas:** vender bienes digitales *dentro* de la app → comisión 15-30% (IAP). Mantener el pago de Pro **por web/códigos**, no dentro de la app iOS.

### Pagos automáticos (opcional, evaluar a futuro)
- **Modelo A — "mostrar y confirmar" (actual, 0 comisión):** mostramos PayID/banco del que cobra; la persona paga desde su banco (Osko/PayID = instantáneo y gratis en AU) y se confirma. Sin licencia ni custodia de dinero. **Recomendado para esta etapa.**
- **Modelo B — pago automático real (mueve dinero, siempre con comisión):** en AU lo más barato es **PayTo/NPP** vía **Monoova / Azupay / Zai** (céntimos por transferencia, no %); tarjeta (Stripe ~1.7%+30c) mata los splits pequeños. Implica cumplimiento (AFSL propia o apoyarse en el proveedor, KYC/AML). Solo cuando haya volumen que lo justifique.

## Deuda técnica / limpieza
- ⬜ Borrar `PayMethodModal.tsx` (huérfano; edición de métodos solo en perfil).
- ⬜ Migrar `settlement.proof` base64 → Storage (con Fase 1).
- ⬜ Revisar concurrencia de `processRecurring` (posible doble generación si dos abren a la vez).
- ⬜ **Concurrencia — Fase 2**: extender el patrón atómico (`SELECT ... FOR UPDATE` + parche puntual) a miembros, settlements, recurrentes y notificaciones; hoy siguen en el `updateGroup` de blob completo (ver Fase 1).

---

### Hecho recientemente (resumen)
Rebrand a **SettliA** + dominios propios · Actividad (log) · settle-up por rol con
aprobación del acreedor · **pagos parciales** con recálculo · banner "pagos por
confirmar" · pills de balance global · parser "por persona" + few-shot +
suposiciones · tipo de grupo (Puntual/Casa) · recordatorios diarios bilingües
(código y desplegados) · sello de versión en el footer · **redeploy `send-push` v10
+ `daily-reminders` v11** (2026-06-29).

**Sesión 2026-07-08:** miembros sin cuenta + link único con picker de reclamo ·
**fix de concurrencia (Fase 1, gastos)** con operaciones atómicas en Postgres ·
escaneo de tickets: cantidades múltiples ya no se auto-explotan (botón "Partir
en N") + fix de IVA/GST duplicado + línea de subtotal · categoría y pagador
movidos arriba en el form de gasto · miembros **ordenados alfabéticamente** en
toda la app · tipografía unificada a **Baloo 2** (self-hosted, reemplaza
Bricolage/Inter/Space Mono) · pills de balance global: Total, debo y me deben
cada una en su propia pill separada.
