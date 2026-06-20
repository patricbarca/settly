export interface Currency {
  code: string;
  symbol: string;
  name: string;
  decimals?: number; // por defecto 2; 0 para divisas sin céntimos
}

// ~30 divisas frecuentes (con foco en las que pidió el usuario + viajes habituales).
export const CURRENCIES: Currency[] = [
  { code: "AUD", symbol: "A$", name: "Dólar australiano" },
  { code: "USD", symbol: "$", name: "Dólar estadounidense" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "Libra esterlina" },
  { code: "CLP", symbol: "$", name: "Peso chileno", decimals: 0 },
  { code: "PEN", symbol: "S/", name: "Sol peruano" },
  { code: "ARS", symbol: "AR$", name: "Peso argentino" },
  { code: "MXN", symbol: "MX$", name: "Peso mexicano" },
  { code: "COP", symbol: "COL$", name: "Peso colombiano", decimals: 0 },
  { code: "BRL", symbol: "R$", name: "Real brasileño" },
  { code: "UYU", symbol: "$U", name: "Peso uruguayo" },
  { code: "CAD", symbol: "C$", name: "Dólar canadiense" },
  { code: "NZD", symbol: "NZ$", name: "Dólar neozelandés" },
  { code: "JPY", symbol: "¥", name: "Yen japonés", decimals: 0 },
  { code: "CNY", symbol: "CN¥", name: "Yuan chino" },
  { code: "INR", symbol: "₹", name: "Rupia india" },
  { code: "CHF", symbol: "CHF", name: "Franco suizo" },
  { code: "SEK", symbol: "kr", name: "Corona sueca" },
  { code: "NOK", symbol: "kr", name: "Corona noruega" },
  { code: "DKK", symbol: "kr", name: "Corona danesa" },
  { code: "PLN", symbol: "zł", name: "Złoty polaco" },
  { code: "TRY", symbol: "₺", name: "Lira turca" },
  { code: "ZAR", symbol: "R", name: "Rand sudafricano" },
  { code: "AED", symbol: "AED", name: "Dírham (EAU)" },
  { code: "SGD", symbol: "S$", name: "Dólar de Singapur" },
  { code: "HKD", symbol: "HK$", name: "Dólar de Hong Kong" },
  { code: "THB", symbol: "฿", name: "Baht tailandés" },
  { code: "KRW", symbol: "₩", name: "Won surcoreano", decimals: 0 },
  { code: "VND", symbol: "₫", name: "Dong vietnamita", decimals: 0 },
  { code: "IDR", symbol: "Rp", name: "Rupia indonesia", decimals: 0 },
  { code: "MYR", symbol: "RM", name: "Ringgit malayo" },
  { code: "PHP", symbol: "₱", name: "Peso filipino" },
];

export const currencyOf = (code: string): Currency =>
  CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];

export const currencySymbol = (code: string): string => currencyOf(code).symbol;

/** Returns the currency name localised to the given BCP-47 locale tag. */
export function localCurrencyName(code: string, locale: string): string {
  try {
    const dn = new Intl.DisplayNames([locale], { type: "currency" });
    const raw = dn.of(code) ?? code;
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  } catch {
    return CURRENCIES.find((c) => c.code === code)?.name ?? code;
  }
}

/** Resolve a stored value that may be a legacy symbol (e.g. "€") or a code (e.g. "EUR"). */
export function resolveToCode(value: string): string {
  if (CURRENCIES.find((c) => c.code === value)) return value;
  return CURRENCIES.find((c) => c.symbol === value)?.code ?? value;
}

