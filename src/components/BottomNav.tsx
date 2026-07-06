import { useT } from "../lib/i18n";
import { personColor, initials } from "../lib/format";
import { Icon, type IconName } from "./Icon";

export type NavKey = "groups" | "friends" | "activity" | "profile";

/** Barra de navegación inferior, siempre visible tras el login — sustituye el
 *  antiguo toggle Grupos|Contactos y el bloque de perfil de la cabecera, y
 *  añade un acceso directo a Actividad/Notificaciones (antes solo la campana). */
export function BottomNav({
  active,
  unread,
  userName,
  onGroups,
  onFriends,
  onActivity,
  onProfile,
}: {
  active: NavKey;
  unread: number;
  userName: string;
  onGroups: () => void;
  onFriends: () => void;
  onActivity: () => void;
  onProfile: () => void;
}) {
  const t = useT();

  const items: { key: NavKey; label: string; icon: IconName; onClick: () => void }[] = [
    { key: "groups", label: t("nav.groups"), icon: "home", onClick: onGroups },
    { key: "friends", label: t("nav.friends"), icon: "users", onClick: onFriends },
    { key: "activity", label: t("nav.activity"), icon: "bell", onClick: onActivity },
  ];

  return (
    <>
      {/* Relleno por si algún dispositivo deja asomar un resquicio por debajo
       *  del nav (viewport visual vs real, notch, etc.) — mismo color, se
       *  extiende bien por debajo de la pantalla real así que cubre
       *  cualquier hueco sin importar la causa exacta. */}
      <div className="fixed inset-x-0 z-30 surface" style={{ bottom: "-50vh", height: "50vh" }} />
      <nav
        className="fixed bottom-0 inset-x-0 z-40 surface"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", borderTop: "1px solid var(--line)" }}
      >
      <div className="max-w-2xl mx-auto px-2 flex items-stretch">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={it.onClick}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative"
            style={{ color: active === it.key ? "var(--teal)" : "var(--muted)" }}
          >
            <span className="relative">
              <Icon name={it.icon} size={20} />
              {it.key === "activity" && unread > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] rounded-full text-[9px] font-bold text-white flex items-center justify-center leading-none tabular-nums"
                  style={{ background: "var(--coral)" }}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium">{it.label}</span>
          </button>
        ))}
        <button
          onClick={onProfile}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5"
          style={{ color: active === "profile" ? "var(--teal)" : "var(--muted)" }}
        >
          <span
            className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{
              background: personColor(userName) + "33",
              border: active === "profile" ? "1.5px solid var(--teal)" : "1.5px solid transparent",
            }}
          >
            {initials(userName)}
          </span>
          <span className="text-[11px] font-medium">{t("nav.profile")}</span>
        </button>
      </div>
      </nav>
    </>
  );
}
