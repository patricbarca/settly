import { useIsOnline } from "../lib/store";
import { useT } from "../lib/i18n";

export function OfflineBanner() {
  const online = useIsOnline();
  const t = useT();
  if (online) return null;
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-white"
      style={{ background: "#444" }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#f87171" }} />
      {t("offline.banner")}
    </div>
  );
}
