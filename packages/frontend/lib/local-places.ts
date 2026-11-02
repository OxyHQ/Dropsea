/**
 * The places on this device a window can show, and how a local URI reads
 * against them: which place it is in, its parent, the folders down to it.
 *
 * Every URI is `file://`, as `expo-file-system` gives them. A folder's URI may
 * end in a slash and a name in it may be percent-encoded; both are compared
 * as the same place.
 */
import type { PlatformPlace } from '@oxy.so/bloom/platform-surface';

/**
 * A place: one of the platform's (the home, its standard folders, a volume),
 * or, where the platform has none, the folder `expo-file-system` gives Dropsea
 * on this device (`device`).
 */
export interface LocalPlace {
  kind: PlatformPlace['kind'] | 'device';
  name: string;
  uri: string;
}

/** A URI without a trailing slash (but the file system's root) and with its escapes decoded, for comparing. */
export function normalizeUri(uri: string): string {
  let decoded: string;
  try {
    decoded = decodeURI(uri);
  } catch (error) {
    console.warn('Dropsea read a file URI it cannot decode; it is compared as written', {
      uri,
      error,
    });
    decoded = uri;
  }
  return decoded.length > 'file:///'.length ? decoded.replace(/\/+$/, '') : decoded;
}

export function isSameUri(first: string, second: string): boolean {
  return normalizeUri(first) === normalizeUri(second);
}

/** Whether `uri` is `root` or inside it, by whole names. */
export function isWithinUri(uri: string, root: string): boolean {
  const item = normalizeUri(uri);
  const folder = normalizeUri(root);
  return item === folder || item.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
}

/** The folder an item is in, written with the item's own escapes; the root's is itself. */
export function parentUri(uri: string): string {
  const written = trimSlash(uri);
  const slash = written.lastIndexOf('/');
  if (slash < 'file:///'.length) return 'file:///';
  return written.slice(0, slash);
}

/** The last name of a URI, decoded. */
export function uriName(uri: string): string {
  const normalized = normalizeUri(uri);
  return normalized.slice(normalized.lastIndexOf('/') + 1) || '/';
}

/** The place a URI is in: the deepest one that holds it, or null outside every place. */
export function placeOf(uri: string, places: readonly LocalPlace[]): LocalPlace | null {
  let found: LocalPlace | null = null;
  for (const place of places) {
    if (!isWithinUri(uri, place.uri)) continue;
    if (!found || normalizeUri(place.uri).length > normalizeUri(found.uri).length) found = place;
  }
  return found;
}

/** A URI without its trailing slash (but the file system's root's), as written otherwise. */
function trimSlash(uri: string): string {
  return uri.length > 'file:///'.length ? uri.replace(/\/+$/, '') : uri;
}

/**
 * The folders from the root of the place a URI is in down to it, each with the
 * name a path bar shows: the root's own (the home's, a volume's label), the
 * rest by their names. Its root is a home, a volume or the device's folder:
 * a standard folder is a way into the home, not a root of its own. Each URI
 * keeps the escapes the item's own URI was written with.
 */
export function pathParts(
  uri: string,
  places: readonly LocalPlace[],
): { name: string; uri: string }[] {
  const roots = places.filter(
    (place) => place.kind === 'home' || place.kind === 'volume' || place.kind === 'device',
  );
  const root = placeOf(uri, roots) ?? placeOf(uri, places);
  if (!root) return [];
  const written = trimSlash(uri);
  const writtenRoot = trimSlash(root.uri);
  const isWrittenAlike = written.startsWith(writtenRoot);
  const base = isWrittenAlike ? writtenRoot : normalizeUri(root.uri);
  const rest = (isWrittenAlike ? written : normalizeUri(uri)).slice(base.length);
  const parts = [{ name: root.name, uri: base }];
  let at = base;
  for (const segment of rest.split('/').filter(Boolean)) {
    at = `${at}/${segment}`;
    parts.push({ name: uriName(at), uri: at });
  }
  return parts;
}
