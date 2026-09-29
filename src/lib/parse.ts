import type { Category, Member, RecurrenceInterval } from "./types";

// Diferenciador de Settlia: convierte lenguaje natural en un gasto estructurado.
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
  /** Moneda ISO detectada (solo la vía IA la rellena; el parser local de
   *  regex asume siempre la moneda del grupo). */
  currency?: string;
  payerId: string;
  payments?: { memberId: string; amount: number }[];
  participantIds: string[];
  /** Reparto DESIGUAL en porcentaje por persona ("supermarket 150 60% yo").
   *  Ausente = a partes iguales. Siempre cubre a todos los participantes y
   *  suma 100; el reparto en euros lo hace el formulario. */
  percents?: Record<string, number>;
  category: Category;
  interval?: RecurrenceInterval;
}

const firstName = (m: Member) => m.name.trim().split(/\s+/)[0].toLowerCase();

const ME_WORDS = /^(yo|me|m[ií]|mine|myself|i)$/i;

/** Extrae los porcentajes atados a una persona: "60% yo", "yo 60%", "40% Ana".
 *  Orden de búsqueda: primero el token PEGADO por delante, luego hasta 3 por
 *  detrás. Ese orden es el que resuelve "yo 60% Emma 40%" — con la búsqueda
 *  hacia delante primero, el 60% se lo llevaba Emma. Mirar hacia atrás solo a
 *  distancia 1 evita el fallo simétrico en "Emma 150 60% yo", donde un nombre
 *  lejano no tiene nada que ver con el porcentaje. Una persona ya asignada no
 *  se reclama dos veces, que es lo que encadena "60% yo 40% Emma". */
function extractPercents(
  text: string,
  members: Member[],
  meId: string
): Record<string, number> {
  const out: Record<string, number> = {};
  // "60 %" y "60%" son lo mismo; se pega para tokenizar de una pieza.
  const toks = (text.toLowerCase().replace(/(\d)\s*%/g, "$1%").match(/\S+/g) || [])
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%]+$/gu, ""));

  const personAt = (i: number): string | null => {
    const w = (toks[i] || "").replace(/[^\p{L}]/gu, "");
    if (!w) return null;
    if (ME_WORDS.test(w)) return meId;
    const m = members.find((x) => firstName(x) === w);
    return m ? m.id : null;
  };

  // Si la nota habla de QUIEN PAGÓ, este parser no intenta el reparto desigual.
  // Un "60%" puede ser cuánto puso alguien o cuánto le toca, y mezclado con un
  // verbo de pago ("pagó Emma, 60% yo 40% ella") no hay forma fiable de saberlo
  // con regex. Vale más quedarse a partes iguales —que el usuario ve y corrige—
  // que repartir el dinero mal. El LLM, que sí modela pagadores, lo resuelve.
  if (/\b(pagu[eé]|pag[oó]|pagaron|pagamos|paid|pays?|puse|puso|abon[eéoó])\b/i.test(text)) return out;

  toks.forEach((tok, i) => {
    const m = tok.match(/^(\d+(?:[.,]\d+)?)%$/);
    if (!m) return;
    const pct = Number(m[1].replace(",", "."));
    if (!(pct > 0)) return;
    const free = (x: string | null) => (x && out[x] === undefined ? x : null);
    let id: string | null = free(personAt(i - 1));
    for (let j = i + 1; j <= i + 3 && !id; j++) id = free(personAt(j));
    if (id) out[id] = pct;
  });
  return out;
}

