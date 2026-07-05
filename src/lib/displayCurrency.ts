import type { Group } from "./types";
import { money } from "./format";
import { usePlan } from "./plan";
import { useDailyRate } from "./fxCache";

/** Formateador de montos que respeta el toggle de doble moneda del grupo
 *  (Pro): si el grupo tiene `secondaryCurrency` y `displayCurrency` apunta a
 *  ella, convierte con la tasa del día; si no, formatea en `group.currency`
 *  sin tocar nada (comportamiento idéntico al actual). */
export function useGroupMoney(group: Group): (amount: number) => string {
  const plan = usePlan();
  const wantsSecondary = plan === "pro" && !!group.secondaryCurrency && group.displayCurrency === group.secondaryCurrency;
  const target = wantsSecondary ? group.secondaryCurrency! : group.currency;
  const rate = useDailyRate(group.currency, wantsSecondary ? target : undefined);
  const ready = !wantsSecondary || rate != null;
  const activeCode = ready ? target : group.currency;
  const factor = ready ? rate ?? 1 : 1;
  return (amount: number) => money(amount * factor, activeCode);
}
