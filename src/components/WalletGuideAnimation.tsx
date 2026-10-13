import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

// Guía ANIMADA de la automatización de Wallet: un iPhone dibujado que recorre
// los pasos de la app Atajos, con un "dedo" que marca dónde tocar. Avanza sola
// (se pausa al tocarla) y se puede mover con los puntos. Son pantallas dibujadas
// a mano imitando iOS, no capturas: Apple cambia los textos entre versiones, por
// eso cada pantalla muestra el texto en el idioma del usuario y el inglés entre
// paréntesis, igual que la guía escrita.

const STEP_MS = 3800;

/** Punto pulsante "toca aquí". */
function Tap() {
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0">
      <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "rgba(15,163,163,0.6)" }} />
      <span className="relative h-4 w-4 rounded-full" style={{ background: "var(--teal)", border: "2px solid #fff" }} />
    </span>
  );
}

function Row({ children, hot, sub }: { children: ReactNode; hot?: boolean; sub?: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 text-[12px] border-b last:border-0"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: hot ? "rgba(15,163,163,0.18)" : undefined }}
    >
      <div className="flex-1 min-w-0">
        <div className="truncate" style={{ color: "#fff" }}>{children}</div>
        {sub && <div className="text-[10px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{sub}</div>}
      </div>
      {hot && <Tap />}
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className="h-4 w-7 rounded-full relative shrink-0" style={{ background: on ? "#34C759" : "rgba(255,255,255,0.25)" }}>
      <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" style={{ left: on ? 14 : 2 }} />
    </span>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="rounded-xl overflow-hidden mx-2" style={{ background: "#1C1C1E" }}>{children}</div>;
}

export function WalletGuideAnimation() {
  const t = useT();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  const screens: { title: string; caption: string; body: ReactNode }[] = [
    {
      title: t("siriAnim.s1Title"),
      caption: t("siri.step1"),
      body: (
        <div className="flex flex-col h-full">
          <div className="flex justify-between items-center px-3 pt-2">
            <span className="text-[15px] font-bold" style={{ color: "#fff" }}>{t("siriAnim.automation")}</span>
            <span className="flex items-center gap-1.5"><span className="text-[18px]" style={{ color: "#0A84FF" }}>＋</span><Tap /></span>
          </div>
          <div className="flex-1" />
          <div className="flex justify-around text-[10px] py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{t("siriAnim.shortcuts")}</span>
            <span className="flex items-center gap-1 font-semibold" style={{ color: "#0A84FF" }}>{t("siriAnim.automation")}</span>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>{t("siriAnim.gallery")}</span>
          </div>
        </div>
      ),
    },
    {
      title: t("siriAnim.s2Title"),
      caption: t("siri.step2"),
      body: (
        <div className="space-y-2 pt-2">
          <Group>
            <Row>{t("siriAnim.time")}</Row>
            <Row>{t("siriAnim.alarm")}</Row>
            <Row>{t("siriAnim.email")}</Row>
            <Row hot sub="When I tap a Wallet card or pass">Wallet</Row>
            <Row>NFC</Row>
          </Group>
        </div>
      ),
    },
    {
      title: t("siriAnim.s3Title"),
      caption: t("siri.step3"),
      body: (
        <div className="space-y-2 pt-2">
          <Group>
            <Row sub="Visa ···· 4321">✓ {t("siriAnim.myCard")}</Row>
          </Group>
          <Group>
            <div className="flex items-center gap-2 px-3 py-2 text-[12px]" style={{ background: "rgba(15,163,163,0.18)", color: "#fff" }}>
              <span className="flex-1">{t("siriAnim.runImmediately")}</span><span style={{ color: "#0A84FF" }}>✓</span><Tap />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-[12px]" style={{ color: "rgba(255,255,255,0.55)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="flex-1">{t("siriAnim.runAfterConfirm")}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-[12px]" style={{ color: "#fff", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="flex-1">{t("siriAnim.notify")}</span><Toggle on={false} />
            </div>
          </Group>
        </div>
      ),
    },
    {
      title: t("siriAnim.s4Title"),
      caption: t("siri.step4"),
      body: (
        <div className="space-y-2 pt-2">
          <Group>
            <div className="px-3 py-2 text-[12px]" style={{ color: "#fff" }}>
              <div className="text-[10px] mb-1" style={{ color: "#BF5AF2" }}>☰ {t("siriAnim.chooseMenu")}</div>
              <div className="rounded-md px-2 py-1 mb-1.5" style={{ background: "rgba(255,255,255,0.08)" }}>{t("siri.menuPrompt")}</div>
              <div className="flex items-center gap-1.5 py-0.5">{t("siri.menuScan")}<Tap /></div>
              <div className="py-0.5">{t("siri.menuNoReceipt")}</div>
            </div>
          </Group>
        </div>
      ),
    },
    {
      title: t("siriAnim.s5Title"),
      caption: t("siri.step5"),
      body: (
        <div className="space-y-2 pt-2 text-[12px]" style={{ color: "#fff" }}>
          <div className="px-3 text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>{t("siri.menuScan")}</div>
          <Group><Row hot sub="Settlia">{t("siriAnim.scanReceipt")}</Row></Group>
          <div className="px-3 text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>{t("siri.menuNoReceipt")}</div>
          <Group><Row hot sub="Settlia">{t("siriAnim.addExpense")}</Row></Group>
        </div>
      ),
    },
    {
      title: t("siriAnim.s6Title"),
      caption: t("siri.step6"),
      body: (
        <div className="space-y-2 pt-2">
          <Group>
            <div className="px-3 py-2 text-[12px]" style={{ color: "#fff" }}>
              <div className="text-[10px] mb-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>Settlia · {t("siriAnim.addExpense")}</div>
              <div className="flex items-center gap-1.5 py-1">
                <span className="w-16 shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>{t("siriAnim.merchant")}</span>
                <span className="rounded-md px-1.5 py-0.5" style={{ background: "#0A84FF" }}>{t("siriAnim.input")} › {t("siriAnim.merchant")}</span>
                <Tap />
              </div>
              <div className="flex items-center gap-1.5 py-1">
                <span className="w-16 shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>{t("siriAnim.amount")}</span>
                <span className="rounded-md px-1.5 py-0.5" style={{ background: "#0A84FF" }}>{t("siriAnim.input")} › {t("siriAnim.amount")}</span>
                <Tap />
              </div>
            </div>
          </Group>
        </div>
      ),
    },
    {
      title: t("siriAnim.s7Title"),
      caption: t("siriAnim.s7Caption"),
      body: (
        <div className="flex flex-col h-full justify-center gap-3 px-2">
          <div className="rounded-xl px-3 py-2 text-[11px]" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>
             Pay · Woolworths · $42.50 ✓
          </div>
          <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: "#2C2C2E", color: "#fff" }}>
            <div className="text-[10px] mb-1" style={{ color: "rgba(255,255,255,0.55)" }}>{t("siriAnim.shortcuts")}</div>
            <div className="font-semibold mb-1">{t("siri.menuPrompt")}</div>
            <div className="flex items-center gap-1.5 py-0.5" style={{ color: "#0A84FF" }}>{t("siri.menuNoReceipt")}<Tap /></div>
          </div>
          <div className="rounded-xl px-3 py-2 text-[11px] flex items-center gap-2" style={{ background: "var(--teal)", color: "#fff" }}>
            <Icon name="check" size={13} /> Settlia · Woolworths · $42.50
          </div>
        </div>
      ),
    },
  ];

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => setI((x) => (x + 1) % screens.length), STEP_MS);
    return () => clearTimeout(id);
  }, [i, paused, screens.length]);

  const s = screens[i];
  return (
    <div className="flex flex-col items-center" onClick={() => setPaused((p) => !p)}>
      {/* iPhone */}
      <div
        className="relative rounded-[34px] p-2 w-[210px]"
        style={{ background: "#0B0B0C", boxShadow: "0 10px 30px rgba(0,0,0,0.35), inset 0 0 0 2px #2a2a2e" }}
      >
        <div className="rounded-[26px] overflow-hidden relative" style={{ background: "#000", height: 330 }}>
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 h-4 w-16 rounded-full z-10" style={{ background: "#0B0B0C" }} />
          <div className="pt-7 px-1 text-[10px] font-semibold text-center" style={{ color: "rgba(255,255,255,0.7)" }}>
            {s.title}
          </div>
          <div key={i} className="anim-up h-[290px]">{s.body}</div>
        </div>
      </div>
      {/* Puntos */}
      <div className="flex gap-1.5 mt-3">
        {screens.map((_, k) => (
          <button
            key={k}
            onClick={(e) => { e.stopPropagation(); setI(k); setPaused(true); }}
            className="h-1.5 rounded-full transition-all"
            style={{ width: k === i ? 18 : 6, background: k === i ? "var(--teal)" : "var(--line)" }}
            aria-label={`${k + 1}`}
          />
        ))}
      </div>
      <div className="text-xs text-center mt-2 min-h-[48px] max-w-xs">
        <b>{i + 1}/{screens.length}.</b> {s.caption}
      </div>
      <div className="text-[10px] text-muted mt-1">{paused ? t("siriAnim.paused") : t("siriAnim.tapToPause")}</div>
    </div>
  );
}
