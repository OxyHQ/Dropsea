/**
 * How sizes and dates read, as Finder writes them, in the person's language.
 * A list formats a date and a size on every row, so each formatter is made
 * once per language and kept: making one costs far more than using it (on
 * OxyOS it goes through the platform's ICU).
 */

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale} ${JSON.stringify(options)}`;
  const known = numberFormats.get(key);
  if (known) return known;
  const made = new Intl.NumberFormat(locale, options);
  numberFormats.set(key, made);
  return made;
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale} ${JSON.stringify(options)}`;
  const known = dateFormats.get(key);
  if (known) return known;
  const made = new Intl.DateTimeFormat(locale, options);
  dateFormats.set(key, made);
  return made;
}

const CLOCK: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const DAY: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const MONTH: Intl.DateTimeFormatOptions = { month: 'long' };
const YEAR: Intl.DateTimeFormatOptions = { year: 'numeric' };

export interface SizeUnits {
  bytes: (count: number) => string;
  kilobytes: string;
  megabytes: string;
  gigabytes: string;
  terabytes: string;
}

/** A size in decimal units, one decimal under 10 of a unit, the number in the locale's own digits. */
export function formatSize(bytes: number, units: SizeUnits, locale: string): string {
  if (bytes < 1000) return units.bytes(bytes);
  const steps = [units.kilobytes, units.megabytes, units.gigabytes, units.terabytes];
  let value = bytes / 1000;
  let step = 0;
  while (value >= 1000 && step < steps.length - 1) {
    value /= 1000;
    step++;
  }
  const digits = value < 10 ? 1 : 0;
  const number = numberFormat(locale, { maximumFractionDigits: digits }).format(value);
  return `${number} ${steps[step]}`;
}

export interface DayWords {
  today: (time: string) => string;
  yesterday: (time: string) => string;
}

function isSameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A date as Finder's list writes it: "Today at 10:04", "Yesterday at…", else the date and the time. */
export function formatDate(time: number, now: number, locale: string, words: DayWords): string {
  const date = new Date(time);
  const clock = dateFormat(locale, CLOCK).format(date);
  if (isSameDay(date, new Date(now))) return words.today(clock);
  if (isSameDay(date, new Date(now - DAY_MS))) return words.yesterday(clock);
  return `${dateFormat(locale, DAY).format(date)}, ${clock}`;
}

/** A day as Photos names a photo by it: "12 Mar 2026". */
export function formatDay(time: number, locale: string): string {
  return dateFormat(locale, DAY).format(new Date(time));
}

/** A month of this year as a group of items is headed by it: "October", "Octubre". */
export function formatMonth(month: number, locale: string): string {
  const name = dateFormat(locale, MONTH).format(new Date(2000, month, 1));
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

/** A year, in the locale's own digits. */
export function formatYear(year: number, locale: string): string {
  return dateFormat(locale, YEAR).format(new Date(year, 0, 1));
}

/** A share of a whole, as a progress reads: "45 %" or "45%", as the locale writes it. */
export function formatPercent(fraction: number, locale: string): string {
  return numberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    Math.min(1, Math.max(0, fraction)),
  );
}
