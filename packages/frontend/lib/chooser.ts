/**
 * Dropsea as the person's file chooser: the open or save panel the platform
 * starts it to show as a sheet of another application's window
 * (`usePlatformFiles()?.chooser`, a `PlatformFileChooser`). What the panel
 * lets the person choose for the request, what its button, a double click and
 * Return do, what a save would write, and where the panel starts.
 *
 * Only files on this device are chosen: an Oxy Files item is not a file on
 * disk the asking application could open.
 */
import type { PlatformFileChooserRequest } from '@oxy.so/bloom/platform-surface';
import type { Item, LocalItem } from '@/lib/items';
import { extensionOf, type Kind, kindOf, mimeForName } from '@/lib/kinds';
import type { LocalPlace } from '@/lib/local-places';
import { type NameProblem, nameProblem } from '@/lib/names';
import type { Strings } from '@/lib/strings';

/**
 * The kinds a media type's family (`image/*`) takes in, beyond the MIME types
 * Dropsea reads from a name: a `.cr2` is an image though no MIME type is known
 * for it here.
 */
const KINDS_OF_FAMILY: Record<string, readonly Kind[]> = {
  image: ['image'],
  audio: ['audio'],
  video: ['video'],
  font: ['font'],
  text: ['text', 'code'],
};

/**
 * Whether a file is one of `types`: media types (`image/png`, or a family,
 * `image/*`) and extensions (`.png`), any of them, case aside. No types: any
 * file.
 */
export function fitsTypes(
  file: { name: string; mime: string | null },
  types: readonly string[],
): boolean {
  if (types.length === 0) return true;
  const extension = extensionOf(file.name);
  const mime = (file.mime ?? mimeForName(file.name)).split(';')[0]?.trim().toLowerCase() ?? '';
  const kind = kindOf({ name: file.name, isFolder: false, mime: file.mime });
  return types.some((written) => {
    const type = written.trim().toLowerCase();
    if (type.startsWith('.')) return extension !== '' && type.slice(1) === extension;
    if (type === '*/*') return true;
    const slash = type.indexOf('/');
    if (slash <= 0) return false;
    if (type.endsWith('/*')) {
      const family = type.slice(0, slash);
      return mime.startsWith(`${family}/`) || (KINDS_OF_FAMILY[family] ?? []).includes(kind);
    }
    return type === mime;
  });
}

/** Whether the request can be answered with this item: a file on this device that fits it. */
export function isChoosable(item: Item, request: PlatformFileChooserRequest): boolean {
  if (item.source !== 'local' || request.mode !== 'open') return false;
  if (request.directory) return item.isFolder;
  return !item.isFolder && fitsTypes(item, request.types);
}

/**
 * Whether the panel lets the person select an item: what can be chosen, and
 * the folders, which it goes into. Anything else is shown dimmed and cannot
 * be selected.
 */
export function isSelectable(item: Item, request: PlatformFileChooserRequest): boolean {
  return item.source === 'local' && (item.isFolder || isChoosable(item, request));
}

/** What the panel does for a press of its button, Return, or a double click. */
export type ChooserStep =
  /** Answer the request with these `file://` URIs. */
  | { kind: 'choose'; uris: readonly string[] }
  /** Go into this folder. */
  | { kind: 'enter'; uri: string }
  /** Put this name in the save panel's field. */
  | { kind: 'name'; name: string }
  | { kind: 'none' };

const NO_STEP: ChooserStep = { kind: 'none' };

/**
 * The open panel's button (and Return) for the selection, in the folder
 * shown: the selection when it all fits the request (one item, or several
 * when it allows), the folder selected alone when files are asked for (it
 * goes in), or with nothing selected when a folder is asked for, the folder
 * shown, as a Mac's panel chooses it.
 */
export function openStep(
  request: PlatformFileChooserRequest,
  selected: readonly Item[],
  folderUri: string | null,
): ChooserStep {
  if (request.mode !== 'open') return NO_STEP;
  const [first] = selected;
  if (!first)
    return request.directory && folderUri ? { kind: 'choose', uris: [folderUri] } : NO_STEP;
  if (selected.length === 1 && !request.directory && first.source === 'local' && first.isFolder) {
    return { kind: 'enter', uri: first.uri };
  }
  if (selected.length > 1 && !request.multiple) return NO_STEP;
  const uris: string[] = [];
  for (const item of selected) {
    if (item.source !== 'local' || !isChoosable(item, request)) return NO_STEP;
    uris.push(item.uri);
  }
  return { kind: 'choose', uris };
}

/**
 * A double click (or a tap) on an item: a folder is gone into; in an open
 * panel a file that fits is chosen; in a save panel a file's name is put in
 * the field, to write over it once the person confirms.
 */
export function activateStep(request: PlatformFileChooserRequest, item: Item): ChooserStep {
  if (item.source !== 'local') return NO_STEP;
  if (item.isFolder) return { kind: 'enter', uri: item.uri };
  if (request.mode === 'save') return { kind: 'name', name: item.name };
  return isChoosable(item, request) ? { kind: 'choose', uris: [item.uri] } : NO_STEP;
}

/** The `file://` URI of `name` in a folder, the name escaped as a URI's part. */
export function childUri(folderUri: string, name: string): string {
  const folder = folderUri.endsWith('/') ? folderUri : `${folderUri}/`;
  return `${folder}${encodeURIComponent(name)}`;
}

/** What saving under a name in a folder holding `items` would do. */
export type SaveStep =
  /** Write a new file there. */
  | { kind: 'save'; uri: string }
  /** A file of that name is there: ask before writing over it. */
  | { kind: 'replace'; uri: string }
  /** The name cannot be used: a name's rule, or a folder of that name is there. */
  | { kind: 'problem'; problem: NameProblem | 'folder-taken' };

/**
 * The save panel's button for the name typed. A name is compared exactly
 * (the file systems OxyOS writes to keep case), and a folder is never
 * replaced by a file.
 */
export function saveStep(name: string, folderUri: string, items: readonly LocalItem[]): SaveStep {
  const problem = nameProblem(name, []);
  if (problem) return { kind: 'problem', problem };
  const existing = items.find((item) => item.name === name);
  if (!existing) return { kind: 'save', uri: childUri(folderUri, name) };
  if (existing.isFolder) return { kind: 'problem', problem: 'folder-taken' };
  return { kind: 'replace', uri: existing.uri };
}

/**
 * Where the panel opens: the folder the asking application named, else the
 * one Dropsea last chose in for it, else the person's home (or their first
 * place); the first of them still there. Null when none is.
 */
export function startFolder(
  request: PlatformFileChooserRequest,
  remembered: string | null,
  places: readonly LocalPlace[],
  exists: (uri: string) => boolean,
): string | null {
  const home = places.find((place) => place.kind === 'home') ?? places[0];
  for (const uri of [request.folder, remembered, home?.uri ?? null]) {
    if (uri?.startsWith('file://') && exists(uri)) return uri;
  }
  return null;
}

/** The panel's title: the asking application's, else what the panel does. */
export function chooserTitle(request: PlatformFileChooserRequest, strings: Strings): string {
  const title = request.title?.trim();
  if (title) return title;
  if (request.mode === 'save') return strings.chooser.save;
  return request.directory ? strings.chooser.chooseFolder : strings.chooser.open;
}
