import { useEffect, useMemo, useState } from "react";
import { getNetwork, type Contact } from "../lib/contacts";
import { useHiddenContacts } from "../lib/hiddenContacts";
import { personColor, initials, money } from "../lib/format";
import { useT } from "../lib/i18n";
import { usePlan } from "../lib/plan";
import { useFriends, type Friend } from "../lib/friends";
import { Icon } from "./Icon";
import { SettleFriendModal } from "./SettleFriendModal";
import { Paywall } from "./Paywall";

// Pestaña "Contacts": personas con las que has interactuado en algún grupo (tu
// red). Puedes ocultar las que no quieras ver (filtro local reversible) sin
// perder la opción de volver a añadirlas a un grupo (restauras o buscas por email).
export function ContactsView() {
  const t = useT();
  const plan = usePlan();
  const { hidden, hide, unhide } = useHiddenContacts();
  const { friends } = useFriends();
  const [network, setNetwork] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const [settleFriend, setSettleFriend] = useState<Friend | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getNetwork()
      .then(setNetwork)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Comparte/copia el enlace de la app para que un amigo se registre. Robusto:
  // usa el share sheet nativo si existe; si el usuario lo cancela no hace nada;
  // si no hay share o falla, copia el enlace al portapapeles y avisa ("Copiado").
  async function inviteFriends() {
    const link = window.location.origin + import.meta.env.BASE_URL;
    const text = t("contacts.inviteText");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Settlia", text, url: link });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // canceló el share sheet
      /* si el share falla por otro motivo, cae al portapapeles */
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* sin portapapeles disponible */
    }
  }

  const q = query.trim().toLowerCase();
  const match = (c: Contact) =>
    !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);

  const visible = useMemo(
    () => network.filter((c) => !hidden.has(c.userId)).filter(match),
    [network, hidden, q]
  );
  const hiddenList = useMemo(
    () => network.filter((c) => hidden.has(c.userId)),
    [network, hidden]
  );

  function Avatar({ c }: { c: Contact }) {
    return c.avatar ? (
      <img src={c.avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
    ) : (
      <span
        className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: personColor(c.name) + "22" }}
      >
        {initials(c.name)}
      </span>
    );
  }

  // Rellena la lista con "espacios libres" hasta un mínimo de filas — así la
  // vista no se ve vacía/incompleta mientras aún no tienes (muchos) contactos.
  const MIN_SLOTS = 5;
  const emptySlots = Math.max(0, MIN_SLOTS - visible.length);

  function EmptySlot() {
    return (
      <div className="rounded-3xl px-3 py-2.5 flex items-center gap-3" style={{ border: "1.5px dashed var(--line)" }}>
        <span className="h-9 w-9 rounded-full shrink-0" style={{ border: "1.5px dashed var(--line)" }} />
        <div className="text-xs text-muted">{t("contacts.emptySlot")}</div>
      </div>
    );
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const friendById = useMemo(() => new Map(friends.map((f) => [f.userId, f])), [friends]);

  return (
    <div className="space-y-3">
      {/* Top: buscador + botón pequeño de invitar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon name="search" size={15} className="text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("contacts.searchPh")}
            className="glass rounded-xl pl-9 pr-8 py-2.5 text-sm w-full"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover-lift">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <button
          onClick={inviteFriends}
          title={t("contacts.invite")}
          className="glass rounded-xl px-3 py-2.5 shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold hover-lift text-muted"
        >
          <Icon name={copied ? "check" : "external"} size={15} />
          <span>{copied ? t("contacts.inviteCopied") : t("contacts.invite")}</span>
        </button>
      </div>

      {/* Upsell Pro para usuarios free (los saldos/settle son Pro) */}
      {plan !== "pro" && (
        <button
          onClick={() => setShowPaywall(true)}
          className="w-full glass rounded-3xl px-4 py-3 text-left hover-lift flex items-center gap-3"
        >
          <span className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(91,91,240,.13)", color: "var(--indigo)" }}>
            <Icon name="sparkles" size={18} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm">{t("friends.proTitle")}</div>
            <div className="text-[11px] text-muted">{t("friends.proUpsell")}</div>
          </div>
        </button>
      )}

      {loading ? (
        <div className="glass rounded-3xl p-8 text-center text-muted">{t("contacts.loading")}</div>
      ) : q && visible.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center text-muted">{t("contacts.none")}</div>
      ) : (
        <>
          {network.length === 0 && (
            <p className="text-xs text-muted px-1">{t("contacts.empty")}</p>
          )}
          {/* Lista única: toda tu red. Pro: si hay saldo, se muestra y al tocar
              se despliega el desglose por grupos + botón Saldar. */}
          <div className="space-y-1.5">
            {visible.map((c) => {
              const f = plan === "pro" ? friendById.get(c.userId) : undefined;
              const entries = f ? Object.entries(f.netByCurrency).filter(([, v]) => Math.abs(v) > 0.005) : [];
              const hasBalance = entries.length > 0;
              const iOweAny = entries.some(([, v]) => v > 0.005);
              const open = expanded === c.userId;
              return (
                <div key={c.userId} className="glass rounded-3xl px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div
                      onClick={hasBalance ? () => setExpanded(open ? null : c.userId) : undefined}
                      className={`flex items-center gap-3 flex-1 min-w-0 ${hasBalance ? "cursor-pointer" : ""}`}
                    >
                      <Avatar c={c} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{c.name}</div>
                        {hasBalance ? (
                          <div className="text-[11px] font-mono">
                            {entries.map(([sym, v]) => (
                              <span key={sym} style={{ color: v > 0 ? "var(--coral)" : "#0A8B5E" }}>
                                {v > 0 ? t("friends.youOwe", { amt: money(v, sym) }) : t("friends.theyOwe", { amt: money(-v, sym) })}{" "}
                              </span>
                            ))}
                          </div>
                        ) : (
                          c.email && <div className="text-[11px] text-muted truncate">{c.email}</div>
                        )}
                      </div>
                      {hasBalance && (
                        <Icon name="chevron" size={14} className="text-muted shrink-0" style={{ transform: open ? "rotate(180deg)" : "none" }} />
                      )}
                    </div>
                    <button
                      onClick={() => hide(c.userId)}
                      className="glass rounded-full h-8 w-8 flex items-center justify-center hover-lift lk-danger text-muted shrink-0"
                      title={t("contacts.remove")}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>

                  {/* Desglose por grupos */}
                  {open && f && (
                    <div className="mt-2 pt-2 border-t border-black/5 space-y-1">
                      {f.groups.map((g) => {
                        const net = r2(g.iOweTotal - g.theyOweTotal);
                        if (Math.abs(net) < 0.005) return null;
                        return (
                          <div key={g.groupId} className="flex items-center justify-between text-xs">
                            <span className="text-muted truncate">{g.groupName}</span>
                            <span className="font-mono" style={{ color: net > 0 ? "var(--coral)" : "#0A8B5E" }}>
                              {net > 0 ? t("friends.youOwe", { amt: money(net, g.currency) }) : t("friends.theyOwe", { amt: money(-net, g.currency) })}
                            </span>
                          </div>
                        );
                      })}
                      {iOweAny && (
                        <button
                          onClick={() => setSettleFriend(f)}
                          className="w-full glass-strong rounded-full px-4 py-2 text-sm font-semibold hover-lift mt-1.5"
                          style={{ color: "var(--teal)" }}
                        >
                          {t("friends.settle")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!q && Array.from({ length: emptySlots }, (_, i) => <EmptySlot key={i} />)}
          </div>
        </>
      )}

      {/* Ocultos (restaurables) */}
      {hiddenList.length > 0 && (
        <div className="pt-1">
          <button onClick={() => setShowHidden((v) => !v)} className="lk text-sm font-medium inline-flex items-center gap-1 text-muted">
            <Icon name="chevron" size={14} style={{ transform: showHidden ? "rotate(180deg)" : "none" }} />
            {t("contacts.hidden")} ({hiddenList.length})
          </button>
          {showHidden && (
            <div className="space-y-1.5 mt-2">
              {hiddenList.map((c) => (
                <div key={c.userId} className="glass rounded-3xl px-3 py-2.5 flex items-center gap-3" style={{ opacity: 0.7 }}>
                  <Avatar c={c} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    {c.email && <div className="text-[11px] text-muted truncate">{c.email}</div>}
                  </div>
                  <button
                    onClick={() => unhide(c.userId)}
                    className="glass rounded-full px-3 py-1 text-xs hover-lift text-muted shrink-0"
                  >
                    {t("contacts.restore")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {settleFriend && <SettleFriendModal friend={settleFriend} onClose={() => setSettleFriend(null)} />}
      {showPaywall && <Paywall onClose={() => setShowPaywall(false)} />}
    </div>
  );
}
