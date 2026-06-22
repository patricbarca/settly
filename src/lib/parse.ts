import type { Category, Member, RecurrenceInterval } from "./types";

// Diferenciador de cow.ai: convierte lenguaje natural en un gasto estructurado.
// Esta es la versión LOCAL (sin IA, gratis, funciona offline). El plan es
// sustituirla/ampliarla con un LLM (voz → gasto) desde un backend con tu clave.

const CAT_KW: [RegExp, Category][] = [
  [/cervez|vino|copas?|\bbar\b|pub|cocktail|c[oó]ctel|\bgin\b|\bron\b|whisky|bebidas?|trago/i, "bebidas"],
  [/desayun|almuerz|comid|cen[ao]|caf[eé]|restaurante|pizza|sushi|tapas|brunch|hamburg|kebab|taco|men[uú]/i, "comida"],
  [/s[uú]per|supermercado|mercado|verdur|frut|carnicer|panader|grocer/i, "mercado"],
  [/farmac|m[eé]dico|doctor|hospital|dentista|salud|medicina|gimnasio|\bgym\b|cl[ií]nica/i, "salud"],
  [/vuelo|avi[oó]n|crucero|\bviaje|excursi[oó]n/i, "viajes"],
  [/taxi|uber|cabify|bus|tren|gasolina|peaje|parking|metro|billete|combustible|nafta/i, "transporte"],
  [/hotel|airbnb|hostal|aloja|\bnoche?s?\b|apartamento|alquiler|renta/i, "alojamiento"],
  [/internet|\bluz\b|\bagua\b|\bgas\b|factura|suscrip|netflix|spotify|tel[eé]fono|m[oó]vil|servicio|recibo/i, "servicios"],
  [/regalo|gift|cumplea|aniversario/i, "regalos"],
  [/entrada|tour|museo|cine|concierto|fiesta|disco|ocio|teatro|evento|parque/i, "ocio"],
  [/compra|tienda|ropa|zapat|amazon|electr[oó]nica/i, "compras"],
];

export interface ParsedExpense {
  label: string;
  amount: number;
  payerId: string;
  payments?: { memberId: string; amount: number }[];
  participantIds: string[];
  category: Category;
  interval?: RecurrenceInterval;
}

const firstName = (m: Member) => m.name.trim().split(/\s+/)[0].toLowerCase();

export function parseExpense(
  text: string,
  members: Member[],
  meId: string
): ParsedExpense {
  const t = " " + text.toLowerCase() + " ";

  // Monto: el número más grande del texto.
  const nums = (text.match(/\d+(?:[.,]\d+)?/g) || []).map((s) =>
    Number(s.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."))
  );
  const amount = nums.length ? Math.max(...nums) : 0;

  // Participantes: miembros cuyo nombre aparece en el texto.
  let participants = members.filter((m) => t.includes(" " + firstName(m)));
  if (/\btodos\b|\bgrupo\b|\ball\b|\beveryone\b|\ball of us\b|\bnosotros\b|\btodas\b/.test(t)) participants = [...members];

  // Intervalo de recurrencia.
  let interval: RecurrenceInterval | undefined;
  if (/\bdaily\b|\bdiari[ao]\b|cada d[ií]a|(every|per|each)\s+day|al d[ií]a/.test(t)) interval = "daily";
  else if (/\bweekly\b|\bsemanal\b|cada semana|(every|per|each)\s+week|(a la|por) semana/.test(t)) interval = "weekly";
  else if (/\bmonthly\b|\bmensual(es)?\b|cada mes|(every|per|each)\s+month|(al|por) mes/.test(t)) interval = "monthly";
  else if (/\byearly\b|\banual(es)?\b|\bannual(ly)?\b|cada a[ñn]o|(every|per|each)\s+year|(al|por) a[ñn]o/.test(t)) interval = "yearly";

  // Pagador: "pagó <nombre>" / "yo" / "pagué".
  let payerId: string | null = null;
  const payMatch = t.match(/pag[oó]\s+([a-záéíóúñ]+)/i);
  if (payMatch) {
    const m = members.find((x) => firstName(x) === payMatch[1]);
    if (m) payerId = m.id;
  }
  if (!payerId && /pagu[eé]|\byo\b|\bmi[oa]s?\b|invit[eé]/.test(t)) payerId = meId;
  if (!payerId) payerId = meId;

  // Si no se nombró a nadie, asumimos todo el grupo.
  if (participants.length === 0) participants = [...members];
  // El pagador siempre participa salvo que se diga lo contrario.
  if (!participants.find((p) => p.id === payerId)) {
    const payer = members.find((m) => m.id === payerId);
    if (payer) participants = [payer, ...participants];
  }

  // Categoría.
  let category: Category = "otros";
  for (const [re, cat] of CAT_KW) {
    if (re.test(text)) {
      category = cat;
      break;
    }
  }

  // Etiqueta: limpiamos números, conectores y nombres.
  const names = new RegExp(
    "\\b(" + members.map((m) => firstName(m)).join("|") + ")\\b",
    "gi"
  );
  let label = text
    .replace(/\d+(?:[.,]\d+)?\s*(€|eur|euros?|\$|usd|aud|gbp|cad|chf|mxn|brl|cop|ars|jpy|cny)?\b/gi, " ")
    .replace(names, " ")
    .replace(/\b(con|y|e|pagu[eé]|pag[oó]|entre|todos|todas|grupo|yo|de|del|la|el|los|las|un|una|para|por|all|everyone|all of us|nosotros|daily|weekly|monthly|yearly|diario|diaria|semanal|mensual|anual|cada d[ií]a|cada semana|cada mes|cada a[ñn]o|annual|annually|every|per|each|month|months|week|weeks|year|years|day|days|mes|semana|a[ñn]o)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  label = label.split(/\s+/).slice(0, 5).join(" ");
  label = label ? label.charAt(0).toUpperCase() + label.slice(1) : "Gasto";

  return {
    label,
    amount,
    payerId,
    participantIds: participants.map((p) => p.id),
    category,
    interval,
  };
}
