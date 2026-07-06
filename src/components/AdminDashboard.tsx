import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

type Stats = {
  total_users: number;
  users_7d: number;
  users_30d: number;
  total_groups: number;
  active_groups: number;
  pro_users: number;
  total_redemptions: number;
  push_subs: number;
  recent_users: { email: string; name: string; created_at: string; provider: string }[];
  users_by_month: { month: string; count: number }[];
};

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-muted text-xs">{label}</span>
      <span className="text-2xl font-bold font-mono">{value}</span>
      {sub && <span className="text-muted text-xs">{sub}</span>}
    </div>
  );
}

export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("get_admin_stats").then(({ data, error }) => {
      if (error) { setError(error.message); }
      else { setStats(data as Stats); }
      setLoading(false);
    });
  }, []);

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top)" }}>
      {/* Header */}
      <div className="max-w-2xl mx-auto w-full px-4 pt-4 pb-2 flex items-center gap-3">
        <Logo size={32} />
        <span className="font-display font-bold text-lg flex-1">Admin Dashboard</span>
        <button onClick={onClose} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 pb-8 space-y-6 pt-2">
          {loading && (
            <div className="glass rounded-2xl p-8 text-center text-muted">Cargando...</div>
          )}
          {error && (
            <div className="glass rounded-2xl p-4 text-red-400 text-sm">{error}</div>
          )}
          {stats && (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Usuarios totales" value={stats.total_users} />
                <StatCard label="Usuarios Pro" value={stats.pro_users} sub={`${Math.round(stats.pro_users / Math.max(stats.total_users, 1) * 100)}% del total`} />
                <StatCard label="Nuevos (7 días)" value={stats.users_7d} />
                <StatCard label="Nuevos (30 días)" value={stats.users_30d} />
                <StatCard label="Grupos activos" value={stats.active_groups} sub={`${stats.total_groups} total`} />
                <StatCard label="Códigos canjeados" value={stats.total_redemptions} />
                <StatCard label="Push suscripciones" value={stats.push_subs} />
                <StatCard label="Free" value={stats.total_users - stats.pro_users} sub="sin plan Pro" />
              </div>

              {/* Usuarios por mes */}
              {stats.users_by_month.length > 0 && (
                <div className="glass rounded-2xl p-4 space-y-3">
                  <h3 className="font-semibold text-sm">Registros por mes</h3>
                  {(() => {
                    const max = Math.max(...stats.users_by_month.map(m => m.count), 1);
                    return stats.users_by_month.map(m => (
                      <div key={m.month} className="flex items-center gap-3 text-sm">
                        <span className="text-muted w-16 shrink-0 font-mono text-xs">{m.month}</span>
                        <div className="flex-1 rounded-full overflow-hidden h-2" style={{ background: "var(--glass-border)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(m.count / max) * 100}%`, background: "var(--teal)" }}
                          />
                        </div>
                        <span className="font-mono font-bold w-6 text-right">{m.count}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* Últimos usuarios */}
              <div className="glass rounded-2xl p-4 space-y-2">
                <h3 className="font-semibold text-sm mb-3">Últimos registros</h3>
                {stats.recent_users.map((u, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm py-1 border-b border-white/5 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{u.name || "—"}</div>
                      <div className="text-muted text-xs truncate">{u.email}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted">{fmt(u.created_at)}</div>
                      <div className="text-xs" style={{ color: u.provider === "google" ? "var(--teal)" : "var(--muted)" }}>
                        {u.provider || "email"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Churn note */}
              <div className="glass rounded-2xl p-4 text-xs text-muted space-y-1">
                <p className="font-semibold text-sm text-inherit mb-1">Métricas pendientes</p>
                <p>• <b>Churn</b>: requiere campo <code>last_seen_at</code> en profiles (aún no implementado).</p>
                <p>• <b>Actividad</b>: gastos/grupo/usuario — requiere tabla de eventos server-side.</p>
                <p>• <b>Conversión</b>: visita→registro se ve en Plausible (settlia.app + app.settlia.app).</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
