import { useState, useRef } from "react";
import { useGroups, useTrashedGroups, setActiveGroup, archiveGroup, recoverGroup, purgeGroup } from "../lib/store";
import { computeSettle, shareFor } from "../lib/split";
import { groupSettleScore } from "../lib/gamification";
import { money, personColor, memberInitials } from "../lib/format";
import { useT } from "../lib/i18n";
import { usePlan, FREE_GROUP_LIMIT } from "../lib/plan";
import { TrialBanner } from "./TrialBanner";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { SettleRing } from "./SettleRing";
import { CreateGroupModal } from "./CreateGroupModal";
import { ContactsView } from "./ContactsView";
import { InstallButton } from "./InstallButton";
import { Paywall } from "./Paywall";
import type { Group } from "../lib/types";

export type HomeTab = "groups" | "contacts";

export function Home({ tab }: { tab: HomeTab }) {
  const t = useT();
  const groups = useGroups();
  const plan = usePlan();
  const [creating, setCreating] = useState(false);
  const [showArch, setShowArch] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const trashed = useTrashedGroups();
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);

  const active = groups.filter((g) => !g.archived);
  const archived = groups.filter((g) => g.archived);

  // Plan gratis: máx. 3 grupos activos. Al intentar crear el 4º → Paywall.
  function startCreate() {
    if (plan === "free" && active.length >= FREE_GROUP_LIMIT) {
      setPaywallReason(t("paywall.groupLimit", { n: String(FREE_GROUP_LIMIT) }));
      setShowPaywall(true);
    } else {
      setCreating(true);
    }
  }
  function openUpgrade() {
    setPaywallReason(undefined);
    setShowPaywall(true);
  }

  // Pestaña Amigos: pantalla propia con cabecera fija (igual que Actividad),
  // en vez de scrollear junto con el resto del contenido de Grupos.
  if (tab === "contacts") {
    return (
      <div
        className="fixed inset-0 z-30 flex flex-col anim-up"
        style={{ background: "var(--bg)", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-2xl mx-auto w-full px-4 pt-5 flex-1 flex flex-col min-h-0">
          <h2 className="font-display text-2xl font-bold mb-4 shrink-0">{t("nav.friends")}</h2>
          <div
            className="flex-1 overflow-y-auto"
            style={{ paddingBottom: "calc(var(--bottomnav-h) + env(safe-area-inset-bottom) + 24px)" }}
          >
            <ContactsView />
          </div>
        </div>
      </div>
    );
  }

  const hasGroup = active.length > 0;
  const hasExpense = active.some((g) => g.expenses.length > 0);
  const hasSettlement = active.some((g) => (g.settlements ?? []).some((s) => s.status === "confirmed"));
  const allDone = hasGroup && hasExpense && hasSettlement;

  // Balance global de todos los grupos activos. Asume una sola moneda (la del
  // primer grupo); con monedas mixtas el total sería orientativo.
  const overallCur = active[0]?.currency ?? "$";
  let spent = 0;
  let owe = 0;
  let owed = 0;
  for (const g of active) {
    const ids = g.members.map((m) => m.id);
    for (const e of g.expenses) spent += shareFor(e, ids)[g.meId] || 0;
    const { net } = computeSettle(g.members, g.expenses, g.settlements ?? []);
    const mine = net[g.meId] || 0;
    if (mine > 0.01) owed += mine;
    else if (mine < -0.01) owe += -mine;
  }
  const showOverall = active.length > 0 && spent > 0.01;

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      <TrialBanner />
      {tab === "groups" && (
        <>
          <div className="pt-4">
            <div className="hero anim-up">
              <span className="blob b1" />
              <span className="blob b2" />
              <span className="blob b3" />
              <div className="relative z-10 flex flex-col items-center text-center py-3">
                <div className="mb-4">
                  <Logo size={54} />
                </div>
                <h1 className="text-white font-display text-5xl font-extrabold tracking-tight">Settlia</h1>
                <p className="text-white/85 text-base mt-2.5 max-w-md leading-relaxed">{t("login.tagline")}</p>
                <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/60 mt-1.5">{t("app.poweredAI")}</div>
              </div>
            </div>
          </div>

          {/* Install + upgrade row (each hides itself when not applicable) */}
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <InstallButton />
            {plan === "free" ? (
              <button
                onClick={openUpgrade}
                className="rounded-full px-3 py-1.5 text-sm font-semibold hover-lift inline-flex items-center gap-1.5 text-white"
                style={{ background: "linear-gradient(180deg,#6e6cf5,#5b5bf0)" }}
              >
                <Icon name="sparkles" size={15} /> {t("pro.upgrade")}
              </button>
            ) : (
              <span
                className="rounded-full px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5"
                style={{ background: "rgba(91,91,240,0.12)", color: "var(--indigo)" }}
              >
                <Icon name="sparkles" size={15} /> {t("pro.badge")}
              </span>
            )}
          </div>
        </>
      )}

      <>
      {/* Getting started checklist — shows until all 3 steps done */}
      {!allDone && (
        <div className="space-y-2 mt-6">
          <p className="text-xs font-semibold text-muted px-1 uppercase tracking-wide">{t("onboard.checklist")}</p>
          <StartStep
            n={1}
            done={hasGroup}
            active={!hasGroup}
            title={t("onboard.step1t")}
            desc={t("onboard.step1d")}
            action={!hasGroup ? startCreate : undefined}
            actionLabel={t("home.createGroup")}
          />
          <StartStep
            n={2}
            done={hasExpense}
            active={hasGroup && !hasExpense}
            title={t("onboard.step2t")}
            desc={t("onboard.step2d")}
          />
          <StartStep
            n={3}
            done={hasSettlement}
            active={hasExpense && !hasSettlement}
            title={t("onboard.step3t")}
            desc={t("onboard.step3d")}
          />
        </div>
      )}

      {/* Balance global (todos los grupos): gastado (T), debo (↓), me deben (↑) — cada uno en su propia pill */}
      {showOverall && (
        <div className="mt-6 flex flex-col items-center">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t("home.overall")}</p>
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            <div className="glass rounded-full px-3 py-1.5">
              <span className="text-sm font-mono font-bold">T: {money(spent, overallCur)}</span>
            </div>
            <div className="rounded-full px-3 py-1.5" style={{ background: "rgba(209,68,68,0.12)", color: "#D14444" }}>
              <span className="text-sm font-mono font-bold">↓ {money(owe, overallCur)}</span>
            </div>
            <div className="rounded-full px-3 py-1.5" style={{ background: "rgba(10,139,94,0.12)", color: "#0A8B5E" }}>
              <span className="text-sm font-mono font-bold">↑ {money(owed, overallCur)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-6 mb-2 px-1">
        <h2 className="font-display text-xl font-bold">{t("home.yourGroups")}</h2>
        <button
          onClick={startCreate}
          className="glass rounded-full px-3 py-1.5 text-sm hover-lift text-muted inline-flex items-center gap-1"
        >
          <Icon name="plus" size={15} /> {t("home.new")}
        </button>
      </div>

      <div className="space-y-2">
        {active.length === 0 && allDone && (
          <div className="glass rounded-3xl p-8 text-center text-muted">{t("home.empty")}</div>
        )}
        {active.map((g) => (
          <GroupCard key={g.id} g={g} t={t} money={money} onOpen={() => setActiveGroup(g.id)} onArchive={() => archiveGroup(g.id, true)} />
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArch((v) => !v)}
            className="lk text-sm font-medium inline-flex items-center gap-1"
          >
            <Icon name="chevron" size={14} style={{ transform: showArch ? "rotate(180deg)" : "none" }} />
            {t("home.archived")} ({archived.length})
          </button>
          {showArch && (
            <div className="space-y-1.5 mt-2">
              {archived.map((g) => {
                const total = g.expenses.reduce((s, e) => s + e.amount, 0);
                return (
                  <div key={g.id} className="glass rounded-3xl p-3 flex items-center gap-2" style={{ opacity: 0.8 }}>
                    <button onClick={() => setActiveGroup(g.id)} className="flex-1 text-left min-w-0">
                      <div className="font-semibold truncate">{g.name}</div>
                      <div className="text-xs text-muted">
                        {t("home.meta", { p: g.members.length, amt: money(total, g.currency), e: g.expenses.length })}
                      </div>
                    </button>
                    <button
                      onClick={() => archiveGroup(g.id, false)}
                      className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted shrink-0"
                    >
                      {t("home.restore")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {trashed.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowTrash((v) => !v)}
            className="lk text-sm font-medium inline-flex items-center gap-1"
          >
            <Icon name="chevron" size={14} style={{ transform: showTrash ? "rotate(180deg)" : "none" }} />
            {t("home.trash")} ({trashed.length})
          </button>
          {showTrash && (
            <div className="space-y-1.5 mt-2">
              {trashed.map((g) => {
                const daysLeft = Math.max(
                  0,
                  7 - Math.floor((Date.now() - new Date(g.deletedAt!).getTime()) / 86400000)
                );
                return (
                  <div key={g.id} className="glass rounded-3xl p-3 flex items-center gap-2" style={{ opacity: 0.8 }}>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{g.name}</div>
                      <div className="text-xs text-muted">{t("home.trashDays", { n: String(daysLeft) })}</div>
                    </div>
                    <button
                      onClick={() => recoverGroup(g.id)}
                      className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted shrink-0"
                    >
                      {t("home.recover")}
                    </button>
                    <button
                      onClick={() => purgeGroup(g.id)}
                      className="rounded-full px-3 py-1 text-xs hover-lift shrink-0"
                      style={{ color: "var(--coral)" }}
                      title={t("home.deleteForever")}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </>

      {creating && <CreateGroupModal onClose={() => setCreating(false)} />}
      {showPaywall && <Paywall reason={paywallReason} onClose={() => setShowPaywall(false)} />}
    </div>
  );
}

function StartStep({
  n, done, active, title, desc, action, actionLabel,
}: {
  n: number; done: boolean; active: boolean; title: string; desc: string;
  action?: () => void; actionLabel?: string;
}) {
  return (
    <div
      className="glass rounded-3xl px-4 py-3 flex items-center gap-3 transition-opacity"
      style={{ opacity: !active && !done ? 0.45 : 1 }}
    >
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
        style={
          done
            ? { background: "#0A8B5E22", color: "#0A8B5E" }
            : active
            ? { background: "rgba(10,163,163,0.15)", color: "var(--teal)" }
            : { background: "var(--glass)", color: "var(--muted)" }
        }
      >
        {done ? <Icon name="check" size={15} /> : n}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${done ? "line-through text-muted" : ""}`}>{title}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      {active && action && (
        <button
          onClick={action}
          className="glass-strong rounded-full px-3 py-1.5 text-xs font-semibold hover-lift shrink-0"
          style={{ color: "var(--teal)" }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

const CARD_SWIPE_W = 76;

/** Tarjeta de grupo con deslizar hacia la DERECHA para archivar (revela el
 *  botón detrás, a la izquierda) — igual patrón que deslizar-para-eliminar
 *  en los gastos, pero en la dirección opuesta y para archivar en vez de
 *  borrar. */
function GroupCard({
  g,
  t,
  money,
  onOpen,
  onArchive,
}: {
  g: Group;
  t: ReturnType<typeof useT>;
  money: (n: number, cur?: string) => string;
  onOpen: () => void;
  onArchive: () => void;
}) {
  const { net } = computeSettle(g.members, g.expenses, g.settlements ?? []);
  const mine = net[g.meId] || 0;
  const total = g.expenses.reduce((s, e) => s + e.amount, 0);
  const ok = Math.abs(mine) < 0.01;

  const [swipeX, setSwipeX] = useState(0);
  const drag = useRef<{ startX: number; startY: number; startSwipe: number; horiz: boolean | null; active: boolean }>({
    startX: 0,
    startY: 0,
    startSwipe: 0,
    horiz: null,
    active: false,
  });

  function onTouchStart(ev: React.TouchEvent) {
    const touch = ev.touches[0];
    drag.current = { startX: touch.clientX, startY: touch.clientY, startSwipe: swipeX, horiz: null, active: true };
  }
  function onTouchMove(ev: React.TouchEvent) {
    if (!drag.current.active) return;
    const touch = ev.touches[0];
    const dx = touch.clientX - drag.current.startX;
    const dy = touch.clientY - drag.current.startY;
    if (drag.current.horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      drag.current.horiz = Math.abs(dx) > Math.abs(dy);
    }
    if (!drag.current.horiz) return;
    const next = Math.max(0, Math.min(CARD_SWIPE_W, drag.current.startSwipe + dx));
    setSwipeX(next);
  }
  function onTouchEnd() {
    if (!drag.current.active) return;
    drag.current.active = false;
    setSwipeX((v) => (v > CARD_SWIPE_W / 2 ? CARD_SWIPE_W : 0));
  }

  function handleClick() {
    if (swipeX !== 0) {
      setSwipeX(0);
      return;
    }
    onOpen();
  }

  return (
    <div className="relative rounded-3xl overflow-hidden">
      {swipeX !== 0 && (
        <div className="absolute inset-y-0 left-0 flex items-stretch" style={{ width: CARD_SWIPE_W }}>
          <button
            onClick={() => {
              setSwipeX(0);
              onArchive();
            }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-white"
            style={{ background: "var(--indigo)" }}
          >
            <Icon name="archive" size={16} />
            <span className="text-[10px] font-semibold">{t("group.archive")}</span>
          </button>
        </div>
      )}
      <div
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: drag.current.active ? "none" : "transform 0.2s ease",
          touchAction: "pan-y",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          onClick={handleClick}
          className="glass rounded-3xl p-4 w-full text-left hover-lift flex items-center gap-3"
        >
          <div className="shrink-0">
            <SettleRing value={groupSettleScore(g)} size={44} stroke={5} color="#0FA3A3" track="var(--line)" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg font-bold truncate">{g.name}</div>
            <div className="text-xs text-muted mt-0.5">
              {t("home.meta", { p: g.members.length, amt: money(total, g.currency), e: g.expenses.length })}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {g.members.slice(0, 5).map((m) => (
                <span
                  key={m.id}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2"
                  style={{ background: personColor(m.name) + "33", borderColor: "var(--ring)" }}
                >
                  {memberInitials(m)}
                </span>
              ))}
              {g.members.length > 5 && (
                <span
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 text-muted"
                  style={{ background: "var(--glass)", borderColor: "var(--ring)" }}
                >
                  +{g.members.length - 5}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] uppercase tracking-wide font-mono text-muted">{t("home.yourBalance")}</div>
            <div
              className="font-mono font-bold"
              style={{ color: ok ? "var(--muted)" : mine > 0 ? "#0A8B5E" : "#D14444" }}
            >
              {ok ? t("bal.uptodate") : mine > 0 ? `+${money(mine, g.currency)}` : `−${money(-mine, g.currency)}`}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
