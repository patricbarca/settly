import { currencyViews } from "../lib/split";
import { resolveToCode } from "../lib/currencies";
import { useState, useEffect } from "react";
import { useQuickAdd } from "../lib/quickAdd";
import type { Group } from "../lib/types";
import { setActiveGroup, archiveGroup, processRecurring } from "../lib/store";
import { createInviteLink } from "../lib/invite";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Hero } from "./Hero";
import { Members } from "./Members";
import { AddExpense } from "./AddExpense";
import { Balances } from "./Balances";
import { ReadyToSettle } from "./ReadyToSettle";
import { Achievements } from "./Achievements";
import { CategoryChart } from "./CategoryChart";
import { ExpenseList } from "./ExpenseList";
import { Analytics } from "./Analytics";
import { GroupSettings } from "./GroupSettings";
import { UsersModal } from "./UsersModal";
import { ReportModal } from "./ReportModal";
import { Paywall } from "./Paywall";
import { ShareLinkModal } from "./ShareLinkModal";
import { PayMethodReminder } from "./PayMethodReminder";
import { isPro } from "../lib/plan";
import { haptic } from "../lib/haptics";

type Tab = "expenses" | "balances" | "stats" | "achievements";

export function GroupView({ group }: { group: Group }) {
  const t = useT();
  const [showSettings, setShowSettings] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [tab, setTab] = useState<Tab>("expenses");
  // Un gasto de Siri / Atajos / Wallet para este grupo: el formulario vive en
  // la pestana Gastos, asi que hay que estar ahi para que lo recoja.
  const quick = useQuickAdd();
  useEffect(() => {
    if (quick?.groupId === group.id) setTab("expenses");
  }, [quick, group.id]);
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  // Cabecera compacta estilo iOS: al bajar más allá del hero, la barra de
  // arriba pasa a cristal y muestra el nombre del grupo (el "título grande"
  // del hero se sustituye por uno pequeño).
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    // Histéresis: se pliega al bajar 60 px y se vuelve a abrir al volver arriba
    // (umbrales distintos para que no parpadee al plegarse y cambiar la altura).
    const onScroll = () => setCompact((c) => (c ? window.scrollY > 8 : window.scrollY > 60));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function openReport() {
    if (isPro()) setShowReport(true);
    else setPaywall(true);
  }

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [group.id]);
  useEffect(() => { processRecurring(group.id); }, [group.id]);

  async function share() {
    setInviteError(false);
    let link: string;
    try {
      link = await createInviteLink(group);
    } catch {
      // El fallo AQUÍ sí es "no se pudo crear el link" (red / sin sesión).
      setInviteError(true);
      setTimeout(() => setInviteError(false), 2500);
      return;
    }
    // Siempre la ventana propia (link visible + Copiar + Compartir): el menú
    // de iOS solo se abre si la persona toca "Compartir" dentro de ella.
    setShareLink(link);
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "expenses", label: t("tab.expenses") },
    { id: "balances", label: t("tab.balances") },
    { id: "stats", label: t("tab.stats") },
    { id: "achievements", label: t("tab.achievements") },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      {/* Barra de botones: fija arriba con el fondo de la página (como en Home). */}
      <div
        className="sticky z-30 -mx-4 px-4 flex items-center justify-between gap-2 home-sticky-bg"
        style={{ top: "env(safe-area-inset-top)", height: "var(--home-top)" }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <div className="glass rounded-2xl p-1">
            <Logo size={24} />
          </div>
          <button onClick={() => setActiveGroup(null)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("group.back")}>
            <Icon name="back" size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => setShowUsers(true)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("users.title")}>
            <Icon name="users" size={15} />
          </button>
          <button onClick={openReport} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("report.title")}>
            <Icon name="doc" size={15} />
          </button>
          <button onClick={() => setShowSettings(true)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("settings.title")}>
            <Icon name="settings" size={15} />
          </button>
          <button onClick={() => archiveGroup(group.id, true)} className="glass rounded-full h-8 w-8 flex items-center justify-center text-muted hover-lift" title={t("group.archive")}>
            <Icon name="archive" size={15} />
          </button>
        </div>
      </div>

      <PayMethodReminder group={group} />

      {/* La tarjeta del grupo se queda pegada bajo la barra y, al bajar, se
          pliega a una franja con solo el nombre (vuelve a abrirse arriba). */}
      <div className="sticky z-20 -mx-4 px-4 pb-2 home-sticky-bg" style={{ top: "calc(env(safe-area-inset-top) + var(--home-top))" }}>
        <Hero group={group} compact={compact} onShare={share} shareState={inviteError ? "error" : copied ? "copied" : undefined} />
      </div>

      <div className="mt-4">
        <Members group={group} />
      </div>

      {/* Tabs */}
      <div className="seg my-4" role="tablist">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            aria-selected={tab === tb.id}
            onClick={() => {
              if (tab !== tb.id) haptic("selection");
              setTab(tb.id);
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "expenses" && (
        // pb-20: hueco para que el botón + flotante no tape el último gasto.
        <div className="space-y-4 anim-up pb-20">
          <AddExpense group={group} />
          <ExpenseList group={group} />
        </div>
      )}
      {tab === "balances" && (
        <div className="space-y-4 anim-up">
          <Balances group={group} />
          {group.kind !== "home" && <ReadyToSettle group={group} />}
        </div>
      )}
      {tab === "stats" && (
        <div className="space-y-4 anim-up">
          {/* Saldos por moneda: unas estadísticas por moneda (sin mezclar). */}
          {currencyViews(group).map((v, i, all) => (
            <div key={v.currency} className="space-y-4">
              {all.length > 1 && (
                <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: "var(--teal)", color: "#fff" }}>
                  {resolveToCode(v.currency)}
                </span>
              )}
              <CategoryChart group={v} />
              <Analytics group={v} />
            </div>
          ))}
        </div>
      )}
      {tab === "achievements" && (
        <div className="space-y-4 anim-up">
          <Achievements group={group} />
        </div>
      )}

      {showUsers && <UsersModal group={group} onClose={() => setShowUsers(false)} />}
      {showSettings && <GroupSettings group={group} onClose={() => setShowSettings(false)} />}
      {showReport && <ReportModal group={group} onClose={() => setShowReport(false)} />}
      {paywall && <Paywall onClose={() => setPaywall(false)} reason={t("report.proReason")} />}
      {shareLink && <ShareLinkModal link={shareLink} title={group.name} onClose={() => setShareLink(null)} />}

    </div>
  );
}
