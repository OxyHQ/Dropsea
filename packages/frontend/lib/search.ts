/**
 * Searching through the platform's index (its `search`, OxyOS's Spotlight),
 * as Finder's search field asks a Mac's: the words typed, the filters chosen
 * as tokens ("Kind: PDF", "Tag: Work", "Date: Today", "Name: report"), and
 * where to look, everywhere on the computer or in the folder shown (the scope).
 *
 * As the person types, the field offers filters whose names start with the
 * word being typed, in their language: Finder's kinds, their tags, the dates,
 * and the name itself. Choosing one makes it a token and takes the word out of
 * the text.
 */
import type {
  PlatformSearchQuery,
  PlatformSearchResults,
  PlatformSearchToken,
} from '@oxy.so/bloom/platform-surface';
import { type LocalItem, localItem } from '@/lib/items';
import { fold } from '@/lib/names';
import type { Strings } from '@/lib/strings';
import { isSameTag } from '@/lib/tags';

/** The kinds a search offers as filters, in Finder's order. */
export const SEARCH_KINDS = [
  'pdf',
  'image',
  'folder',
  'document',
  'presentation',
  'spreadsheet',
  'text',
  'source',
  'movie',
  'music',
  'archive',
] as const satisfies readonly Extract<PlatformSearchToken, { kind: 'category' }>['value'][];
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** The spans of time a search offers, from the narrowest. */
export const SEARCH_DATES = [
  'today',
  'yesterday',
  'week',
  'month',
  'year',
] as const satisfies readonly Extract<PlatformSearchToken, { kind: 'date' }>['value'][];
export type SearchDate = (typeof SEARCH_DATES)[number];

/** A kind's name in a language, and other words it is found by as they are typed ("Video" for Movie). */
export interface SearchKindWords {
  name: string;
  aliases: readonly string[];
}

/** Where a search looks: the whole computer (Finder's "This Mac"), or the folder shown. */
export type SearchScope = 'computer' | 'folder';

/** The most tags offered at once. */
const TAG_SUGGESTIONS_MAX = 5;

/** A search's words in the person's language. */
export type SearchWords = Strings['searching'];

/** A filter offered as the person types: the token it becomes, its section and the row's text. */
export interface SearchSuggestion {
  token: PlatformSearchToken;
  section: 'kinds' | 'tags' | 'dates' | 'name';
  label: string;
}

/** A token's key in the field, stable while it stays: its kind and value, case aside. */
export function tokenKey(token: PlatformSearchToken): string {
  return `${token.kind}:${token.value.toLowerCase()}`;
}

/** What a token says in the field: "Kind: PDF", "Tag: Work", "Date: Today", "Name: report". */
export function tokenLabel(token: PlatformSearchToken, words: SearchWords): string {
  return `${words.filters[token.kind]}: ${tokenValueLabel(token, words)}`;
}

function tokenValueLabel(token: PlatformSearchToken, words: SearchWords): string {
  switch (token.kind) {
    case 'category':
      return isSearchKind(token.value) ? words.kinds[token.value].name : token.value;
    case 'date':
      return words.dates[token.value];
    case 'tag':
    case 'name':
      return token.value;
  }
}

function isSearchKind(value: string): value is SearchKind {
  return (SEARCH_KINDS as readonly string[]).includes(value);
}

/** The word being typed: the text's last, nothing once a space ends it. */
function lastWord(text: string): string {
  return /\S+$/.exec(text)?.[0] ?? '';
}

/** Whether `name`, or one of its words, starts with `word`, case and accents aside. */
function startsWithWord(name: string, word: string): boolean {
  const folded = fold(name);
  return folded.startsWith(word) || folded.split(/[\s\-_/]+/).some((part) => part.startsWith(word));
}

/**
 * The filters to offer for `text` as it is typed: the kinds, the tags and the
 * dates whose names start with the word being typed, then "Name matches" for
 * the whole text. None already chosen is offered again; a word that is a typed
 * filter (`kind:pdf`) is offered as a name only.
 */
