import { Capacitor } from "@capacitor/core";

export type HapticKind = "selection" | "light" | "medium" | "success" | "warning";

/** Vibración corta estilo iOS. En la app nativa usa el Taptic Engine
 *  (@capacitor/haptics, importado bajo demanda para no cargarlo en web); en
 *  web usa `navigator.vibrate`, que solo existe en Android (Safari lo ignora).
 *  Nunca lanza: una vibración que falla no debe romper la acción. */
export function haptic(kind: HapticKind = "light") {
  try {
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/haptics")
        .then(({ Haptics, ImpactStyle, NotificationType }) => {
          if (kind === "success") return Haptics.notification({ type: NotificationType.Success });
          if (kind === "warning") return Haptics.notification({ type: NotificationType.Warning });
          return Haptics.impact({ style: kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
        })
        .catch(() => {});
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(kind === "success" || kind === "warning" ? [12, 40, 12] : kind === "medium" ? 14 : 8);
    }
  } catch {
    /* sin vibración */
  }
}
