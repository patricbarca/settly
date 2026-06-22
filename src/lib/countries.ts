// Lista de países (códigos ISO + nombre localizado + prefijo telefónico) y
// validación de teléfono, sobre libphonenumber-js. Los nombres se localizan con
// Intl.DisplayNames, así no mantenemos una tabla de nombres a mano.
import { getCountries, getCountryCallingCode, isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";

export type CountryOpt = { code: string; name: string; dial: string };

export function countryList(lang: string): CountryOpt[] {
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames([lang], { type: "region" });
  } catch {
    dn = null;
  }
  return getCountries()
    .map((code) => ({
      code,
      name: (dn && dn.of(code)) || code,
      dial: getCountryCallingCode(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

export function countryName(code?: string, lang = "es"): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

export function dialCode(country?: string): string {
  if (!country) return "";
  try {
    return getCountryCallingCode(country as CountryCode);
  } catch {
    return "";
  }
}

/** ¿El teléfono tiene un formato válido para ese país? (No verifica propiedad.) */
export function isValidPhone(phone: string, country?: string): boolean {
  if (!phone.trim()) return false;
  try {
    return isValidPhoneNumber(phone, country as CountryCode | undefined);
  } catch {
    return false;
  }
}

/** Normaliza a E.164 (ej. "+61412345678") si se puede; si no, devuelve el original. */
export function normalizePhone(phone: string, country?: string): string {
  try {
    const p = parsePhoneNumberFromString(phone, country as CountryCode | undefined);
    return p ? p.number : phone.trim();
  } catch {
    return phone.trim();
  }
}
