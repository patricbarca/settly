import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Estado de los servicios de Settlia (solo admin). Lo escribe la Edge Function
// `service-status` cada 15 min; aquí se lee con get_service_status().

type Status = "up" | "degraded" | "down" | "unknown";
type Result = {
  id: string;
  name: string;
  group: string;
  status: Status;
  detail: string;
  ms?: number;
  page?: string;
  incidents?: { name: string; status: string; url: string }[];
};
type Data = {
  latest: { checked_at: string; results: Result[] } | null;
  history: { t: string; s: Record<string, Status> }[];
};

const COLOR: Record<Status, string> = {
  up: "#12a37a",
  degraded: "var(--amber)",
  down: "var(--coral)",
  unknown: "var(--muted)",
};
const LABEL: Record<Status, string> = { up: "Funciona", degraded: "Con problemas", down: "Caído", unknown: "Sin datos" };
const GROUPS: [string, string][] = [
  ["Settlia", "Settlia"],
  ["Funciones", "Funciones de Supabase"],
  ["Proveedores", "Proveedores (sus páginas de estado)"],
];
const SLOTS = 96; // 24 h a 15 min

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
}

function Row({ r, history }: { r: Result; history: Data["history"] }) {
  const h = history.map((p) => ({ t: p.t, s: p.s[r.id] ?? ("unknown" as Status) })).slice(-SLOTS);
  const known = h.filter((p) => p.s !== "unknown");
  const pct = known.length ? Math.round((known.filter((p) => p.s === "up").length / known.length) * 1000) / 10 : null;
  return (
    <div className="py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLOR[r.status] }} />
        <span className="font-medium text-sm flex-1 min-w-0 truncate">
          {r.page ? (
            <a href={r.page} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {r.name}
            </a>
          ) : (
            r.name
          )}
        </span>
        <span className="text-xs shrink-0" style={{ color: COLOR[r.status] }}>
          {LABEL[r.status]}
        </span>
      </div>
      <div className="text-muted text-xs mt-0.5 ml-5 break-words">
        {r.detail}
        {r.ms != null && ` · ${r.ms} ms`}
      </div>
      {r.incidents?.map((i, k) => (
        <div key={k} className="text-xs mt-1 ml-5">
          ⚠{" "}
          <a href={i.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--amber)" }}>
            {i.name}
          </a>{" "}
          <span className="text-muted">({i.status})</span>
        </div>
      ))}
      <div className="flex gap-px mt-2 ml-5 h-4">
        {Array.from({ length: SLOTS - h.length }).map((_, k) => (
          <span key={`e${k}`} className="flex-1 rounded-[1px]" style={{ background: "var(--glass-border)" }} />
        ))}
        {h.map((p, k) => (
          <span
            key={k}
            className="flex-1 rounded-[1px]"
            title={`${new Date(p.t).toLocaleString()} · ${LABEL[p.s]}`}
            style={{ background: COLOR[p.s], opacity: p.s === "up" ? 0.7 : p.s === "unknown" ? 0.3 : 1 }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted mt-0.5 ml-5">
        <span>24 h</span>
        <span>{pct != null ? `${pct} % funcionando` : ""}</span>
        <span>ahora</span>
      </div>
    </div>
  );
}

export function ServiceStatusView() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      supabase.rpc("get_service_status", { p_hours: 24 }).then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(error.message);
        else {
          setError(null);
          setData(data as Data);
        }
      });
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (error) return <div className="glass rounded-2xl p-4 text-red-400 text-sm">{error}</div>;
  if (!data) return <div className="glass rounded-2xl p-8 text-center text-muted">Cargando...</div>;
  if (!data.latest)
    return (
      <div className="glass rounded-2xl p-6 text-center text-muted text-sm">
        Todavía no hay revisiones. La primera llega en menos de 15 minutos.
      </div>
    );

  const rs = data.latest.results;
  const stale = Date.now() - new Date(data.latest.checked_at).getTime() > 45 * 60000;
  const worst: Status = stale
    ? "unknown"
    : rs.some((r) => r.status === "down")
      ? "down"
      : rs.some((r) => r.status === "degraded")
        ? "degraded"
        : "up";
  const bad = rs.filter((r) => r.status === "down" || r.status === "degraded").length;
  const title = stale
    ? "Las revisiones están paradas"
    : { up: "Todo funciona", degraded: "Hay servicios con problemas", down: "Hay servicios caídos", unknown: "" }[worst];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-white" style={{ background: COLOR[worst] }}>
        <div className="font-semibold">{title}</div>
        <div className="text-xs opacity-90 mt-0.5">
          {bad ? `${bad} con incidencias · ` : ""}
          {rs.length} servicios · última revisión {ago(data.latest.checked_at)}
        </div>
      </div>
      {GROUPS.map(([g, label]) => {
        const items = rs.filter((r) => r.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="glass rounded-2xl px-4 py-1">
            <h3 className="font-semibold text-sm pt-3 pb-1">{label}</h3>
            {items.map((r) => (
              <Row key={r.id} r={r} history={data.history} />
            ))}
          </div>
        );
      })}
      <p className="text-muted text-xs px-1">
        Se revisa cada 15 minutos desde Supabase. El consumo de la cuota de Supabase se ve en{" "}
        <a
          href="https://supabase.com/dashboard/org/_/usage"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          su página de uso
        </a>
        .
      </p>
    </div>
  );
}
