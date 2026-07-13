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
  payments?: { memberId: string; amount: number }[] | null;
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
  /** false = alta manual sin cuenta todavía; undefined/true = tiene cuenta vinculada. */
  claimed?: boolean;
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
  /** multiple payers: who paid how much (null en un patch = limpiar) */
  payments?: { memberId: string; amount: number }[] | null;
  reviewRequested?: boolean;
  /** se pidió borrar el gasto; espera la aprobación del creador. */
  deleteRequested?: boolean;
  /** memberId de quien añadió el gasto (para el botón "Revisado"). */
  createdBy?: string;
  /** Si true, cualquier participante puede editar este gasto (no solo quien
   *  lo creó). Por defecto false/undefined = solo el creador puede editarlo. */
  allowEdits?: boolean;
  /** Desglose por ítem/plato (gastos escaneados o repartidos por línea). Si
   *  existe, el gasto se edita con el editor por ítem en vez del de totales. */
  items?: ExpenseItem[];
  /** Recargos del ticket (surcharge), repartidos proporcional al consumo.
   *  `originalAmount`: monto tal cual detectado en el ticket (antes de
   *  convertir), si el escaneo detectó una moneda distinta a la del grupo. */
  fees?: { name: string; amount: number; originalAmount?: number }[];
  /** Propina, repartida en partes iguales entre quienes consumieron. */
  tip?: number;
  /** Ruta en Supabase Storage (bucket `receipts`) de la foto del ticket. */
  receiptPath?: string;
  /** Conversión de divisas (Pro): monto y moneda originales del ticket
   *  escaneado, si distinta a la del grupo, más la tasa usada. `amount` ya
   *  queda convertido a la moneda del grupo. */
  originalAmount?: number;
  originalCurrency?: string;
  fxRate?: number;
}

/** Una línea de un gasto repartido por ítem: precio + quiénes lo comparten. */
export interface ExpenseItem {
  name: string;
  price: number;
  participantIds: string[];
  /** Precio tal cual detectado en el ticket (antes de convertir), si el
   *  escaneo detectó una moneda distinta a la del grupo — permite validar el
   *  escaneo mostrando los montos reales del recibo, no una reconversión. */
  originalPrice?: number;
}

export interface Settlement {
  id: string;
  from: string; // memberId que paga
  to: string; // memberId que cobra
  amount: number;
  date: string;
  status: "pending" | "confirmed";
  proof?: string; // dataURL del comprobante (opcional)
  /** Gastos concretos que cubre este pago (solo modo Directo — en Simplificado
   *  la transferencia es una optimización agregada que no siempre corresponde
   *  a gastos reales compartidos entre estas dos personas). Al confirmarse,
   *  esos gastos se marcan como pagados por `from` en el listado de gastos. */
  expenseIds?: string[];
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
  | "member_left"
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
  /** Segunda moneda del grupo (Pro): permite ver todos los montos
   *  convertidos a esta moneda con el toggle de GroupSettings. Todos los
   *  gastos se siguen guardando en `currency`; esto es solo de visualización. */
  secondaryCurrency?: string;
  /** Moneda activa para mostrar: `currency` o `secondaryCurrency`. Por
   *  defecto `currency` si falta. */
  displayCurrency?: string;
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
