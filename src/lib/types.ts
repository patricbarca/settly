export type Category =
  | "comida"
  | "transporte"
  | "alojamiento"
  | "ocio"
  | "compras"
  | "otros";

export type SplitMode = "equal" | "percent" | "exact" | "shares";

export type PayType = "payid" | "bank" | "paypal" | "revolut" | "wise" | "bizum" | "bunq" | "other";

export interface PayMethod {
  type: PayType;
  value: string;
}

export interface Member {
  id: string;
  name: string;
  avatar: string;
  pay?: PayMethod;
}

export interface Expense {
  id: string;
  label: string;
  amount: number;
  payerId: string;
  participantIds: string[];
  category: Category;
  date: string; // ISO YYYY-MM-DD
  note?: string;
  /** custom split memberId -> amount; null/undefined = partes iguales */
  splits?: Record<string, number> | null;
  /** multiple payers: who paid how much */
  payments?: { memberId: string; amount: number }[];
  reviewRequested?: boolean;
}

export interface Settlement {
  id: string;
  from: string; // memberId que paga
  to: string; // memberId que cobra
  amount: number;
  date: string;
  status: "pending" | "confirmed";
  proof?: string; // dataURL del comprobante (opcional)
}

export interface Group {
  id: string;
  name: string;
  currency: string; // símbolo, ej. "€"
  meId: string; // quién soy yo
  members: Member[];
  expenses: Expense[];
  settlements?: Settlement[];
  archived?: boolean;
  /** memberIds que marcaron "ya agregué todos mis gastos" */
  ready?: string[];
}

import type { IconName } from "../components/Icon";

export const CATEGORIES: { id: Category; icon: IconName }[] = [
  { id: "comida", icon: "food" },
  { id: "transporte", icon: "transport" },
  { id: "alojamiento", icon: "home" },
  { id: "ocio", icon: "leisure" },
  { id: "compras", icon: "shopping" },
  { id: "otros", icon: "other" },
];

export const catOf = (id: Category) =>
  CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
