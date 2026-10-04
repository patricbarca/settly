import type { Category } from "./types";

// Comercios conocidos → categoría, para que un pago de Wallet ("WOOLWORTHS
// YEERONGPILLY") se clasifique bien sin gastar IA, incluso offline.
//
// Se busca en TODOS los países, pero el país del grupo va primero: así un viaje
// a Japón con un grupo en AUD sigue reconociendo "Lawson" o "FamilyMart", y en
// el raro caso de un nombre que significa cosas distintas según el país, gana
// el del grupo. El país se deduce de la moneda del grupo (no guardamos otro).

type Entry = { name: string; re: RegExp; category: Category; countries: string[] };

const E = (name: string, re: RegExp, category: Category, countries: string[]): Entry => ({ name, re, category, countries });

const KNOWN: Entry[] = [
  // ── Supermercados ──
  E("Woolworths", /\bwool(worths|ies)\b/i, "mercado", ["AU", "NZ"]),
  E("Coles", /\bcoles\b(?! express)/i, "mercado", ["AU"]),
  E("Aldi", /\baldi\b/i, "mercado", ["AU", "UK", "US", "DE", "ES", "IT", "FR"]),
  E("IGA", /\biga\b/i, "mercado", ["AU"]),
  E("Harris Farm", /\bharris farm\b/i, "mercado", ["AU"]),
  E("Costco", /\bcostco\b/i, "mercado", ["AU", "US", "UK", "ES", "MX", "JP"]),
  E("Countdown", /\bcountdown\b/i, "mercado", ["NZ"]),
  E("New World", /\bnew world\b/i, "mercado", ["NZ"]),
  E("Pak'nSave", /\bpak ?n ?save\b/i, "mercado", ["NZ"]),
  E("Mercadona", /\bmercadona\b/i, "mercado", ["ES"]),
  E("Lidl", /\blidl\b/i, "mercado", ["ES", "UK", "DE", "FR", "IT", "PT"]),
  E("Carrefour", /\bcarrefour\b/i, "mercado", ["ES", "FR", "IT", "AR", "BR"]),
  E("Dia", /\b(dia|supermercados dia)\b/i, "mercado", ["ES", "AR"]),
  E("Eroski", /\beroski\b/i, "mercado", ["ES"]),
  E("Alcampo", /\balcampo\b/i, "mercado", ["ES"]),
  E("Consum", /\bconsum\b/i, "mercado", ["ES"]),
  E("Tesco", /\btesco\b/i, "mercado", ["UK"]),
  E("Sainsbury's", /\bsainsbury/i, "mercado", ["UK"]),
  E("Asda", /\basda\b/i, "mercado", ["UK"]),
  E("Waitrose", /\bwaitrose\b/i, "mercado", ["UK"]),
  E("Walmart", /\bwal-?mart\b/i, "mercado", ["US", "MX"]),
  E("Trader Joe's", /\btrader joe/i, "mercado", ["US"]),
  E("Whole Foods", /\bwhole foods\b/i, "mercado", ["US"]),
  E("Kroger", /\bkroger\b/i, "mercado", ["US"]),
  E("Safeway", /\bsafeway\b/i, "mercado", ["US"]),
  E("Soriana", /\bsoriana\b/i, "mercado", ["MX"]),
  E("Chedraui", /\bchedraui\b/i, "mercado", ["MX"]),
  E("Jumbo", /\bjumbo\b/i, "mercado", ["CL", "AR", "CO"]),
  E("Lider", /\blider\b/i, "mercado", ["CL"]),
  E("Éxito", /\bexito\b/i, "mercado", ["CO"]),
  E("Pingo Doce", /\bpingo doce\b/i, "mercado", ["PT"]),
  E("Continente", /\bcontinente\b/i, "mercado", ["PT"]),
  E("Rewe", /\brewe\b/i, "mercado", ["DE"]),
  E("Edeka", /\bedeka\b/i, "mercado", ["DE"]),
  E("Esselunga", /\besselunga\b/i, "mercado", ["IT"]),
  E("Conad", /\bconad\b/i, "mercado", ["IT"]),
  E("7-Eleven", /\b7[- ]?eleven\b/i, "mercado", ["AU", "US", "JP", "MX"]),
  E("Lawson", /\blawson\b/i, "mercado", ["JP"]),
  E("FamilyMart", /\bfamily ?mart\b/i, "mercado", ["JP"]),
  // ── Transporte y combustible ──
  E("Uber", /\buber(?! ?eats)\b/i, "transporte", []),
  E("DiDi", /\bdidi\b/i, "transporte", []),
  E("Cabify", /\bcabify\b/i, "transporte", ["ES", "MX", "AR", "CL", "CO"]),
  E("Bolt", /\bbolt\b/i, "transporte", ["ES", "UK", "PT", "DE"]),
  E("Lyft", /\blyft\b/i, "transporte", ["US"]),
  E("BP", /\bbp\b/i, "transporte", ["AU", "UK", "NZ", "DE"]),
  E("Shell", /\bshell\b/i, "transporte", []),
  E("Coles Express", /\b(coles|reddy) express\b/i, "transporte", ["AU"]),
  E("Ampol", /\bampol\b/i, "transporte", ["AU"]),
  E("Caltex", /\bcaltex\b/i, "transporte", ["AU"]),
  E("Repsol", /\brepsol\b/i, "transporte", ["ES"]),
  E("Cepsa", /\b(cepsa|moeve)\b/i, "transporte", ["ES"]),
  E("Opal", /\bopal\b/i, "transporte", ["AU"]),
  E("Translink", /\btranslink\b/i, "transporte", ["AU"]),
  E("Renfe", /\brenfe\b/i, "transporte", ["ES"]),
  E("TfL", /\b(tfl|transport for london)\b/i, "transporte", ["UK"]),
  // ── Comida y bebida ──
  E("Uber Eats", /\buber ?eats\b/i, "comida", []),
  E("DoorDash", /\bdoordash\b/i, "comida", []),
  E("Menulog", /\bmenulog\b/i, "comida", ["AU"]),
  E("Glovo", /\bglovo\b/i, "comida", ["ES", "PT", "IT"]),
  E("Just Eat", /\bjust ?eat\b/i, "comida", ["ES", "UK"]),
  E("Deliveroo", /\bdeliveroo\b/i, "comida", ["UK", "FR", "IT"]),
  E("Rappi", /\brappi\b/i, "comida", ["MX", "CO", "AR", "CL"]),
  E("McDonald's", /\bmc ?donald/i, "comida", []),
  E("KFC", /\bkfc\b/i, "comida", []),
  E("Hungry Jack's", /\bhungry jack/i, "comida", ["AU"]),
  E("Burger King", /\bburger king\b/i, "comida", []),
  E("Subway", /\bsubway\b/i, "comida", []),
  E("Domino's", /\bdomino/i, "comida", []),
  E("Guzman y Gomez", /\bguzman\b/i, "comida", ["AU"]),
  E("Starbucks", /\bstarbucks\b/i, "comida", []),
  E("Dan Murphy's", /\bdan murph/i, "bebidas", ["AU"]),
  E("BWS", /\bbws\b/i, "bebidas", ["AU"]),
  E("Liquorland", /\bliquorland\b/i, "bebidas", ["AU"]),
  // ── Salud ──
  E("Chemist Warehouse", /\bchemist warehouse\b/i, "salud", ["AU"]),
  E("Priceline", /\bpriceline pharmacy\b/i, "salud", ["AU"]),
  E("Boots", /\bboots\b/i, "salud", ["UK"]),
  E("CVS", /\bcvs\b/i, "salud", ["US"]),
  E("Walgreens", /\bwalgreens\b/i, "salud", ["US"]),
  // ── Compras ──
  E("Bunnings", /\bbunnings\b/i, "compras", ["AU", "NZ"]),
  E("Kmart", /\bkmart\b/i, "compras", ["AU", "NZ"]),
  E("Big W", /\bbig w\b/i, "compras", ["AU"]),
  E("Target", /\btarget\b/i, "compras", ["AU", "US"]),
  E("JB Hi-Fi", /\bjb ?hi-?fi\b/i, "compras", ["AU", "NZ"]),
  E("IKEA", /\bikea\b/i, "compras", []),
  E("Amazon", /\bamazon\b|\bamzn\b/i, "compras", []),
  E("El Corte Inglés", /\bcorte ingles\b/i, "compras", ["ES"]),
  E("Zara", /\bzara\b/i, "compras", []),
  E("Decathlon", /\bdecathlon\b/i, "compras", []),
  // ── Alojamiento / viaje ──
  E("Airbnb", /\bairbnb\b/i, "alojamiento", []),
  E("Booking.com", /\bbooking\.?com\b/i, "alojamiento", []),
  E("Qantas", /\bqantas\b/i, "viajes", ["AU"]),
  E("Virgin Australia", /\bvirgin australia\b/i, "viajes", ["AU"]),
  E("Jetstar", /\bjetstar\b/i, "viajes", ["AU", "NZ", "JP"]),
  E("Ryanair", /\bryanair\b/i, "viajes", ["ES", "UK", "IT", "PT", "DE", "FR"]),
  E("Vueling", /\bvueling\b/i, "viajes", ["ES"]),
  E("Iberia", /\biberia\b/i, "viajes", ["ES"]),
  // ── Suscripciones ──
  E("Netflix", /\bnetflix\b/i, "suscripciones", []),
  E("Spotify", /\bspotify\b/i, "suscripciones", []),
];

