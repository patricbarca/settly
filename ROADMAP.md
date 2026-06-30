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

## Fase 1.5 — Pre-lanzamiento: ads, legal y seguridad (antes de gastar en publicidad)
> La app ya es funcional y online; **no hacen falta las tiendas para anunciar la PWA web**. Esto es lo que sí hay que cerrar antes de empujar tráfico pagado (Meta/IG/Google Ads).

**Tracking / ads (imprescindible para optimizar campañas):**
- ⬜ **Meta Pixel** + **Google Ads tag / GA4** en landing y app, con eventos de conversión (visita → registro → crear grupo → añadir gasto). Sin esto los ads no optimizan = dinero tirado.
- ⬜ **Verificación de dominio** en Meta Business y Google (meta-tag o DNS).
- ⬜ **Analítica de producto** (Plausible/Umami o GA4) para ver el embudo real.

**Legal (para no entrar en líos + requisito de las plataformas de ads):**
- ✅ **Privacy policy** sólida (datos, IA/Groq, Supabase, Google, descargo de pagos, RGPD/Australia, menores, contacto) — `privacy.html`.
- ⬜ **Banner de consentimiento de cookies** + carga **condicional** de los pixels (obligatorio en UE en cuanto se añadan Meta/GA). **Bloquea anunciar legalmente en UE.**
- ⬜ **Actualizar privacy.html** con sección **cookies** + proveedores **Meta/Google** cuando se añada el tracking.
- ⬜ **Revisar `terms.html`**: descargo de responsabilidad (no procesador de pagos, no responsable de deudas entre usuarios, sin garantías), uso aceptable, **ley/jurisdicción** aplicable, terminación de cuenta.
- ⬜ **Firmar DPA** con **Supabase** y **Groq** (RGPD Art. 28; un clic en cada panel).
- ⬜ **Identidad legal/operador** (persona/empresa + país) para cuentas de ads y jurisdicción de los términos.

**Seguridad:**
- ⬜ **Auditar RLS** de Supabase (security advisors): que ninguna tabla quede sin Row-Level Security. *Lo más crítico.*
- ⬜ **Cabeceras de seguridad / CSP** (HSTS, CSP, X-Frame-Options, Referrer-Policy) — GitHub Pages no las permite; **Cloudflare Pages sí** (otra razón para migrar el hosting, Fase 2).
- ⬜ **`npm audit`** — dependencias con vulnerabilidades conocidas.
- ⬜ **Quota/abuso de IA** — límite por usuario para las Edge Functions de IA (andamiaje en `plan.ts`) y no disparar la factura.
- ✅ HTTPS · RLS por grupo · borrar cuenta (RGPD) · recibos en bucket privado · service-role solo en servidor.

## Fase 2 — Lanzamiento web (growth)
- ⬜ **Migrar hosting a Cloudflare Pages + privatizar repos** — pasar `settly` y `settly-landing` a Cloudflare Pages (conectado al mismo repo de GitHub; el `git push` no cambia) para poder **poner los repos en privado gratis** y quitar el límite de ancho de banda de GitHub Pages. Implica: conectar repo, build (`npm run build` → `dist`), variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `_redirects` (`/* /index.html 200`), y mover/recrear el DNS (idealmente nameservers a Cloudflare, aprovechando el correo del dominio). Las Redirect URLs de Supabase no cambian. **Disparador: el día que quieras privatizar o antes de empujar tráfico (Product Hunt/ads); hazlo con poco tráfico, el cutover es indoloro.** Alternativa rápida sin migrar: GitHub Pro (~4 USD/mes) para Pages desde repo privado.
- ⬜ **Viralidad por invitaciones** — pulir el flujo de compartir (1 toque, valor en 10 s).
- ⬜ **Comunidades nicho** — pisos compartidos, estudiantes/Erasmus, viajeros, expats (AUD → Australia).
- ⬜ **Contenido corto** (TikTok/Reels): "lo dices y la IA reparte".
  - Ideas: (1) restaurante — dictás el gasto, la IA reparte; (2) escaneo de ticket en tiempo real; (3) casa compartida con recurrentes. Formato: 30-45s, hook 3s, demo en pantalla, CTA final. Hashtags: `#splitbills #groupexpenses #gastosengrupo #lifehack #australia`.
- ⬜ **Product Hunt launch** — preparación: cuenta activa 1-2 semanas antes, capturas 1270×760px (shots.so), GIF demo, tagline "AI-powered bill splitter. Type it, say it, or scan the receipt.", descripción en inglés. Lanzar a las **00:01 PST (18:01 AEST)**. Avisar a contactos con antelación para upvotes el día D. Responder cada comentario. Buscar hunter con seguidores en PH (hunterscored.com).
- ⬜ **AlternativeTo + GetApp** — listar Settlia como alternativa a Splitwise/Tricount para capturar tráfico de usuarios que quieren cambiar.
- 🔧 **SEO landing** — ✅ hecho lo técnico (`sitemap.xml`, `robots.txt`, JSON-LD `SoftwareApplication`/`FAQPage`/`BlogPosting`, title/description con keywords). **Falta:** enviar sitemap a **Google Search Console** + Bing Webmaster, **páginas comparativa** ("vs Splitwise", "alternativa a Splitwise en Australia"), más artículos de blog (clusters long-tail), y conseguir **backlinks** (Product Hunt, AlternativeTo, Reddit, comunidades). Métricas privacy-friendly (Plausible/Umami).
- ⬜ **Link de pago / split sin registro (estilo BillBoss)** — el amigo abre un enlace y ve su parte + datos de pago **sin instalar ni registrarse**. Hoy hay que crear cuenta para unirse a un grupo = fricción. Evaluar un flujo ligero de "pagar por link" para gastos puntuales.

## Fase 3 — Google Play (~25 USD único)
- ⬜ Empaquetar **TWA** (Bubblewrap / PWABuilder) + `assetlinks.json`.
- ⬜ Cuenta de desarrollador; **20 testers durante 14 días** (prueba cerrada) antes de producción.
- ⬜ Política de privacidad, "Seguridad de los datos", clasificación de contenido, target API.

## Fase 4 — App Store (~99 USD/año)
- ⬜ Empaquetar con **Capacitor** (WKWebView + plugins).
- ⬜ **Sign in with Apple** (obligatorio por ofrecer login Google).
- ⬜ Borrar cuenta in-app (Fase 0), **App Privacy label**, capturas por tamaños, revisión.
- ⚠️ Cuidar guía 4.2 ("minimum functionality"): el push/offline/instalación ayudan.

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

---

### Hecho recientemente (resumen)
Rebrand a **SettliA** + dominios propios · Actividad (log) · settle-up por rol con
aprobación del acreedor · **pagos parciales** con recálculo · banner "pagos por
confirmar" · pills de balance global · parser "por persona" + few-shot +
suposiciones · tipo de grupo (Puntual/Casa) · recordatorios diarios bilingües
(código y desplegados) · sello de versión en el footer · **redeploy `send-push` v10
+ `daily-reminders` v11** (2026-06-29).
