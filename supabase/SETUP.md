# Settly — Guía de configuración (Auth, Invite links, IA)

Esta guía deja Settly funcionando con **login Google + crear cuenta**, **invite
links** y **escaneo de tickets + voz a texto**. El código ya está hecho; lo que
falta es **configuración de paneles** (Supabase, Google Cloud) y desplegar las
Edge Functions — cosas que requieren tus cuentas.

Sustituye en toda la guía:
- `TU-PROYECTO` → la referencia de tu proyecto Supabase (la parte de
  `https://TU-PROYECTO.supabase.co`).
- URL del sitio: `https://app.settlia.app/`

---

## 1. SQL (una vez)

En **Supabase → SQL Editor → New query**, ejecuta en orden si no lo has hecho:
1. `supabase/schema.sql`
2. `supabase/migrate_v2.sql`
3. `supabase/migrate_v3_plans.sql`  (planes + códigos de acceso)

Con esto **los invite links ya funcionan** (tabla `invite_links` + políticas) —
no requieren nada más.

---

## 2. Login con Google + crear cuenta

### 2a. Email (crear cuenta) — Supabase
**Authentication → Providers → Email**
- *Enable Email provider*: ON
- *Confirm email*: ON (Settly usa **OTP por código**, no magic link)
- *Secure email change*: ON
- OTP expiry: 3600

**Authentication → URL Configuration**
- *Site URL*: `https://app.settlia.app/`
- *Redirect URLs*: añade `https://app.settlia.app/`
  (y `http://localhost:5174/` si pruebas en local)

Con esto, "crear cuenta" ya funciona: el usuario mete email → recibe un código →
lo introduce → cuenta creada (`signInEmail`/`verifyOtp` en `src/lib/auth.ts`).

### 2b. Google — Google Cloud Console
1. **console.cloud.google.com** → crea/selecciona un proyecto.
2. **APIs & Services → OAuth consent screen**: tipo *External*, rellena nombre
   de la app, email de soporte y tu email de contacto. Publica (o añade tu email
   como *test user* mientras está en pruebas).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - *Authorized JavaScript origins*:
     - `https://app.settlia.app`
     - `https://TU-PROYECTO.supabase.co`
   - *Authorized redirect URIs*:
     - `https://TU-PROYECTO.supabase.co/auth/v1/callback`
   - Crea → copia **Client ID** y **Client secret**.

### 2c. Google — Supabase
**Authentication → Providers → Google**: ON, pega el **Client ID** y el
**Client secret** del paso anterior. Guarda.

Listo: el botón "Continuar con Google" (`signInGoogle`) ya funciona.

> Nota: el `redirectTo` de la app es `window.location.origin + BASE_URL` (BASE_URL = `/`)
> (= `https://app.settlia.app/`), por eso debe estar en *Redirect URLs*.

---

## 3. Escaneo de tickets (IA de visión)

Necesita un backend con la clave (no puede ir en el cliente). Usa la Edge
Function `scan-receipt`, **en Groq** (modelo `meta-llama/llama-4-scout-17b-16e-instruct`
por defecto, ~0,025 céntimos/escaneo). **Reutiliza la misma `STT_API_KEY`** que
`transcribe`/`parse-expense` — no necesita ninguna clave nueva.

```bash
# requiere la CLI de Supabase y haber hecho: supabase link --project-ref TU-PROYECTO
supabase functions deploy scan-receipt
# STT_API_KEY ya debería estar configurada (la usan transcribe y parse-expense).
# Si no lo está: supabase secrets set STT_API_KEY=<clave Groq>
```

Opcional (cambiar de modelo/proveedor sin tocar código):
```bash
supabase secrets set AI_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
# o apuntar a otro proveedor de visión:
supabase secrets set AI_VISION_API_URL=...  AI_VISION_API_KEY=...
```

Mientras no esté desplegada, el escaneo muestra un error real (ya no cae a un
demo) y deja la fila en blanco para añadir a mano.

---

## 4. Voz a texto en iPhone (STT en servidor)

En Android/escritorio la voz usa la API del navegador (gratis, sin nada que
configurar). Para iPhone/Safari se usa la Edge Function `transcribe` (Whisper).

```bash
supabase functions deploy transcribe
supabase secrets set STT_API_KEY=sk-...          # clave OpenAI (Whisper)
```

Opcional — usar Groq (más barato/rápido, API compatible):
```bash
supabase secrets set STT_API_URL=https://api.groq.com/openai/v1/audio/transcriptions
supabase secrets set STT_MODEL=whisper-large-v3-turbo
```

Mientras no esté desplegada, en iPhone el dictado simplemente no transcribe
(sin error visible); en Android/escritorio funciona igual.

---

## 4b. Web Push, recordatorios diarios y borrar cuenta (Fase 2)

```bash
# 1) Web Push
#    SQL Editor: ejecuta supabase/push_subscriptions.sql  (incluye columna lang)
supabase functions deploy send-push
supabase secrets set VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  VAPID_SUBJECT=mailto:hola@settlia.app
#    (genera el par con: npx web-push generate-vapid-keys; la pública ya está en src/lib/push.ts)

# 2) Recordatorios diarios (requiere lo anterior)
supabase functions deploy daily-reminders --no-verify-jwt
supabase secrets set CRON_SECRET=<algo-largo-y-secreto>
#    SQL Editor: supabase/cron_daily_reminders.sql  (rellena <PROJECT_REF> y <CRON_SECRET>; cron 0 23 * * * = ~9-10am Sídney)

# 3) Borrar cuenta (RGPD + requisito de tiendas)
supabase functions deploy delete-account

# 4) Re-deploy de parse-expense (para "por persona" forzado + few-shot)
supabase functions deploy parse-expense
```

> iOS: el push solo llega si el usuario instaló la PWA (16.4+) y aceptó
> notificaciones (toggle en Cuenta). Los mensajes de recordatorio son bilingües
> (se localizan con `push_subscriptions.lang`).

---

## 5. Comprobación rápida

- [ ] Crear cuenta por email (recibes código, entras).
- [ ] Entrar con Google.
- [ ] Crear grupo → **Compartir / invitar** → abrir el link en otra sesión y unirse.
- [ ] Añadir gasto → **Escanear ticket** → lee la foto (tras desplegar `scan-receipt`).
- [ ] Añadir gasto → **micrófono** → dicta y aparece el texto.
- [ ] **Mejorar a Pro** → código `SETTLYBETA` → Pro activo.

---

## Costes orientativos (fase beta)
- Escaneo (Groq Llama 4 Scout): ~$0.00025/escaneo → 1.000 escaneos ≈ $0.25.
- Texto→gasto (Groq llama-3.1-8b-instant): ~$0.00002/parseo.
- Voz (Groq whisper-large-v3-turbo): ~$0.003/min → una frase de 3 s ≈ $0.00015.
- Auth, invite links y planes/códigos: incluidos en Supabase (sin coste extra).
