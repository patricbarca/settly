import { useIsOnline } from "../lib/store";
import { useT } from "../lib/i18n";

export function OfflineBanner() {
  const online = useIsOnline();
  const t = useT();
  if (online) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold text-white shadow-lg"
        style={{ background: "rgba(40,40,40,0.92)", backdropFilter: "blur(8px)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#f87171" }} />
        {t("offline.banner")}
      </div>
    </div>
  );
}
