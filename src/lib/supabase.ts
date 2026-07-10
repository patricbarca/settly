import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    auth: {
      // En la app nativa usamos IMPLICIT flow: el login OAuth vuelve por el deep
      // link (app.settlia.pwa://auth/callback) con los tokens en el fragmento
      // (#access_token=...&refresh_token=...) que aplicamos con setSession (ver
      // auth.ts). PKCE fallaba con "invalid flow state, no valid flow state
      // found" porque el code_verifier no sobrevivía el ida y vuelta a Safari.
      // En web seguimos con PKCE, que ahí funciona bien.
      flowType: Capacitor.isNativePlatform() ? "implicit" : "pkce",
    },
  }
);
