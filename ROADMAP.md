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
- ⬜ **Deploy `delete-account`** — borrar cuenta (requisito de App Store/Play + RGPD). Código listo y cableado (`auth.deleteAccount()` + botón en `AccountModal`); solo falta `supabase functions deploy delete-account`. Sin secretos nuevos (usa `SUPABASE_SERVICE_ROLE_KEY`).
- ⬜ **Correo de dominio** (`hello@settlia.app`) — crear el buzón/redirección en GoDaddy. Las páginas legales (`privacy.html`/`terms.html`) y el `VAPID_SUBJECT` por defecto ya apuntan a esa dirección; nada que cambiar en código. Opcional: fijar el secret `VAPID_SUBJECT=mailto:hello@settlia.app` explícitamente.

## Fase 1 — Producto (UX / robustez)
- ⬜ **Recibos en Supabase Storage** (evidencia) — bucket privado + ruta con `groupId` + URL firmada; subir comprobantes de pago y tickets escaneados. Migrar los `proof` base64 viejos.
- ✅ **Recurrentes → eventos** — `processRecurring` registra cada pasada en Actividad + Notificaciones + push (`recurring_generated`).
- ⬜ **Recurrentes por servidor** (opcional) — cron que materialice las ocurrencias aunque nadie abra el grupo.
- ⬜ **Parser avanzado** — splits desiguales / porcentajes; glosario por grupo (apodos, comercios); pregunta de confirmación solo si hay ambigüedad.
- ⬜ **Multi-moneda** en las pills de balance global (hoy asume una sola).

## Fase 2 — Lanzamiento web (growth)
- ⬜ **Migrar hosting a Cloudflare Pages + privatizar repos** — pasar `settly` y `settly-landing` a Cloudflare Pages (conectado al mismo repo de GitHub; el `git push` no cambia) para poder **poner los repos en privado gratis** y quitar el límite de ancho de banda de GitHub Pages. Implica: conectar repo, build (`npm run build` → `dist`), variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, `_redirects` (`/* /index.html 200`), y mover/recrear el DNS (idealmente nameservers a Cloudflare, aprovechando el correo del dominio). Las Redirect URLs de Supabase no cambian. **Disparador: el día que quieras privatizar o antes de empujar tráfico (Product Hunt/ads); hazlo con poco tráfico, el cutover es indoloro.** Alternativa rápida sin migrar: GitHub Pro (~4 USD/mes) para Pages desde repo privado.
- ⬜ **Viralidad por invitaciones** — pulir el flujo de compartir (1 toque, valor en 10 s).
- ⬜ **Comunidades nicho** — pisos compartidos, estudiantes/Erasmus, viajeros, expats (AUD → Australia).
- ⬜ **Contenido corto** (TikTok/Reels): "lo dices y la IA reparte".
- ⬜ **Product Hunt / Hacker News** launch.
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
(código) · sello de versión en el footer.
