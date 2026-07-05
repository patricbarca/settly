import { useEffect, useState } from "react";
import { convertCurrency } from "./fx";

const KEY = "settly.fxCache"; // { "USD_EUR_2026-07-05": 0.92 }

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readCache(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* localStorage lleno o no disponible: no cachear, no es crítico */
  }
}

/** Tasa `from -> to`, cacheada 1 día (localStorage). Devuelve null si falla
 *  la conversión y no había nada cacheado. */
export async function getDailyRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  const key = `${from}_${to}_${today()}`;
  const cache = readCache();
  if (cache[key] != null) return cache[key];

  const res = await convertCurrency(1, from, to);
  if (!res) return null;
  cache[key] = res.rate;
  writeCache(cache);
  return res.rate;
}

/** Tasa de conversión `from -> to` para el día de hoy, cacheada en
 *  localStorage. `null` mientras carga o si from===to (rate=1, sin red). */
export function useDailyRate(from: string, to: string | undefined): number | null {
  const [rate, setRate] = useState<number | null>(!to || from === to ? 1 : null);

  useEffect(() => {
    if (!to || from === to) {
      setRate(1);
      return;
    }
    let alive = true;
    setRate(null);
    getDailyRate(from, to).then((r) => {
      if (alive) setRate(r);
    });
    return () => {
      alive = false;
    };
  }, [from, to]);

  return rate;
}
