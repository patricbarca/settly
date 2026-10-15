import { HERO_COLORS, heroBackground, HeroCover, DEFAULT_POS } from "../lib/heroStyle";
import { fileToCoverDataUrl } from "../lib/image";
import { useRef, useState } from "react";
import type { Group, GroupKind } from "../lib/types";
import { updateGroup, deleteGroup, leaveGroup } from "../lib/store";
import { useUser } from "../lib/auth";
import { withActivity } from "../lib/activity";
import { computeSettle, settleOf, mainView } from "../lib/split";
import { money, memberInitials, sortedMembers } from "../lib/format";
import { Avatar } from "./Avatar";
import { useT, useLang } from "../lib/i18n";
import { usePlan } from "../lib/plan";
import { CURRENCIES, currencyOf, localCurrencyName, resolveToCode } from "../lib/currencies";
import { Icon } from "./Icon";
import { Overlay } from "./Overlay";
import { ImportExpensesModal } from "./ImportExpensesModal";
import { Paywall } from "./Paywall";
import { ConfirmModal } from "./ConfirmModal";

const COMMON_CODES = ["EUR", "USD", "GBP", "AUD", "CAD", "CHF", "MXN", "BRL", "COP", "ARS", "JPY"];

export function GroupSettings({ group, onClose }: { group: Group; onClose: () => void }) {
  const [showImport, setShowImport] = useState(false);
  const t = useT();
  const lang = useLang();
  const locale = lang === "es" ? "es-ES" : "en-US";

  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState(() => resolveToCode(group.currency));
  const [kind, setKind] = useState<GroupKind>(group.kind ?? "trip");
  const [simplify, setSimplify] = useState(group.simplifyDebts !== false);
  // Confirmación al cambiar de modo de pago si ya hay pagos confirmados (las
  // transferencias sugeridas pueden reordenarse; ver aviso).
  const [pendingMode, setPendingMode] = useState<boolean | null>(null);
  const hasConfirmedPayments = (group.settlements ?? []).some((s) => s.status === "confirmed");
  const savedMode = group.simplifyDebts !== false;
  function chooseMode(s: boolean) {
    if (s === simplify) return;
    if (s !== savedMode && hasConfirmedPayments) setPendingMode(s);
    else setSimplify(s);
  }
  const [secondaryCurrency, setSecondaryCurrency] = useState(group.secondaryCurrency ?? "");
  const [multi, setMulti] = useState(!!group.multiCurrency);
  const [heroCol, setHeroCol] = useState(group.heroColor ?? "default");
  const [heroImg, setHeroImg] = useState(group.heroImage ?? "");
  const [heroPos, setHeroPos] = useState(group.heroImagePos ?? DEFAULT_POS);
  const drag = useRef<{ x: number; y: number; px: number; py: number; w: number; h: number } | null>(null);
  const [imgErr, setImgErr] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState(group.displayCurrency ?? group.currency);
  const [saved, setSaved] = useState(false);
  const [confirmDanger, setConfirmDanger] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  const plan = usePlan();
  const user = useUser();
  // Dueño = creador del grupo (o grupo local sin owner, p. ej. invitado).
  const isOwner = !group.ownerId || group.ownerId === user?.id;

  function deleteOrLeave() {
    if (isOwner) deleteGroup(group.id);
    else leaveGroup(group.id);
    onClose();
  }

  const { net } = settleOf(mainView(group));

  const referenced = new Set<string>();
  group.expenses.forEach((e) => {
    referenced.add(e.payerId);
    e.participantIds.forEach((p) => referenced.add(p));
    e.payments?.forEach((p) => referenced.add(p.memberId));
  });
  (group.settlements ?? []).forEach((s) => {
    referenced.add(s.from);
    referenced.add(s.to);
  });

  const dirty =
    name.trim() !== group.name ||
    currency !== resolveToCode(group.currency) ||
    kind !== (group.kind ?? "trip") ||
    simplify !== (group.simplifyDebts !== false) ||
    secondaryCurrency !== (group.secondaryCurrency ?? "") ||
    displayCurrency !== (group.displayCurrency ?? group.currency) ||
    multi !== !!group.multiCurrency ||
    heroCol !== (group.heroColor ?? "default") ||
    heroImg !== (group.heroImage ?? "") ||
    JSON.stringify(heroPos) !== JSON.stringify(group.heroImagePos ?? DEFAULT_POS);

  function save() {
    const n = name.trim();
    const c = currency.trim();
    if (!n || !c) return;
    const sc = plan === "pro" ? secondaryCurrency.trim() || undefined : undefined;
    const dc = sc && displayCurrency === sc ? sc : c;
    updateGroup(group.id, (g) => ({
      ...g,
      name: n,
      currency: c,
      kind,
      simplifyDebts: simplify,
      secondaryCurrency: sc,
      displayCurrency: dc,
      multiCurrency: multi || undefined,
      // null (no undefined) para que el servidor sepa que se quitó a propósito.
      heroColor: heroCol === "default" ? null : heroCol,
      heroImage: heroImg || null,
      heroImagePos: heroImg ? heroPos : null,
    }));
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  // Solo el DUEÑO puede quitar miembros; nadie puede quitarse a sí mismo.
  function removeMember(id: string) {
    if (!isOwner || id === group.meId) return;
    const removed = group.members.find((m) => m.id === id)?.name;
    updateGroup(group.id, (g) => ({
      ...g,
      members: g.members.filter((m) => m.id !== id),
      activity: withActivity(g, {
        type: "member_removed",
        actorId: g.meId,
        actorName: g.members.find((m) => m.id === g.meId)?.name,
        label: removed,
      }),
    }));
  }

  const isCommon = COMMON_CODES.includes(currency);

  return (
    <Overlay onClose={onClose}>
      <div
        className="glass-strong rounded-3xl w-full max-w-sm p-6 anim-pop max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-xl font-bold">{t("settings.title")}</h3>
          <button onClick={onClose} className="glass rounded-full h-9 w-9 flex items-center justify-center text-muted">
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("members.name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass rounded-xl px-3 py-2.5 text-sm w-full mt-1"
          />
        </div>

        {/* Apariencia: color o foto de la tarjeta del grupo */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted">{t("settings.look")}</label>
          <div
            className="hero mt-1 !p-0 h-28 flex items-end"
            style={{ ...heroBackground({ heroColor: heroCol, heroImage: heroImg || undefined }), touchAction: heroImg ? "none" : undefined, cursor: heroImg ? "grab" : undefined }}
            onPointerDown={(e) => {
              if (!heroImg) return;
              const r = e.currentTarget.getBoundingClientRect();
              drag.current = { x: e.clientX, y: e.clientY, px: heroPos.x, py: heroPos.y, w: r.width, h: r.height };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              // Arrastrar a la derecha muestra más de la izquierda → el foco baja.
              const k = 100 / heroPos.z;
              const clamp = (v: number) => Math.max(0, Math.min(100, v));
              setHeroPos((p) => ({ ...p, x: clamp(d.px - ((e.clientX - d.x) / d.w) * k), y: clamp(d.py - ((e.clientY - d.y) / d.h) * k) }));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            <HeroCover g={{ heroImage: heroImg || undefined, heroImagePos: heroPos }} />
            <span className="relative z-10 text-white font-display font-extrabold text-lg truncate px-4 pb-2">{name || group.name}</span>
          </div>
          {heroImg && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-muted shrink-0">{t("settings.lookZoom")}</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={heroPos.z}
                onChange={(e) => setHeroPos((p) => ({ ...p, z: Number(e.target.value) }))}
                className="flex-1 min-w-0"
              />
            </div>
          )}
          {heroImg && <div className="text-[11px] text-muted mt-1">{t("settings.lookDragHint")}</div>}
          <div className="flex flex-wrap gap-2 mt-2">
            {HERO_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setHeroCol(c.id); setHeroImg(""); }}
                aria-label={c.id}
                className="h-8 w-8 rounded-full"
                style={{
                  background: `linear-gradient(150deg, ${c.a}, ${c.b})`,
                  outline: !heroImg && heroCol === c.id ? "2px solid var(--ink)" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <label className="glass rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer">
              {heroImg ? t("settings.lookChange") : t("settings.lookPhoto")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try { setHeroImg(await fileToCoverDataUrl(f)); setHeroPos(DEFAULT_POS); setImgErr(false); } catch { setImgErr(true); }
                }}
              />
            </label>
            {heroImg && (
              <button type="button" onClick={() => setHeroImg("")} className="glass rounded-xl px-3 py-2 text-xs font-semibold text-muted">
                {t("settings.lookRemove")}
              </button>
            )}
          </div>
          {imgErr && <div className="text-xs mt-1" style={{ color: "var(--coral)" }}>{t("settings.lookErr")}</div>}
        </div>

        {/* Currency */}
        {/* ── Monedas: todo en una tarjeta, de lo básico a lo opcional ── */}
        <div className="mb-5 glass rounded-3xl p-4 space-y-4">
          <div className="text-xs uppercase tracking-widest font-mono text-muted">{t("settings.currencySection")}</div>

          {/* 1. Moneda principal: pastillas con el CÓDIGO (el símbolo "$" es ambiguo) + lista completa */}
          <div>
            <label className="text-sm font-semibold">{t("settings.mainCurrency")}</label>
            <p className="text-xs text-muted mt-0.5 mb-2">{t("settings.mainCurrencyHint")}</p>
            <div className="flex gap-1.5 flex-wrap">
              {COMMON_CODES.map((code) => {
                const on = currency === code;
                return (
                  <button
                    key={code}
                    onClick={() => setCurrency(code)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${on ? "" : "glass text-muted"}`}
                    style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                    title={localCurrencyName(code, locale)}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="glass rounded-xl px-3 py-2 text-sm mt-2 w-full min-w-0"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} — {localCurrencyName(c.code, locale)}
                </option>
              ))}
            </select>
          </div>

          {/* 2. ¿Qué hacer con un gasto en otra moneda? — dos opciones explicadas */}
          <div>
            <label className="text-sm font-semibold">{t("settings.foreignTitle")}</label>
            <div className="space-y-2 mt-2">
              {[false, true].map((v) => {
                const on = multi === v;
                return (
                  <button
                    key={String(v)}
                    onClick={() => setMulti(v)}
                    className="w-full text-left rounded-2xl p-3 flex items-start gap-3 hover-lift"
                    style={{
                      background: on ? "rgba(15,163,163,0.12)" : "var(--surface-soft)",
                      border: `1.5px solid ${on ? "var(--teal)" : "transparent"}`,
                    }}
                  >
                    <span
                      className="mt-0.5 h-4 w-4 rounded-full shrink-0 flex items-center justify-center"
                      style={{ border: `2px solid ${on ? "var(--teal)" : "var(--muted)"}` }}
                    >
                      {on && <span className="h-2 w-2 rounded-full" style={{ background: "var(--teal)" }} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {v ? t("settings.foreignSeparate") : t("settings.foreignConvert", { main: currency })}
                      </span>
                      <span className="block text-xs text-muted mt-0.5">
                        {v ? t("settings.foreignSeparateHint", { main: currency }) : t("settings.foreignConvertHint", { main: currency })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Ver los importes también en otra moneda (Pro, solo visual) */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-semibold">{t("settings.viewAlsoTitle")}</label>
              {plan !== "pro" && (
                <button onClick={() => setShowPaywall(true)} className="text-xs font-semibold shrink-0" style={{ color: "var(--indigo)" }}>
                  {t("pro.upgrade")}
                </button>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5 mb-2">{t("settings.viewAlsoHint")}</p>
            <select
              value={secondaryCurrency}
              disabled={plan !== "pro"}
              onChange={(e) => {
                setSecondaryCurrency(e.target.value);
                setDisplayCurrency(currency);
              }}
              className="glass rounded-xl px-3 py-2 text-sm w-full min-w-0 disabled:opacity-50"
            >
              <option value="">{t("settings.viewAlsoNone")}</option>
              {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} — {localCurrencyName(c.code, locale)}
                </option>
              ))}
            </select>

            {plan === "pro" && secondaryCurrency && (
              <div className="mt-3">
                <div className="text-xs text-muted mb-1.5">{t("settings.showAmountsIn")}</div>
                <div className="glass rounded-full p-0.5 flex text-sm font-semibold">
                  {[currency, secondaryCurrency].map((code) => {
                    const on = displayCurrency === code;
                    return (
                      <button
                        key={code}
                        onClick={() => setDisplayCurrency(code)}
                        className={`flex-1 px-3 py-1.5 rounded-full ${on ? "" : "text-muted"}`}
                        style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted mt-1.5">
                  {displayCurrency === secondaryCurrency
                    ? t("settings.showingConverted", { code: secondaryCurrency, main: currency })
                    : t("settings.showingMain", { main: currency })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Group kind */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted">{t("create.kind")}</label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {(["trip", "home"] as GroupKind[]).map((k) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-2xl p-2.5 text-left hover-lift ${on ? "" : "glass"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon name={k === "home" ? "home" : "plane"} size={14} />
                    {t(k === "home" ? "create.kindHome" : "create.kindTrip")}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment mode */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted">{t("settings.payMode")}</label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {[true, false].map((s) => {
              const on = simplify === s;
              return (
                <button
                  key={String(s)}
                  onClick={() => chooseMode(s)}
                  className={`rounded-2xl p-2.5 text-sm font-semibold text-center hover-lift ${on ? "" : "glass"}`}
                  style={on ? { background: "var(--pill-bg)", color: "var(--pill-fg)" } : undefined}
                >
                  {t(s ? "settings.paySimple" : "settings.payDirect")}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted mt-1.5">
            {t(simplify ? "settings.payModeSimpleHint" : "settings.payModeDirectHint")}
          </p>
          {simplify !== (group.simplifyDebts !== false) && (
            <p className="text-[11px] mt-1.5" style={{ color: "var(--amber)" }}>
              {t("settings.payModeSwitchWarn")}
            </p>
          )}
        </div>

        {/* Members */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-muted mb-2">{t("settings.members")}</div>
          <div className="space-y-2">
            {sortedMembers(group.members).map((m) => {
              const balance = net[m.id] ?? 0;
              const settled = Math.abs(balance) < 0.01;
              const canRemove = isOwner && m.id !== group.meId && !referenced.has(m.id);
              return (
                <div key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.name} avatar={m.avatar} initials={memberInitials(m)} size={28} />
                  <span className="text-sm font-medium flex-1 truncate">
                    {m.name}
                    {m.id === group.meId && <span className="text-muted text-xs"> · {t("members.you")}</span>}
                  </span>
                  {!settled && (
                    <span
                      className="text-xs font-mono shrink-0"
                      style={{ color: balance > 0 ? "#0A8B5E" : "#D14444" }}
                    >
                      {balance > 0 ? "+" : "−"}{money(Math.abs(balance), group.currency)}
                    </span>
                  )}
                  {canRemove ? (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="glass rounded-full h-7 w-7 flex items-center justify-center lk-danger text-muted hover-lift shrink-0"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  ) : (
                    <div className="h-7 w-7 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={save}
          disabled={!dirty || !name.trim()}
          className="w-full rounded-full py-3 font-semibold text-white hover-lift disabled:opacity-40"
          style={{ background: saved ? "#0A8B5E" : "var(--ink)" }}
        >
          {saved ? `✓ ${t("settings.saved")}` : t("common.save")}
        </button>

        {/* Importar gastos (CSV de Splitwise): añade gastos, pagos y personas,
            cada gasto en la moneda que trae el archivo. */}
        <div className="glass rounded-2xl px-4 py-3 mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t("import.cardTitle")}</div>
            <div className="text-xs text-muted mt-0.5">{t("import.cardHint")}</div>
          </div>
          <button
            onClick={() => setShowImport(true)}
            className="glass-strong rounded-full px-4 py-2 text-sm font-semibold hover-lift inline-flex items-center gap-1.5 shrink-0"
            style={{ color: "var(--teal)" }}
          >
            <Icon name="doc" size={14} />
            {t("import.cardBtn")}
          </button>
        </div>

        {/* Zona de riesgo: eliminar (dueño) o salir (miembro) */}
        <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          {!confirmDanger ? (
            <button
              onClick={() => setConfirmDanger(true)}
              className="text-sm font-semibold hover-lift inline-flex items-center gap-1.5"
              style={{ color: "var(--coral)" }}
            >
              <Icon name={isOwner ? "trash" : "power"} size={14} />
              {isOwner ? t("group.delete") : t("group.leave")}
            </button>
          ) : (
            <div className="anim-up">
              <p className="text-xs mb-2" style={{ color: "var(--coral)" }}>
                {isOwner ? t("group.deleteRecoverWarn") : t("group.leaveWarn")}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDanger(false)}
                  className="rounded-full px-4 py-2 text-sm glass text-muted hover-lift"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={deleteOrLeave}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-white hover-lift"
                  style={{ background: "var(--coral)" }}
                >
                  {isOwner ? t("group.delete") : t("group.leave")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
      {showImport && <ImportExpensesModal group={group} onClose={() => setShowImport(false)} />}
      {pendingMode !== null && (
        <ConfirmModal
          danger={false}
          title={t("settings.payModeSwitchTitle")}
          message={t("settings.payModeSwitchConfirm")}
          confirmLabel={t("settings.payModeSwitchOk")}
          onConfirm={() => setSimplify(pendingMode)}
          onClose={() => setPendingMode(null)}
        />
      )}
    </Overlay>
  );
}
