/**
 * Names as Dropsea compares, finds, checks and makes them: Finder's order (case
 * and accents aside, runs of digits by their value), the rules a local name
 * must keep, and the free name a new folder or a download takes.
 */

/** A name folded for comparing and finding: lowercase, without accents. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

/**
 * Names compared as a Mac's Finder compares them: case and accents aside, and
 * runs of digits by their value ("file 2" before "file 10"); equal ones by
 * their code points, so the order is total.
 */
export function compareNames(first: string, second: string): number {
  const left = fold(first);
  const right = fold(second);
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftCode = left.charCodeAt(leftIndex);
    const rightCode = right.charCodeAt(rightIndex);
    if (isDigit(leftCode) && isDigit(rightCode)) {
      let leftEnd = leftIndex;
      let rightEnd = rightIndex;
      while (leftEnd < left.length && isDigit(left.charCodeAt(leftEnd))) leftEnd++;
      while (rightEnd < right.length && isDigit(right.charCodeAt(rightEnd))) rightEnd++;
      const leftNumber = left.slice(leftIndex, leftEnd).replace(/^0+(?=\d)/, '');
      const rightNumber = right.slice(rightIndex, rightEnd).replace(/^0+(?=\d)/, '');
      if (leftNumber.length !== rightNumber.length) return leftNumber.length - rightNumber.length;
      if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
      leftIndex = leftEnd;
      rightIndex = rightEnd;
      continue;
    }
    if (leftCode !== rightCode) return leftCode - rightCode;
    leftIndex++;
    rightIndex++;
  }
  const leftRest = left.length - leftIndex;
  const rightRest = right.length - rightIndex;
  if (leftRest !== rightRest) return leftRest - rightRest;
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

/** The longest name a file system takes, in UTF-8 bytes. */
export const MAX_NAME_BYTES = 255;

function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/** Why a name cannot be given to a local item. */
export type NameProblem = 'empty' | 'slash' | 'dots' | 'too-long' | 'taken';

/**
 * What is wrong with `name` for an item in a folder holding `taken` (the
 * item's own current name excluded by the caller), or null when it can be
 * used. A name differing from a taken one only in case is taken: several file
 * systems a person's files live on fold case.
 */
export function nameProblem(name: string, taken: readonly string[]): NameProblem | null {
  if (!name.trim()) return 'empty';
  if (name.includes('/') || name.includes('\0')) return 'slash';
  if (name === '.' || name === '..') return 'dots';
  if (utf8Length(name) > MAX_NAME_BYTES) return 'too-long';
  const folded = name.toLowerCase();
  if (taken.some((other) => other.toLowerCase() === folded)) return 'taken';
  return null;
}

/** A new folder's name: `base`, or `base 2`, `base 3`... the first no item has. */
export function freeName(base: string, taken: readonly string[]): string {
  const names = new Set(taken.map((name) => name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let number = 2; ; number++) {
    const candidate = `${base} ${number}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

/** A name's stem and extension: "report.final.pdf" is "report.final" and ".pdf"; a dot file has no extension. */
export function splitExtension(name: string): { stem: string; extension: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return { stem: name, extension: '' };
  return { stem: name.slice(0, dot), extension: name.slice(dot) };
}

/**
 * A file's name where `taken` names are already used: `name`, or the number
 * before its extension (`photo 2.jpg`), as Finder names a copy that would
 * otherwise replace an item.
 */
export function freeFileName(name: string, taken: readonly string[]): string {
  const names = new Set(taken.map((other) => other.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  const { stem, extension } = splitExtension(name);
  for (let number = 2; ; number++) {
    const candidate = `${stem} ${number}${extension}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
}

/** The part of a name a rename selects first: before its extension, as Finder does. */
export function nameSelection(name: string, isFolder: boolean): { start: number; end: number } {
  if (isFolder) return { start: 0, end: name.length };
  return { start: 0, end: splitExtension(name).stem.length };
}
