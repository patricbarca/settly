import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useT, useLang, setLang } from "../lib/i18n";
import { money } from "../lib/format";
import { Logo } from "./Logo";
import { heroBackground, HeroCover } from "../lib/heroStyle";

type Info = {
  name: string;
  kind: "trip" | "home";
  currency: string;
  owner: string | null;
  members: number;
  first_names: string[];
  expenses: number;
  total: number;
  hero_color?: string | null;
  hero_image?: string | null;
  hero_pos?: { x: number; y: number; z: number } | null;
};

/** Origen de la cuenta: se guarda aquí y se apunta en el perfil al crear la cuenta. */
export const ACQ_KEY = "settlia.acq";
function setAcq(v: "invite" | "invite_cta") {
  try { localStorage.setItem(ACQ_KEY, v); } catch { /* sin almacenamiento: no se mide */ }
}

/** Primera pantalla de quien abre un enlace de invitación sin tener sesión:
 *  qué grupo es, quién lo comparte y qué es Settlia. Pie con "crea tu propio
 *  grupo" para los que solo venían a mirar. */
export function InviteLanding({ token, onJoin, onOwn }: { token: string; onJoin: () => void; onOwn: () => void }) {
  const t = useT();
  const lang = useLang();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);

  useEffect(() => {
    supabase.rpc("invite_landing", { p_token: token }).then(({ data, error }) => {
      setInfo(error || !data ? null : (data as Info));
    });
  }, [token]);

  if (info === undefined) {
    return <div className="min-h-dvh flex items-center justify-center text-muted text-sm">…</div>;
  }
  // Enlace caducado o inválido: al login de siempre, sin bloquear.
  if (info === null) return <Skip onSkip={onJoin} />;

  const shown = info.first_names.slice(0, 5);
  const more = info.members - shown.length;
  // Misma apariencia que la tarjeta del grupo (color o foto de portada).
  const look = { heroColor: info.hero_color ?? undefined, heroImage: info.hero_image ?? undefined, heroImagePos: info.hero_pos ?? undefined };
  const cover = heroBackground(look);
  const join = () => { setAcq("invite"); onJoin(); };
  const own = () => { setAcq("invite_cta"); onOwn(); };

  return (
    <div className="min-h-dvh px-5 pb-10 max-w-md mx-auto flex flex-col" style={{ paddingTop: "calc(env(safe-area-inset-top) + 20px)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={34} />
          <span className="font-brand text-xl font-extrabold">Settlia</span>
        </div>
        <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="glass rounded-full px-3 py-1 text-xs font-semibold">
          {lang === "es" ? "EN" : "ES"}
        </button>
      </div>

      <div className={`${cover ? "relative isolate" : "hero"} rounded-3xl p-5 mt-6 text-white relative overflow-hidden`} style={cover}>
        {cover && <HeroCover g={look} />}
        <p className="text-xs uppercase tracking-wide opacity-80">
          {info.owner ? t("invl.from", { name: info.owner }) : t("invl.fromSomeone")}
        </p>
        <h1 className="font-display text-3xl font-bold mt-1 break-words">{info.name}</h1>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {shown.map((n, i) => (
            <span key={i} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(255,255,255,.18)" }}>{n}</span>
          ))}
          {more > 0 && <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(255,255,255,.18)" }}>+{more}</span>}
        </div>
        {info.expenses > 0 && (
          <p className="text-sm mt-3 opacity-90">
            {t("invl.stats", { n: info.expenses, total: money(info.total, info.currency) })}
          </p>
        )}
      </div>

      <button onClick={join} className="w-full rounded-2xl py-3.5 mt-5 text-base font-semibold text-white" style={{ background: "var(--teal)" }}>
        {t("invl.join", { g: info.name })}
      </button>
      <p className="text-xs text-muted text-center mt-2">{t("invl.free")}</p>

      <div className="glass rounded-3xl p-4 mt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">{t("invl.whatTitle")}</h2>
          <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 text-white shrink-0" style={{ background: "linear-gradient(135deg, var(--indigo), var(--teal))" }}>✨ {t("invl.aiTag")}</span>
        </div>
        <p className="text-sm text-muted mt-1">{t("invl.whatSub")}</p>
        <ul className="mt-3 space-y-3 text-sm">
          {([["✍️", "b1"], ["📸", "b2"], ["🔁", "b3"], ["🔒", "b4"]] as const).map(([icon, k]) => (
            <li key={k} className="flex gap-3">
              <span className="text-lg leading-none mt-0.5">{icon}</span>
              <span><b>{t(`invl.${k}t`)}.</b> {t(`invl.${k}`)}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl p-3 mt-4 text-sm" style={{ background: "color-mix(in srgb, var(--teal) 12%, transparent)" }}>
          <b style={{ color: "var(--teal)" }}>{t("invl.diffTitle")}</b>
          <p className="mt-0.5">{t("invl.diff")}</p>
        </div>
      </div>

      <div className="mt-auto pt-8 text-center">
        <p className="text-sm text-muted">{t(info.kind === "home" ? "invl.ownHome" : "invl.ownTrip")}</p>
        <button onClick={own} className="text-sm font-semibold mt-1" style={{ color: "var(--teal)" }}>
          {t("invl.ownCta")} →
        </button>
        <p className="text-[11px] text-muted mt-4">{t("invl.made")}</p>
      </div>
    </div>
  );
}

function Skip({ onSkip }: { onSkip: () => void }) {
  useEffect(() => { onSkip(); }, [onSkip]);
  return null;
}