/** País "de casa" del grupo, deducido de su moneda. */
const CURRENCY_COUNTRY: Record<string, string> = {
  AUD: "AU", NZD: "NZ", GBP: "UK", USD: "US", MXN: "MX", ARS: "AR", CLP: "CL",
  COP: "CO", BRL: "BR", JPY: "JP", EUR: "ES",
};

export function countryForCurrency(currency: string | undefined): string | undefined {
  const code = (currency || "").toUpperCase().match(/[A-Z]{3}/)?.[0];
  return code ? CURRENCY_COUNTRY[code] : undefined;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Comercio conocido en el texto. Gana el que es del país del grupo; si no
 *  hay ninguno del país, el primero que coincida en cualquier país (viajes). */
export function knownMerchant(text: string, country?: string): { name: string; category: Category } | null {
  const t = norm(text);
  const hits = KNOWN.filter((e) => e.re.test(t));
  if (!hits.length) return null;
  const local = country ? hits.find((e) => e.countries.includes(country)) : undefined;
  const best = local ?? hits[0];
  return { name: best.name, category: best.category };
}

/** Clave estable de un comercio para la memoria del grupo: la cadena si es
 *  conocida ("woolworths" vale para todas sus tiendas); si no, las dos
 *  primeras palabras sin números ni signos. */
export function merchantKey(text: string): string {
  const known = knownMerchant(text);
  if (known) return norm(known.name).replace(/[^a-z0-9]+/g, " ").trim();
  return norm(text)
    .replace(/[^a-z\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .join(" ");
}

/** "WOOLWORTHS YEERONGPILLY" → "Woolworths Yeerongpilly" para la descripción
 *  cuando no hay ni memoria ni comercio conocido. */
export function prettyMerchant(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
