export type Category =
  | "comida"
  | "mercado"
  | "bebidas"
  | "transporte"
  | "viajes"
  | "alojamiento"
  | "ocio"
  | "compras"
  | "salud"
  | "servicios"
  | "suscripciones"
  | "seguros"
  | "prestamos"
  | "regalos"
  | "otros";

export type SplitMode = "equal" | "percent" | "exact" | "shares";
export type RecurrenceInterval = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurringExpense {
  id: string;
  label: string;
  amount: number;
  payerId: string;
  payments?: { memberId: string; amount: number }[];
  participantIds: string[];
  splits?: Record<string, number> | null;
  category: Category;
  interval: RecurrenceInterval;
  nextDate: string; // YYYY-MM-DD
  active: boolean;
}

export type PayType = "payid" | "bank" | "paypal" | "revolut" | "wise" | "bizum" | "bunq" | "other";

export interface PayMethod {
  type: PayType;
  value: string;
  /** Segundo campo del método (p. ej. nº de cuenta cuando type="bank";
   *  value guarda el BSB / sort code / routing según el país). */
  value2?: string;
}

export interface Member {
  id: string;
  name: string;
  avatar: string;
  /** Iniciales personalizadas (editables); si no, se derivan del nombre. */
  initials?: string;
  /** País de residencia (código ISO 3166-1 alpha-2, ej. "AU"). */
  country?: string;
  /** Teléfono en formato internacional E.164 (ej. "+61412345678"). */
  phone?: string;
  /** Método principal (compat. hacia atrás). Equivale a pays[0]. */
  pay?: PayMethod;
  /** Métodos de pago guardados por separado (PayID, banco, PayPal…). */
  pays?: PayMethod[];
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
  /** se pidió borrar el gasto; espera la aprobación del creador. */
  deleteRequested?: boolean;
  /** memberId de quien añadió el gasto (para el botón "Revisado"). */
  createdBy?: string;
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

export type NotificationType = "expense_added" | "payment_made" | "review_requested" | "delete_requested" | "recurring_generated";

export interface AppNotification {
  id: string;
  type: NotificationType;
  ts: string; // ISO
  /** Quién lo originó (para no notificarse a uno mismo). Se omite en eventos
   *  anónimos (solicitud de revisión) para preservar el anonimato. */
  actorId?: string;
  actorName?: string; // denormalizado para mostrar
  toId?: string;      // destinatario específico (delete_requested → el creador)
  toName?: string;    // destinatario del pago
  label?: string;     // etiqueta del gasto
  amount?: number;
  expenseId?: string; // para delete_requested
}

/** Registro de actividad (log). A diferencia de las notificaciones, incluye
 *  también las acciones propias y más tipos de evento. Vive en el JSON del
 *  grupo (group.activity) y se sincroniza por Realtime, igual que el resto. */
export type ActivityType =
  | "group_created"
  | "group_archived"
  | "group_unarchived"
  | "member_added"
  | "member_joined"
  | "member_removed"
  | "expense_added"
  | "expense_edited"
  | "expense_deleted"
  | "payment_made"
  | "marked_ready"
  | "unmarked_ready"
  | "review_requested"
  | "recurring_added"
  | "recurring_generated"
  | "recurring_deleted"
  | "scan_used";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  ts: string; // ISO
  actorId?: string;
  actorName?: string; // denormalizado para mostrar
  label?: string; // gasto / nombre de miembro / nombre de grupo
  amount?: number;
  toId?: string;   // id del destinatario (para mostrar "(tú)" si soy yo)
  toName?: string; // destinatario (pago / miembro afectado)
}

/** Tipo de grupo:
 *  - "trip": puntual (viaje/evento). Tiene "he agregado todo" + cierre/saldo.
 *  - "home": continuo (casa/piso). Sin "he agregado todo"; cuentas siempre vivas. */
export type GroupKind = "trip" | "home";

export interface Group {
  id: string;
  name: string;
  currency: string; // símbolo, ej. "€"
  kind?: GroupKind; // por defecto "trip" si falta
  /** true/undefined = pagos simplificados (mínimas transferencias);
   *  false = pagos directos (pagas a quien puso el dinero de cada gasto). */
  simplifyDebts?: boolean;
  meId: string; // quién soy yo
  /** userId del creador/dueño (solo él puede eliminar el grupo). Se rellena al
   *  cargar desde la columna owner_id; no forma parte real del JSON. */
  ownerId?: string;
  /** ISO de borrado lógico: el grupo está en la papelera (recuperable 7 días).
   *  Pasado el plazo, el dueño lo elimina definitivamente. Viaja en el JSON. */
  deletedAt?: string;
  members: Member[];
  expenses: Expense[];
  settlements?: Settlement[];
  archived?: boolean;
  /** memberIds que marcaron "ya agregué todos mis gastos" */
  ready?: string[];
  recurring?: RecurringExpense[];
  notifications?: AppNotification[];
  activity?: ActivityEvent[];
}

import type { IconName } from "../components/Icon";

export const CATEGORIES: { id: Category; icon: IconName }[] = [
  { id: "comida", icon: "food" },
  { id: "mercado", icon: "cart" },
  { id: "bebidas", icon: "drink" },
  { id: "transporte", icon: "transport" },
  { id: "viajes", icon: "plane" },
  { id: "alojamiento", icon: "home" },
  { id: "ocio", icon: "leisure" },
  { id: "compras", icon: "shopping" },
  { id: "salud", icon: "health" },
  { id: "servicios", icon: "bolt" },
  { id: "suscripciones", icon: "repeat" },
  { id: "seguros", icon: "lock" },
  { id: "prestamos", icon: "balance" },
  { id: "regalos", icon: "gift" },
  { id: "otros", icon: "other" },
];

export const catOf = (id: Category) =>
  CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
