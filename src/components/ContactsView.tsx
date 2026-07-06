import { useEffect, useMemo, useState } from "react";
import { getNetwork, type Contact } from "../lib/contacts";
import { useHiddenContacts } from "../lib/hiddenContacts";
import { personColor, initials } from "../lib/format";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

// Pestaña "Contacts": personas con las que has interactuado en algún grupo (tu
// red). Puedes ocultar las que no quieras ver (filtro local reversible) sin
// perder la opción de volver a añadirlas a un grupo (restauras o buscas por email).
export function ContactsView() {
  const t = useT();
  const { hidden, hide, unhide } = useHiddenContacts();
  const [network, setNetwork] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getNetwork()
      .then(setNetwork)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function inviteFriends() {
    const link = window.location.origin + import.meta.env.BASE_URL;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Settlia", text: t("contacts.inviteText"), url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      /* usuario canceló el share sheet, o el clipboard no está disponible */
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

  return (
    <div className="space-y-3">
      <button
        onClick={inviteFriends}
        className="w-full rounded-full px-4 py-3 font-semibold text-white hover-lift inline-flex items-center justify-center gap-2"
        style={{ background: "var(--ink)" }}
      >
        <Icon name="external" size={16} />
        {copied ? t("contacts.inviteCopied") : t("contacts.invite")}
      </button>

      {/* Buscador */}
      {network.length > 0 && (
        <div className="relative">
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
          <div className="space-y-1.5">
            {visible.map((c) => (
              <div key={c.userId} className="glass rounded-3xl px-3 py-2.5 flex items-center gap-3">
                <Avatar c={c} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{c.name}</div>
                  {c.email && <div className="text-[11px] text-muted truncate">{c.email}</div>}
                </div>
                <button
                  onClick={() => hide(c.userId)}
                  className="glass rounded-full h-8 w-8 flex items-center justify-center hover-lift lk-danger text-muted shrink-0"
                  title={t("contacts.remove")}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
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
    </div>
  );
}
