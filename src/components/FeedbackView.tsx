import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Feedback de los usuarios (solo admin), vía get_admin_feedback().

type Item = {
  id: string;
  type: "rating" | "bug";
  rating: number | null;
  message: string | null;
  created_at: string;
  name: string;
  email: string | null;
  lang: string | null;
  device: string;
  version: string | null;
};
type Data = {
  total: number;
  ratings: number;
  bugs: number;
  avg_rating: number | null;
  last_30d: number;
  with_text: number;
  by_stars: Record<string, number>;
  latest: Item[];
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "2-digit" });

function Stars({ n }: { n: number }) {
  return (
    <span style={{ color: "var(--amber)" }} aria-label={`${n} de 5`}>
      {"★".repeat(n)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-muted text-xs">{label}</span>
      <span className="text-2xl font-bold font-mono">{value}</span>
      {sub && <span className="text-muted text-xs">{sub}</span>}
    </div>
  );
}

export function FeedbackView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(5);
  const [onlyText, setOnlyText] = useState(false);
  // null = todas; 1–5 = estrellas; "bug" = reportes de bug.
  const [stars, setStars] = useState<number | "bug" | null>(null);
  const pick = (v: number | "bug" | null) => {
    setStars(v);
    if (v != null) setLimit(200); // para filtrar hacen falta todas
  };

  useEffect(() => {
    supabase.rpc("get_admin_feedback", { p_limit: limit }).then(({ data, error }) => {
      if (error) setError(error.message);
      else setData(data as Data);
    });
  }, [limit]);

  if (error) return <div className="glass rounded-2xl p-4 text-red-400 text-sm">{error}</div>;
  if (!data) return <div className="glass rounded-2xl p-8 text-center text-muted">Cargando...</div>;

  const maxStars = Math.max(1, ...Object.values(data.by_stars));
  const filtering = stars != null || onlyText;
  const list = data.latest
    .filter((f) => (stars === "bug" ? f.type === "bug" : stars != null ? f.rating === stars : true))
    .filter((f) => (onlyText ? !!f.message?.trim() : true))
    .slice(0, limit === 5 && !filtering ? 5 : undefined);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card
          label="Valoración media"
          value={data.avg_rating != null ? Number(data.avg_rating).toFixed(1) : "—"}
          sub={`${data.ratings} valoraciones`}
        />
        <Card label="Bugs reportados" value={data.bugs} />
        <Card label="Últimos 30 días" value={data.last_30d} />
        <Card label="Con comentario" value={data.with_text} sub={`de ${data.total}`} />
      </div>

      {data.ratings > 0 && (
        <div className="glass rounded-2xl p-4 space-y-2">
          <h3 className="font-semibold text-sm mb-1">Reparto de estrellas</h3>
          {[5, 4, 3, 2, 1].map((s) => {
            const c = data.by_stars[String(s)] ?? 0;
            return (
              <button
                key={s}
                onClick={() => pick(stars === s ? null : s)}
                className="w-full flex items-center gap-3 text-sm rounded-lg -mx-1 px-1"
                style={{ background: stars === s ? "var(--glass-border)" : undefined }}
              >
                <span className="w-8 shrink-0 font-mono text-xs text-muted">{s} ★</span>
                <div className="flex-1 rounded-full overflow-hidden h-2" style={{ background: "var(--glass-border)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(c / maxStars) * 100}%`, background: "var(--amber)" }} />
                </div>
                <span className="font-mono font-bold w-6 text-right">{c}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-semibold text-sm flex-1">
            {filtering ? `${list.length} resultado${list.length === 1 ? "" : "s"}` : limit === 5 ? "Últimas 5" : "Todas"}
          </h3>
          <label className="text-xs text-muted flex items-center gap-1.5">
            <input type="checkbox" checked={onlyText} onChange={(e) => { setOnlyText(e.target.checked); if (e.target.checked) setLimit(200); }} />
            Solo con comentario
          </label>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
          {([null, 5, 4, 3, 2, 1, "bug"] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => pick(v)}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
              style={
                stars === v
                  ? { background: "var(--teal)", color: "#fff" }
                  : { background: "var(--glass-border)", color: "var(--muted)" }
              }
            >
              {v == null ? "Todas" : v === "bug" ? `Bugs (${data.bugs})` : `${v} ★ (${data.by_stars[String(v)] ?? 0})`}
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="text-muted text-sm py-2">Nada que mostrar.</p>}
        {list.map((f) => (
          <div key={f.id} className="py-3 border-b border-white/5 last:border-0">
            <div className="flex items-center gap-2 text-sm">
              {f.type === "bug" ? (
                <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "var(--coral)", color: "#fff" }}>
                  Bug
                </span>
              ) : (
                f.rating != null && <Stars n={f.rating} />
              )}
              <span className="font-medium truncate flex-1 min-w-0">{f.name || f.email || "—"}</span>
              <span className="text-xs text-muted shrink-0">{fmt(f.created_at)}</span>
            </div>
            <p className={`text-sm mt-1 whitespace-pre-wrap break-words ${f.message?.trim() ? "" : "text-muted italic"}`}>
              {f.message?.trim() || "Sin comentario"}
            </p>
            <div className="text-[11px] text-muted mt-1 truncate">
              {[f.device, f.lang?.toUpperCase(), f.email, f.version].filter(Boolean).join(" · ")}
            </div>
          </div>
        ))}
        {limit === 5 && !filtering && data.total > 5 && (
          <button onClick={() => setLimit(200)} className="w-full text-sm font-semibold pt-3" style={{ color: "var(--teal)" }}>
            Ver todas ({data.total})
          </button>
        )}
      </div>
    </div>
  );
}