export function parseExpense(
  text: string,
  members: Member[],
  meId: string
): ParsedExpense {
  const t = " " + text.toLowerCase() + " ";

  // Monto: el número más grande del texto, IGNORANDO porcentajes (números
  // seguidos de %, que son reparto — "60% / 40%" — no el importe). Sin esto,
  // "supermarket 45, yo 60% el otro 40%" agarraba el 60 en vez del 45.
  const noPct = text.replace(/\d+(?:[.,]\d+)?\s*%/g, " ");
  const nums = (noPct.match(/\d+(?:[.,]\d+)?/g) || []).map((s) =>
    Number(s.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."))
  );
  const amount = nums.length ? Math.max(...nums) : 0;

  // Reparto por porcentajes ("60% yo"), si lo hay.
  const pct = extractPercents(text, members, meId);
  const pctIds = Object.keys(pct);

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

  // "cada uno / c/u / por cabeza / each / apiece" → el monto es POR PERSONA:
  // el total = monto × nº de participantes. ("each day/week/..." es recurrencia,
  // no por persona, así que lo excluimos.)
  const perPerson =
    /\bcada\s+un[oa]\b|\bc\/u\b|\bpor\s+cabeza\b|\bpor\s+persona\b|\bapiece\b|\bper\s+person\b|\bper\s+head\b|\beach\b(?!\s+(day|week|month|year|d[ií]a|semana|mes|a[ñn]o))/i.test(
      t
    );
  const finalAmount = perPerson && participants.length > 0 ? amount * participants.length : amount;

  // Quien lleva un porcentaje participa aunque no se le nombre de otra forma.
  for (const id of pctIds) {
    if (!participants.some((p) => p.id === id)) {
      const m = members.find((x) => x.id === id);
      if (m) participants.push(m);
    }
  }

  // Porcentajes → reparto completo sobre TODOS los participantes, sumando 100.
  //  · "150 60% yo" en un grupo de 2 → yo 60, el otro 40.
  //  · en un grupo de 5 → yo 60 y el 40 restante a partes iguales entre los 4.
  // Lo que sobra (o falta) se reparte entre quien no tiene porcentaje explícito;
  // si no queda nadie, se normaliza para que siempre cuadre a 100.
  let percents: Record<string, number> | undefined;
  if (pctIds.length > 0) {
    const ids = participants.map((p) => p.id);
    const assigned = ids.filter((id) => pct[id] !== undefined);
    const rest = ids.filter((id) => pct[id] === undefined);
    const sum = assigned.reduce((a, id) => a + pct[id], 0);
    const result: Record<string, number> = {};
    for (const id of assigned) result[id] = pct[id];
    if (rest.length > 0 && sum < 100) {
      const each = (100 - sum) / rest.length;
      for (const id of rest) result[id] = each;
    } else {
      for (const id of rest) result[id] = 0;
      if (sum !== 100 && sum > 0) {
        for (const id of assigned) result[id] = (pct[id] / sum) * 100;
      }
    }
    percents = result;
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
    .replace(/\d+(?:[.,]\d+)?\s*%/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(€|eur|euros?|\$|usd|aud|gbp|cad|chf|mxn|brl|cop|ars|jpy|cny)?\b/gi, " ")
    .replace(names, " ")
    .replace(/\bc\/u\b/gi, " ")
    .replace(/\b(con|y|e|pagu[eé]|pag[oó]|entre|todos|todas|grupo|yo|me|mi|del|la|el|los|las|un|una|para|por|cabeza|persona|apiece|paid|pay|puse|puso|ella|ellos|ellas|she|he|her|him|they|them|all|everyone|all of us|nosotros|daily|weekly|monthly|yearly|diario|diaria|semanal|mensual|anual|cada d[ií]a|cada semana|cada mes|cada a[ñn]o|cada un[oa]|annual|annually|every|per|each|month|months|week|weeks|year|years|day|days|mes|semana|a[ñn]o)\b/gi, " ")
    .replace(/(^|\s)[^\p{L}\p{N}]+(?=\s|$)/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  label = label.split(/\s+/).slice(0, 5).join(" ");
  label = label ? label.charAt(0).toUpperCase() + label.slice(1) : "Gasto";

  return {
    label,
    amount: finalAmount,
    payerId,
    participantIds: participants.map((p) => p.id),
    percents,
    category,
    interval,
  };
}
