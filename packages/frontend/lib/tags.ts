/**
 * Tags, as a Mac's Finder has them: names a person gives their items, the
 * seven coloured ones and any of their own, each with a colour or none.
 *
 * Where they live: on this device's files, in the files themselves (the
 * platform's `files.tags`, extended attributes); on Oxy Files, in Dropsea's
 * backend beside each asset's id; and the person's own list of tags (each
 * one's colour, their order, which the sidebar shows) in their preferences.
 *
 * Names compare case aside ("Work" and "work" are one tag) and the first
 * spelling is kept. A name holds no comma and no line break: a file keeps its
 * tags as names joined by commas (freedesktop.org's `user.xdg.tags`), and a
 * Mac's keep a colour after a line break.
 */
import { fold } from '@/lib/names';

/** Finder's seven colours, in its order. */
export const TAG_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'grey'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

/** One of the person's tags: its name, its colour (or none) and whether the sidebar shows it. */
export interface TagDefinition {
  name: string;
  color: TagColor | null;
  isFavourite: boolean;
}

/** A tag on an item: its name, and the colour the item itself says for it (a Mac's file does), if any. */
export interface ItemTag {
  name: string;
  color: TagColor | null;
}

/** The longest name a tag takes, in characters: 60 of any script stay inside a file system's 255 bytes. */
export const TAG_NAME_MAX = 60;

/** How many favourite tags the keyboard reaches (the first seven, as Finder's Control-1 to Control-7). */
export const KEYBOARD_TAG_COUNT = 7;

/**
 * Each colour as it is drawn, in a light and a dark appearance: the system
 * colours a Mac draws its tags in, so a tag looks the same in Dropsea as in
 * Finder.
 */
const TAG_COLOR_VALUES: Record<TagColor, { light: string; dark: string }> = {
  red: { light: '#FF3B30', dark: '#FF453A' },
  orange: { light: '#FF9500', dark: '#FF9F0A' },
  yellow: { light: '#FFCC00', dark: '#FFD60A' },
  green: { light: '#34C759', dark: '#30D158' },
  blue: { light: '#007AFF', dark: '#0A84FF' },
  purple: { light: '#AF52DE', dark: '#BF5AF2' },
  grey: { light: '#8E8E93', dark: '#98989D' },
};

export function tagColorValue(color: TagColor, isDark: boolean): string {
  const values = TAG_COLOR_VALUES[color];
  return isDark ? values.dark : values.light;
}

export function isTagColor(value: unknown): value is TagColor {
  return typeof value === 'string' && (TAG_COLORS as readonly string[]).includes(value);
}

/** A tag's name as names are compared: trimmed, case aside. */
export function tagKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isSameTag(first: string, second: string): boolean {
  return tagKey(first) === tagKey(second);
}

/** Whether `tags` holds `name`, case aside. */
export function hasTag(tags: readonly { name: string }[], name: string): boolean {
  const key = tagKey(name);
  return tags.some((tag) => tagKey(tag.name) === key);
}

/** Why a name cannot be a tag's. */
export type TagNameProblem = 'empty' | 'separator' | 'too-long' | 'taken';

/** What is wrong with `name` as a new name among `others`' (case aside), or null. */
export function tagNameProblem(name: string, others: readonly string[]): TagNameProblem | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (/[,\r\n]/.test(trimmed)) return 'separator';
  if ([...trimmed].length > TAG_NAME_MAX) return 'too-long';
  if (others.some((other) => isSameTag(other, trimmed))) return 'taken';
  return null;
}

/** The person's tags before they change any: the seven colours, named in their language, all in the sidebar. */
export function defaultTagDefinitions(names: Record<TagColor, string>): TagDefinition[] {
  return TAG_COLORS.map((color) => ({ name: names[color], color, isFavourite: true }));
}

/** The person's tags by name, case aside. */
export function definitionsByKey(
  definitions: readonly TagDefinition[],
): ReadonlyMap<string, TagDefinition> {
  return new Map(definitions.map((definition) => [tagKey(definition.name), definition]));
}

/**
 * The colour a tag is drawn in: the person's own for it, else the one the item
 * says (a file from a Mac carries its tags' colours), else none.
 */
export function tagColorOf(
  tag: ItemTag,
  definitions: ReadonlyMap<string, TagDefinition>,
): TagColor | null {
  const definition = definitions.get(tagKey(tag.name));
  return definition ? definition.color : tag.color;
}

/** The sidebar's tags, in the person's order. */
export function favouriteTags(definitions: readonly TagDefinition[]): TagDefinition[] {
  return definitions.filter((definition) => definition.isFavourite);
}

/** Whether a tag is on every item, on none, or on some. */
export type TagState = 'on' | 'off' | 'mixed';

export function tagState(itemsTags: readonly (readonly ItemTag[])[], name: string): TagState {
  if (itemsTags.length === 0) return 'off';
  const count = itemsTags.filter((tags) => hasTag(tags, name)).length;
  if (count === 0) return 'off';
  return count === itemsTags.length ? 'on' : 'mixed';
}

