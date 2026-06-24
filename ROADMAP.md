# SettliA — Roadmap

> Estado vivo del producto. La app ya está online como PWA en **app.settlia.app**
> (landing en **settlia.app**). Esto ordena lo que falta de aquí al lanzamiento.

Leyenda: ✅ hecho · 🔧 código listo, falta desplegar · ⬜ por hacer

---

## Fase 0 — Cerrar pendientes técnicos (antes de tiendas)
Bloquean lanzamiento serio / publicación en stores.

- 🔧 **Web Push** — `push_subscriptions.sql` (incluye `lang`) + `supabase functions deploy send-push` + secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`.
- 🔧 **Recordatorios diarios** — `supabase functions deploy daily-reminders --no-verify-jwt` + `CRON_SECRET` + `cron_daily_reminders.sql` (Sídney `0 23 * * *`).
- 🔧 **Re-deploy `parse-expense`** — para activar "por persona" forzado en servidor + few-shot.
- 🔧 **Deploy `scan-receipt`** — si aún no está desplegada.
- 🔧 **Deploy `delete-account`** — borrar cuenta (requisito de App Store/Play + RGPD).
- ⬜ **Correo de dominio** (`hola@settlia.app`) → actualizar `VAPID_SUBJECT` y el email de contacto en `privacy.html`/`terms.html`.
- ⬜ **Supabase Auth** — Site URL + Redirect URLs → `https://app.settlia.app`; Google OAuth: añadir el origen.

## Fase 1 — Producto (UX / robustez)
- ⬜ **Recibos en Supabase Storage** (evidencia) — bucket privado + ruta con `groupId` + URL firmada; subir comprobantes de pago y tickets escaneados. Migrar los `proof` base64 viejos.
- ⬜ **Recurrentes → eventos** — registrar cada ocurrencia generada en Actividad (y opcional Notificaciones).
- ⬜ **Recurrentes por servidor** (opcional) — cron que materialice las ocurrencias aunque nadie abra el grupo.
- ⬜ **Parser avanzado** — splits desiguales / porcentajes; glosario por grupo (apodos, comercios); pregunta de confirmación solo si hay ambigüedad.
- ⬜ **Multi-moneda** en las pills de balance global (hoy asume una sola).

## Fase 2 — Lanzamiento web (growth)
- ⬜ **Migrar hosting a Cloudflare Pages + privatizar repos** — pasar `settly` y `settly-landing` a Cloudflare Pages (conectado al mismo repo de GitHub; el `git push` no cambia) para poder **poner los repos en privado gratis** y quitar el límite de ancho de banda de GitHub Pages. Implica: conectar repo, build (`npm run build` → `dist`), variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `_redirects` (`/* /index.html 200`), y mover/recrear el DNS (idealmente nameservers a Cloudflare, aprovechando el correo del dominio). Las Redirect URLs de Supabase no cambian. **Disparador: el día que quieras privatizar o antes de empujar tráfico (Product Hunt/ads); hazlo con poco tráfico, el cutover es indoloro.** Alternativa rápida sin migrar: GitHub Pro (~4 USD/mes) para Pages desde repo privado.
- ⬜ **Viralidad por invitaciones** — pulir el flujo de compartir (1 toque, valor en 10 s).
- ⬜ **Comunidades nicho** — pisos compartidos, estudiantes/Erasmus, viajeros, expats (AUD → Australia).
- ⬜ **Contenido corto** (TikTok/Reels): "lo dices y la IA reparte".
- ⬜ **Product Hunt / Hacker News** launch.
- ⬜ **SEO landing** + métricas privacy-friendly (Plausible/Umami).

## Fase 3 — Google Play (~25 USD único)
- ⬜ Empaquetar **TWA** (Bubblewrap / PWABuilder) + `assetlinks.json`.
- ⬜ Cuenta de desarrollador; **20 testers durante 14 días** (prueba cerrada) antes de producción.
- ⬜ Política de privacidad, "Seguridad de los datos", clasificación de contenido, target API.

## Fase 4 — App Store (~99 USD/año)
- ⬜ Empaquetar con **Capacitor** (WKWebView + plugins).
- ⬜ **Sign in with Apple** (obligatorio por ofrecer login Google).
- ⬜ Borrar cuenta in-app (Fase 0), **App Privacy label**, capturas por tamaños, revisión.
- ⚠️ Cuidar guía 4.2 ("minimum functionality"): el push/offline/instalación ayudan.

## Fase 5 — Monetización
- ⬜ **Stripe** (web) para Pro. Definir límites free vs Pro.
- ⚠️ **Reglas de tiendas:** vender bienes digitales *dentro* de la app → comisión 15-30% (IAP). Mantener el pago de Pro **por web/códigos**, no dentro de la app iOS.

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
(código) · sello de versión en el footer.
