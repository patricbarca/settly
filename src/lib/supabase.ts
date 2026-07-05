import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  // PKCE: en la app nativa (Capacitor) el login OAuth vuelve por un deep link
  // (app.settlia.pwa://auth/callback) que canjeamos manualmente con
  // exchangeCodeForSession (ver signInGoogle/signInApple en auth.ts).
  { auth: { flowType: "pkce" } }
);