/** What choosing a tag for the selection does, as Finder: on every item already, it comes off; else it goes on every one. */
export function toggledTag(
  itemsTags: readonly (readonly ItemTag[])[],
  tag: ItemTag,
): { add: ItemTag[]; remove: string[] } {
  return tagState(itemsTags, tag.name) === 'on'
    ? { add: [], remove: [tag.name] }
    : { add: [tag], remove: [] };
}

/** The tags every item has, in the first item's order: what a field for several items shows. */
export function commonTags(itemsTags: readonly (readonly ItemTag[])[]): ItemTag[] {
  const [first, ...rest] = itemsTags;
  if (!first) return [];
  return first.filter((tag) => rest.every((tags) => hasTag(tags, tag.name)));
}

/** `tags` changed: each of `add` once (case aside), at the end; each of `remove` gone. */
export function changedTags(
  tags: readonly ItemTag[],
  change: { add?: readonly ItemTag[]; remove?: readonly string[] },
): ItemTag[] {
  const removed = new Set((change.remove ?? []).map(tagKey));
  const next = tags.filter((tag) => !removed.has(tagKey(tag.name)));
  for (const tag of change.add ?? []) {
    if (!hasTag(next, tag.name)) next.push({ name: tag.name.trim(), color: tag.color });
  }
  return next;
}

/** The person's tags with `from` named `to`, keeping its colour, its place and whether the sidebar shows it. */
export function renamedDefinitions(
  definitions: readonly TagDefinition[],
  from: string,
  to: string,
): TagDefinition[] {
  return definitions.map((definition) =>
    isSameTag(definition.name, from) ? { ...definition, name: to.trim() } : definition,
  );
}

/** The person's tags with `definition` added at the end, unless they have it (case aside). */
export function withDefinition(
  definitions: readonly TagDefinition[],
  definition: TagDefinition,
): TagDefinition[] {
  if (hasTag(definitions, definition.name)) return [...definitions];
  return [...definitions, { ...definition, name: definition.name.trim() }];
}

/** The person's tags with `name`'s replaced by `change` applied to it. */
export function updatedDefinition(
  definitions: readonly TagDefinition[],
  name: string,
  change: Partial<Pick<TagDefinition, 'color' | 'isFavourite'>>,
): TagDefinition[] {
  return definitions.map((definition) =>
    isSameTag(definition.name, name) ? { ...definition, ...change } : definition,
  );
}

export function withoutDefinition(
  definitions: readonly TagDefinition[],
  name: string,
): TagDefinition[] {
  return definitions.filter((definition) => !isSameTag(definition.name, name));
}

/** The person's tags with the one at `from` moved to `to`. */
export function movedDefinition(
  definitions: readonly TagDefinition[],
  from: number,
  to: number,
): TagDefinition[] {
  const next = [...definitions];
  const [moved] = next.splice(from, 1);
  if (!moved) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * The person's tags as their preferences keep them, from what was stored (it
 * may be from another version of Dropsea, or damaged): each well-formed tag
 * once, in order; null when nothing usable is there.
 */
export function readDefinitions(stored: unknown): TagDefinition[] | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const tags: unknown = Reflect.get(stored, 'tags');
  if (!Array.isArray(tags)) return null;
  const definitions: TagDefinition[] = [];
  for (const entry of tags) {
    if (typeof entry !== 'object' || entry === null) continue;
    const name: unknown = Reflect.get(entry, 'name');
    const color: unknown = Reflect.get(entry, 'color');
    const isFavourite: unknown = Reflect.get(entry, 'isFavourite');
    if (typeof name !== 'string') continue;
    const others = definitions.map((definition) => definition.name);
    if (tagNameProblem(name, others) !== null) continue;
    definitions.push({
      name: name.trim(),
      color: isTagColor(color) ? color : null,
      isFavourite: isFavourite === true,
    });
  }
  return definitions;
}

/** The person's tags as their preferences store them. */
export function storedDefinitions(definitions: readonly TagDefinition[]): {
  version: 1;
  tags: TagDefinition[];
} {
  return {
    version: 1,
    tags: definitions.map(({ name, color, isFavourite }) => ({ name, color, isFavourite })),
  };
}

/**
 * Every tag name worth offering as a field is typed: the person's own, in
 * their order, then the others found on items (on this device's files, in Oxy
 * Files), by name.
 */
export function tagSuggestions(
  definitions: readonly TagDefinition[],
  found: readonly string[],
): string[] {
  const names = definitions.map((definition) => definition.name);
  const others = found
    .filter((name) => !names.some((known) => isSameTag(known, name)))
    .sort((first, second) => fold(first).localeCompare(fold(second)));
  const unique: string[] = [];
  for (const name of others) if (!unique.some((known) => isSameTag(known, name))) unique.push(name);
  return [...names, ...unique];
}

/** The word every search takes a tag with, whatever the person's language: `tag:Red`. */
export const TAG_KEYWORD = 'tag';

