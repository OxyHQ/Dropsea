/** How a location's items are ordered and found. */
import { type Item, itemDate, itemKind } from '@/lib/items';
import { KIND_ORDER } from '@/lib/kinds';
import { compareNames } from '@/lib/names';
import { type ItemTag, matchesSearch, parseSearch, tagOrderKey } from '@/lib/tags';

export type SortColumn = 'name' | 'date' | 'size' | 'kind' | 'tags';
export type SortDirection = 'ascending' | 'descending';
export interface SortOrder {
  column: SortColumn;
  direction: SortDirection;
}

export const NAME_ORDER: SortOrder = { column: 'name', direction: 'ascending' };

/** The items' tags, and the person's order of their tags, for what sorts and finds by them. */
export interface TagLookup {
  tagsOf: (item: Item) => readonly ItemTag[];
  /** Each of the person's tags' place in their order, by `tagKey`. */
  order: ReadonlyMap<string, number>;
}

/** No tags: a place whose items have none. */
export const NO_TAGS: TagLookup = { tagsOf: () => [], order: new Map() };

function compareBy(column: SortColumn, first: Item, second: Item, tags: TagLookup): number {
  switch (column) {
    case 'tags': {
      // By the first tag's place in the person's order, as Finder's Tags column sorts.
      const [firstPlace, firstName] = tagOrderKey(tags.tagsOf(first), tags.order);
      const [secondPlace, secondName] = tagOrderKey(tags.tagsOf(second), tags.order);
      if (firstPlace !== secondPlace) return firstPlace < secondPlace ? -1 : 1;
      return firstName < secondName ? -1 : firstName > secondName ? 1 : 0;
    }
    case 'date':
      return (itemDate(first) ?? 0) - (itemDate(second) ?? 0);
    case 'size':
      // Folders and albums have no size: they come first, as Finder keeps them.
      return (first.size ?? -1) - (second.size ?? -1);
    case 'kind':
      return KIND_ORDER.indexOf(itemKind(first)) - KIND_ORDER.indexOf(itemKind(second));
    default:
      return 0;
  }
}

/**
 * Items in the order chosen; ties by name, then by key, so the order never
 * depends on how the source listed them.
 */
export function sortItems<T extends Item>(
  items: readonly T[],
  order: SortOrder,
  tags: TagLookup = NO_TAGS,
): T[] {
  const sign = order.direction === 'ascending' ? 1 : -1;
  return items.slice().sort((first, second) => {
    const byColumn = compareBy(order.column, first, second, tags);
    if (byColumn !== 0) return sign * byColumn;
    const byName = compareNames(first.name, second.name);
    if (byName !== 0) return sign * byName;
    return first.key < second.key ? -1 : first.key > second.key ? 1 : 0;
  });
}

/**
 * Pressing a column's header: that column, names ascending and dates and
 * sizes newest and largest first, as Finder starts them; pressing the sorted
 * column again reverses it.
 */
export function sortBy(current: SortOrder, column: SortColumn): SortOrder {
  if (current.column === column) {
    return { column, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  const startsDescending = column === 'date' || column === 'size';
  return { column, direction: startsDescending ? 'descending' : 'ascending' };
}

/**
 * The items shown: hidden ones only when asked for, and only those the search
 * finds: its words in the name (case and accents aside) and every tag it asks
 * for (`tag:Red`, or the person's language's word for a tag) on the item.
 */
export function visibleItems<T extends Item>(
  items: readonly T[],
  search: string,
  isShowingHidden: boolean,
  tagKeywords: readonly string[] = [],
  tags: TagLookup = NO_TAGS,
): T[] {
  const query = parseSearch(search, tagKeywords);
  return items.filter(
    (item) =>
      (isShowingHidden || !item.isHidden) && matchesSearch(item.name, tags.tagsOf(item), query),
  );
}
