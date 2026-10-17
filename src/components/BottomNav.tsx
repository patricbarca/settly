import { useT } from "../lib/i18n";
import { initials } from "../lib/format";
import { Icon, type IconName } from "./Icon";
import { Avatar } from "./Avatar";
import { haptic } from "../lib/haptics";

export type NavKey = "groups" | "mine" | "friends" | "activity" | "profile";

/** Barra de navegación inferior flotante (cristal), siempre visible tras el login — sustituye el
 *  antiguo toggle Grupos|Contactos y el bloque de perfil de la cabecera, y
 *  añade un acceso directo a Actividad/Notificaciones (antes solo la campana). */
export function BottomNav({
  active,
  unread,
  userName,
  userAvatar,
  onGroups,
  onMine,
  onFriends,
  onActivity,
  onProfile,
}: {
  active: NavKey;
  unread: number;
  userName: string;
  userAvatar?: string;
  onGroups: () => void;
  onMine: () => void;
  onFriends: () => void;
  onActivity: () => void;
  onProfile: () => void;
}) {
  const t = useT();

  const items: { key: NavKey; label: string; icon: IconName; onClick: () => void }[] = [
    { key: "groups", label: t("nav.groups"), icon: "home", onClick: onGroups },
    { key: "mine", label: t("nav.mine"), icon: "card", onClick: onMine },
    { key: "friends", label: t("nav.friends"), icon: "users", onClick: onFriends },
    { key: "activity", label: t("nav.activity"), icon: "bell", onClick: onActivity },
  ];

  const tap = (fn: () => void) => () => {
    haptic("selection");
    fn();
  };
  const itemCls = "flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-full relative transition-colors";
  const onBg = (on: boolean) => (on ? { background: "var(--seg-track)" } : undefined);

  return (
    <nav
      className="fixed inset-x-3 z-40 mx-auto max-w-md"
      style={{
        // Barra flotante estilo iOS 26: separada del borde, encima del
        // indicador de inicio.
        bottom: "max(calc(env(safe-area-inset-bottom) - 6px), 10px)",
        // Fuerza a la barra a su propia capa GPU: en iOS Safari/WKWebView una
        // barra `fixed` sin capa propia se "arrastra" a mitad de pantalla
        // durante el scroll con inercia. translateZ(0) la ancla al viewport.
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      <div className="glass-chrome rounded-full p-1 flex items-stretch">
        {items.map((it) => {
          const on = active === it.key;
          return (
            <button
              key={it.key}
              onClick={tap(it.onClick)}
              className={itemCls}
              style={{ color: on ? "var(--teal)" : "var(--ink)", ...onBg(on) }}
              aria-current={on ? "page" : undefined}
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
              <span className="text-[10px] font-semibold">{it.label}</span>
            </button>
          );
        })}
        <button
          onClick={tap(onProfile)}
          className={itemCls}
          style={{ color: active === "profile" ? "var(--teal)" : "var(--ink)", ...onBg(active === "profile") }}
          aria-current={active === "profile" ? "page" : undefined}
        >
          <span
            className="rounded-full shrink-0 inline-flex items-center justify-center leading-none"
            style={{ border: active === "profile" ? "1.5px solid var(--teal)" : "1.5px solid transparent" }}
          >
            <Avatar name={userName} avatar={userAvatar} initials={initials(userName)} size={20} />
          </span>
          <span className="text-[10px] font-semibold">{t("nav.profile")}</span>
        </button>
      </div>
    </nav>
  );
}
