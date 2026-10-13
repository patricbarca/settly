import type { Group } from "./types";
import { computeSettle, settleOf, mainView } from "./split";
import type { IconName } from "../components/Icon";

export interface Achievement {
  id: string;
  icon: IconName;
  got: boolean;
}

export interface MemberStats {
  score: number; // Settle Score personal (100 = al día)
  xp: number;
  level: number;
  levelPct: number;
  achievements: Achievement[];
  gotCount: number;
  net: number;
}

/** Settle Score del grupo (0-100, verde = todos al día). */
export function groupSettleScore(group: Group): number {
  if (group.expenses.length === 0) return 100;
  const { net } = settleOf(mainView(group));
  const total = group.expenses.reduce((s, e) => s + e.amount, 0);
  const outstanding = group.members.reduce((s, m) => s + Math.abs(net[m.id] || 0), 0) / 2;
  const ratio = total > 0 ? Math.min(outstanding / total, 1) : 0;
  return Math.round(100 * (1 - ratio));
}

/** Logros, nivel y XP de UNA persona del grupo. */
export function memberStats(group: Group, memberId: string): MemberStats {
  const settlements = group.settlements ?? [];
  const { net } = computeSettle(group.members, group.expenses, settlements);
  const myNet = net[memberId] || 0;
  const total = group.expenses.reduce((s, e) => s + e.amount, 0);
  const myPaidCount = group.expenses.filter((e) => e.payerId === memberId).length;
  const mySettled = settlements.some((s) => s.status === "confirmed" && s.from === memberId);
  const settledAll =
    group.expenses.length > 0 && group.members.every((m) => Math.abs(net[m.id] || 0) < 0.01);

  const achievements: Achievement[] = [
    { id: "sinDeudas", icon: "check", got: group.expenses.length > 0 && Math.abs(myNet) < 0.01 },
    { id: "anfitrion", icon: "card", got: myPaidCount >= 3 },
    { id: "prontoPagador", icon: "clock", got: mySettled },
    { id: "detallista", icon: "edit", got: myPaidCount >= 5 },
    { id: "cuentasClaras", icon: "balance", got: settledAll },
    { id: "crew", icon: "users", got: group.members.length >= 4 },
  ];
  const gotCount = achievements.filter((a) => a.got).length;

  const xp = myPaidCount * 8 + (mySettled ? 20 : 0) + gotCount * 40;
  const level = Math.floor(Math.sqrt(xp / 40)) + 1;
  const curBase = Math.pow(level - 1, 2) * 40;
  const nextBase = Math.pow(level, 2) * 40;
  const levelPct = nextBase > curBase ? Math.round(((xp - curBase) / (nextBase - curBase)) * 100) : 100;
  const score =
    group.expenses.length === 0 || Math.abs(myNet) < 0.01
      ? 100
      : Math.round(100 * (1 - Math.min(Math.abs(myNet) / (total || 1), 1)));

  return { score, xp, level, levelPct, achievements, gotCount, net: myNet };
}
