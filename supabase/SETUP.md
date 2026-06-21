# Settly — Guía de configuración (Auth, Invite links, IA)

Esta guía deja Settly funcionando con **login Google + crear cuenta**, **invite
links** y **escaneo de tickets + voz a texto**. El código ya está hecho; lo que
falta es **configuración de paneles** (Supabase, Google Cloud) y desplegar las
Edge Functions — cosas que requieren tus cuentas.

Sustituye en toda la guía:
- `TU-PROYECTO` → la referencia de tu proyecto Supabase (la parte de
  `https://TU-PROYECTO.supabase.co`).
- URL del sitio: `https://patricbarca.github.io/settly/`

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
- *Site URL*: `https://patricbarca.github.io/settly/`
- *Redirect URLs*: añade `https://patricbarca.github.io/settly/`
  (y `http://localhost:5173/settly/` si pruebas en local)

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
     - `https://patricbarca.github.io`
     - `https://TU-PROYECTO.supabase.co`
   - *Authorized redirect URIs*:
     - `https://TU-PROYECTO.supabase.co/auth/v1/callback`
   - Crea → copia **Client ID** y **Client secret**.

### 2c. Google — Supabase
**Authentication → Providers → Google**: ON, pega el **Client ID** y el
**Client secret** del paso anterior. Guarda.

Listo: el botón "Continuar con Google" (`signInGoogle`) ya funciona.

> Nota: el `redirectTo` de la app es `window.location.origin + BASE_URL`
> (= `https://patricbarca.github.io/settly/`), por eso debe estar en *Redirect URLs*.

---

## 3. IA: interpretar gasto + escanear ticket

La IA hace dos cosas, ambas con la **misma clave** (`ANTHROPIC_API_KEY`), que
vive SOLO en el servidor (nunca en el cliente):

- **`parse-expense`** — convierte texto (escrito o dictado por voz) **o** la foto
  de un ticket en un gasto estructurado y categorizado, y rellena el formulario
  para que solo confirmes. Es lo que usa el botón **Interpretar** y el botón
  **Escanear**.
- **`scan-receipt`** — (legado) lectura de ticket línea a línea para el reparto
  por artículo. Opcional; `parse-expense` cubre el flujo principal.

```bash
# requiere la CLI de Supabase y haber hecho: supabase link --project-ref TU-PROYECTO
supabase functions deploy parse-expense
supabase functions deploy scan-receipt   # opcional (reparto por artículo)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Opcional (cambiar de modelo sin tocar código; Claude Haiku 4.5 por defecto,
~0,4 céntimos por llamada):
```bash
supabase secrets set AI_MODEL=claude-haiku-4-5          # texto/imagen (parse-expense)
supabase secrets set AI_VISION_MODEL=claude-haiku-4-5   # scan-receipt (legado)
```

Mientras `parse-expense` **no** esté desplegada: **Interpretar** cae al parser
local (gratis, sin IA) y **Escanear** abre el formulario manual vacío — la app
nunca se bloquea.

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

## 5. Comprobación rápida

- [ ] Crear cuenta por email (recibes código, entras).
- [ ] Entrar con Google.
- [ ] Crear grupo → **Compartir / invitar** → abrir el link en otra sesión y unirse.
- [ ] Añadir gasto → **Escanear ticket** → lee la foto (tras desplegar `scan-receipt`).
- [ ] Añadir gasto → **micrófono** → dicta y aparece el texto.
- [ ] **Mejorar a Pro** → código `SETTLYBETA` → Pro activo.

---

## Costes orientativos (fase beta)
- Escaneo (Claude Haiku 4.5): ~$0.004/escaneo → 1.000 escaneos ≈ $4.
- Voz (Whisper whisper-1): ~$0.006/min → una frase de 3 s ≈ $0.0003.
- Auth, invite links y planes/códigos: incluidos en Supabase (sin coste extra).