/** A search's words and the tags it asks for. */
export interface SearchQuery {
  /** The words an item's name must have, folded; empty for none. */
  text: string;
  /** The tags an item must all have. */
  tags: string[];
}

/**
 * A search as typed: `tag:Name` (or `tag:"Two words"`, and the same with the
 * person's language's own word for a tag) asks for items with that tag, as a
 * Mac's searches take it; the rest is the words of the name.
 */
export function parseSearch(input: string, keywords: readonly string[]): SearchQuery {
  const tags: string[] = [];
  const words: string[] = [];
  const keys = keywords.map((keyword) => `${keyword.toLowerCase()}:`);
  // Words, each a run of what is not a space, where a quote holds spaces too.
  const tokens = input.match(/(?:[^\s"]+|"[^"]*"?)+/g) ?? [];
  const unquoted = (text: string) => text.replace(/"/g, '').trim();
  let isTagNext = false;
  for (const token of tokens) {
    if (isTagNext) {
      // A keyword with nothing after its colon takes the next word.
      const name = unquoted(token);
      if (name) tags.push(name);
      isTagNext = false;
      continue;
    }
    const key = keys.find((each) => token.toLowerCase().startsWith(each));
    if (key) {
      const name = unquoted(token.slice(key.length));
      if (name) tags.push(name);
      else isTagNext = true;
      continue;
    }
    const word = unquoted(token);
    if (word) words.push(word);
  }
  return { text: fold(words.join(' ')), tags };
}

/** Whether an item's name and tags answer a search. */
export function matchesSearch(name: string, tags: readonly ItemTag[], query: SearchQuery): boolean {
  if (query.text && !fold(name).includes(query.text)) return false;
  return query.tags.every((wanted) =>
    tags.some((tag) => fold(tag.name).startsWith(fold(wanted.trim()))),
  );
}

/**
 * Where an item's tags put it in an order by tags: by its first tag's place
 * among the person's tags (a tag of nobody's list after theirs, by name), an
 * item with no tag after every tagged one.
 */
export function tagOrderKey(
  tags: readonly ItemTag[],
  order: ReadonlyMap<string, number>,
): [number, string] {
  const [first] = tags;
  if (!first) return [Number.POSITIVE_INFINITY, ''];
  const place = order.get(tagKey(first.name));
  return place === undefined ? [order.size, fold(first.name)] : [place, ''];
}

/** How items draw their tags: each tag's definition and place in the person's order, by `tagKey`. */
export interface TagStyle {
  known: ReadonlyMap<string, TagDefinition>;
  order: ReadonlyMap<string, number>;
}

export function tagStyleOf(definitions: readonly TagDefinition[]): TagStyle {
  return { known: definitionsByKey(definitions), order: tagOrder(definitions) };
}

/** Each of the person's tags' place in their order, by name. */
export function tagOrder(definitions: readonly TagDefinition[]): ReadonlyMap<string, number> {
  return new Map(definitions.map((definition, index) => [tagKey(definition.name), index]));
}

/**
 * An item's tags in the person's order (theirs first, as their list orders
 * them, then the rest as the item has them): the order its dots are drawn and
 * its tags said.
 */
export function orderedTags(
  tags: readonly ItemTag[],
  order: ReadonlyMap<string, number>,
): ItemTag[] {
  return tags
    .map((tag, index) => ({ tag, place: order.get(tagKey(tag.name)) ?? order.size + index }))
    .sort((first, second) => first.place - second.place)
    .map(({ tag }) => tag);
}

/** A group of items by tag: its tag, as its first item has it (null for the items with none), and its items. */
export interface TagGroup<T> {
  tag: ItemTag | null;
  items: T[];
}

/**
 * Items grouped by tag, as Finder's View › Group By › Tags: each item under its
 * first tag in the person's order (a tag of nobody's list after theirs, by
 * name), the groups in that order, the untagged last; within a group, the
 * items keep the order they came in (the window's sort).
 */
export function groupByTag<T>(
  items: readonly T[],
  tagsOf: (item: T) => readonly ItemTag[],
  order: ReadonlyMap<string, number>,
): TagGroup<T>[] {
  const groups = new Map<string, { tag: ItemTag | null; rank: [number, string]; items: T[] }>();
  for (const item of items) {
    const [first] = orderedTags(tagsOf(item), order);
    const key = first ? tagKey(first.name) : '';
    const known = groups.get(key);
    if (known) {
      known.items.push(item);
      continue;
    }
    groups.set(key, {
      tag: first ?? null,
      rank: tagOrderKey(first ? [first] : [], order),
      items: [item],
    });
  }
  return [...groups.values()]
    .sort((first, second) =>
      first.rank[0] !== second.rank[0]
        ? first.rank[0] < second.rank[0]
          ? -1
          : 1
        : first.rank[1] < second.rank[1]
          ? -1
          : first.rank[1] > second.rank[1]
            ? 1
            : 0,
    )
    .map(({ tag, items: grouped }) => ({ tag, items: grouped }));
}
