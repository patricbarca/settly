// Límite de llamadas por usuario en el SERVIDOR (RPC `call_guard`,
// migrate_v37). Se llama con el JWT del usuario, así el contador es suyo.
// Devuelve true si puede seguir. Si el propio control falla (red, RPC), no
// bloquea al usuario: solo se registra (igual que aiGuard en scan-receipt).
export async function callGuard(req: Request, kind: "fx" | "push"): Promise<boolean> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anon) return true;
    const r = await fetch(`${url}/rest/v1/rpc/call_guard`, {
      method: "POST",
      headers: {
        apikey: anon,
        authorization: req.headers.get("authorization") ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_kind: kind }),
    });
    if (!r.ok) {
      console.error("call_guard http", r.status);
      return true;
    }
    return (await r.json()) !== false;
  } catch (e) {
    console.error("call_guard", e);
    return true;
  }
}

// Usuario del JWT (null si no hay sesión válida: la anon key no cuenta).
export async function userIdFrom(req: Request): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const auth = req.headers.get("authorization") ?? "";
  if (!url || !anon || !auth.toLowerCase().startsWith("bearer ")) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, authorization: auth },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return typeof u?.id === "string" ? u.id : null;
  } catch (_) {
    return null;
  }
}
