import { describe, expect, test } from 'bun:test';
import {
  formatDate,
  formatDay,
  formatMonth,
  formatPercent,
  formatSize,
  formatYear,
} from '@/lib/format';
import { stringsFor } from '@/lib/strings';

describe('the headers of groups by date', () => {
  test('a month by its name, capitalised as a header is; a year in the locale’s digits', () => {
    expect(formatMonth(9, 'en')).toBe('October');
    expect(formatMonth(9, 'es')).toBe('Octubre');
    expect(formatYear(2025, 'en')).toBe('2025');
  });
});

describe('sizes', () => {
  test('read in decimal units, one decimal under ten', () => {
    const words = stringsFor('en');
    expect(formatSize(1, words.units, 'en')).toBe('1 byte');
    expect(formatSize(999, words.units, 'en')).toBe('999 bytes');
    expect(formatSize(1_500, words.units, 'en')).toBe('1.5 KB');
    expect(formatSize(38_912, words.units, 'en')).toBe('39 KB');
    expect(formatSize(1_840_000_000, words.units, 'en')).toBe('1.8 GB');
  });

  test('use the decimal comma in Spanish', () => {
    expect(formatSize(1_500, stringsFor('es').units, 'es-ES')).toBe('1,5 KB');
  });
});

describe('dates', () => {
  const now = new Date(2026, 9, 30, 15, 0).getTime();
  const morning = new Date(2026, 9, 30, 9, 5).getTime();
  const lastNight = new Date(2026, 9, 29, 22, 0).getTime();

  test('read as Today and Yesterday, else the date and the time', () => {
    const words = stringsFor('en-US');
    expect(formatDate(morning, now, 'en-US', words)).toMatch(/^Today at 9:05/);
    expect(formatDate(lastNight, now, 'en-US', words)).toMatch(/^Yesterday at 10:00/);
    expect(formatDate(new Date(2026, 0, 2, 10, 0).getTime(), now, 'en-US', words)).toMatch(
      /Jan 2, 2026/,
    );
  });

  test('read in Spanish with the 24-hour clock', () => {
    const words = stringsFor('es-ES');
    expect(formatDate(morning, now, 'es-ES', words)).toBe('Hoy a las 9:05');
    expect(formatDate(lastNight, now, 'es-ES', words)).toBe('Ayer a las 22:00');
    expect(formatDay(new Date(2026, 0, 2).getTime(), 'es-ES')).toBe('2 ene 2026');
  });
});

describe('percentages', () => {
  test('read as the locale writes them, a whole at most', () => {
    expect(formatPercent(0.456, 'en')).toBe('46%');
    // Spanish keeps a no-break space before the sign.
    expect(formatPercent(0.456, 'es-ES')).toBe('46\u00a0%');
    expect(formatPercent(2, 'en')).toBe('100%');
  });
});

describe('the words', () => {
  test('are English or Spanish, with every key in both', () => {
    const english = stringsFor('en-US');
    const spanish = stringsFor('es_ES');
    expect(english.trash).toBe('Trash');
    expect(spanish.trash).toBe('Papelera');
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, inner]) =>
        inner && typeof inner === 'object'
          ? keys(inner).map((nested) => `${key}.${nested}`)
          : [key],
      );
    expect(keys(spanish).sort()).toEqual(keys(english).sort());
    expect(spanish.items(1)).toBe('1 elemento');
    expect(english.selected(2, 5)).toBe('2 of 5 selected');
  });
});

describe('a list of rows', () => {
  test('makes each formatter once per language, however many rows it formats', () => {
    const words = stringsFor('fr');
    const made = { dates: 0, numbers: 0 };
    const { DateTimeFormat, NumberFormat } = Intl;
    const countingDates = new Proxy(DateTimeFormat, {
      construct(target, args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
        made.dates += 1;
        return new target(...args);
      },
    });
    const countingNumbers = new Proxy(NumberFormat, {
      construct(target, args: ConstructorParameters<typeof Intl.NumberFormat>) {
        made.numbers += 1;
        return new target(...args);
      },
    });
    Intl.DateTimeFormat = countingDates;
    Intl.NumberFormat = countingNumbers;
    try {
      const now = new Date(2026, 9, 30, 15, 0).getTime();
      for (let row = 0; row < 500; row += 1) {
        formatDate(new Date(2025, 0, 1 + row).getTime(), now, 'fr-FR', words);
        formatSize(1_500 + row * 1_000, words.units, 'fr-FR');
      }
    } finally {
      Intl.DateTimeFormat = DateTimeFormat;
      Intl.NumberFormat = NumberFormat;
    }
    expect(made.dates).toBeLessThanOrEqual(2);
    expect(made.numbers).toBeLessThanOrEqual(2);
  });
});
