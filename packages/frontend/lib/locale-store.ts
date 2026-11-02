/**
 * The language Dropsea speaks: the one Oxy resolves for the person, given to
 * `OxyProvider language`'s `onChange` (oxy ADR 0022). Dropsea never works it
 * out itself; until Oxy says, it is the fallback.
 */
import { FALLBACK_LOCALE } from '@/lib/strings';

let currentLocale: string = FALLBACK_LOCALE;
const listeners = new Set<() => void>();

export function setLocale(locale: string): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  for (const listener of listeners) listener();
}

export function getLocale(): string {
  return currentLocale;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