export function searchSuggestions(
  text: string,
  {
    words,
    tagNames,
    chosen,
  }: {
    words: SearchWords;
    /** The person's tag names, in their order. */
    tagNames: readonly string[];
    /** The tokens already in the field. */
    chosen: readonly PlatformSearchToken[];
  },
): SearchSuggestion[] {
  const chosenKeys = new Set(chosen.map(tokenKey));
  const offered: SearchSuggestion[] = [];
  const offer = (suggestion: SearchSuggestion) => {
    if (!chosenKeys.has(tokenKey(suggestion.token))) offered.push(suggestion);
  };
  const word = fold(lastWord(text));
  if (word !== '' && !word.includes(':') && !word.includes('"')) {
    for (const kind of SEARCH_KINDS) {
      const { name, aliases } = words.kinds[kind];
      if ([name, ...aliases].some((each) => startsWithWord(each, word))) {
        offer({ token: { kind: 'category', value: kind }, section: 'kinds', label: name });
      }
    }
    const tags: string[] = [];
    for (const name of tagNames) {
      if (tags.length === TAG_SUGGESTIONS_MAX) break;
      if (!startsWithWord(name, word) || tags.some((known) => isSameTag(known, name))) continue;
      tags.push(name);
      offer({ token: { kind: 'tag', value: name }, section: 'tags', label: name });
    }
    for (const date of SEARCH_DATES) {
      if (startsWithWord(words.dates[date], word)) {
        offer({ token: { kind: 'date', value: date }, section: 'dates', label: words.dates[date] });
      }
    }
  }
  const whole = text.trim();
  if (whole !== '') {
    offer({
      token: { kind: 'name', value: whole },
      section: 'name',
      label: words.nameMatches(whole),
    });
  }
  return offered;
}

/**
 * The text once a suggestion is chosen: "Name matches" takes all of it, any
 * other filter the word it was offered for (the words before it stay, with the
 * space after them, to type on).
 */
export function textAfterChoosing(text: string, suggestion: SearchSuggestion): string {
  if (suggestion.section === 'name') return '';
  const rest = text.replace(/\S+$/, '');
  return rest.trim() === '' ? '' : rest;
}

/**
 * The tokens with `token` added at the end: a kind or a date replaces the
 * one already chosen (an item is of one kind, and the spans hold each other),
 * a tag or a name joins the others (every one must match), and a token
 * already there stays where it is.
 */
export function withToken(
  tokens: readonly PlatformSearchToken[],
  token: PlatformSearchToken,
): PlatformSearchToken[] {
  const key = tokenKey(token);
  if (tokens.some((each) => tokenKey(each) === key)) return [...tokens];
  const isExclusive = token.kind === 'category' || token.kind === 'date';
  return [...tokens.filter((each) => !(isExclusive && each.kind === token.kind)), token];
}

/** The tokens without the one whose key is `key`. */
export function withoutToken(
  tokens: readonly PlatformSearchToken[],
  key: string,
): PlatformSearchToken[] {
  return tokens.filter((token) => tokenKey(token) !== key);
}

/**
 * What the platform is asked: the text and tokens, within the folder for its
 * scope and nowhere narrower for the computer's; null while there is nothing
 * to search for (the field is empty), when the place shows what it holds.
 */
export function platformSearchQuery({
  text,
  tokens,
  scope,
  folderUri,
  language,
}: {
  text: string;
  tokens: readonly PlatformSearchToken[];
  scope: SearchScope;
  /** The folder shown, which the folder's scope looks in. */
  folderUri: string;
  /** The person's language, the results' titles' (BCP 47). */
  language: string;
}): PlatformSearchQuery | null {
  const trimmed = text.trim();
  if (trimmed === '' && tokens.length === 0) return null;
  return {
    text: trimmed,
    tokens,
    ...(scope === 'folder' ? { within: [folderUri] } : {}),
    language,
  };
}

/** A result found on this device, as the window shows it, with what the platform says of it. */
export interface SearchResult {
  item: LocalItem;
  /** The platform's id for it, which `used` takes. */
  id: string;
  /** Where it is, as the person reads it (`Documents › Work`); empty where the platform says nothing. */
  location: string;
}

/** The files and folders among what the platform found, in its order. */
export function searchResults(found: PlatformSearchResults): SearchResult[] {
  return found.items.flatMap((result) => {
    if (!result.uri) return [];
    const isFolder = result.category === 'folder' || result.uri.endsWith('/');
    return [
      {
        item: {
          ...localItem({
            uri: result.uri,
            name: result.title,
            isDirectory: isFolder,
            size: result.size ?? null,
            modifiedAt: result.modified ?? null,
          }),
          mime: result.contentType ?? null,
        },
        id: result.id,
        location: result.location ?? '',
      },
    ];
  });
}
