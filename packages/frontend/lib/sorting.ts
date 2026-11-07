/** How a location's items are ordered, grouped and found. */
import { type Item, itemDate, itemKind } from '@/lib/items';
import { KIND_ORDER, type Kind } from '@/lib/kinds';
import { compareNames } from '@/lib/names';
import {
  groupByTag,
  type ItemTag,
  matchesSearch,
  parseSearch,
  tagKey,
  tagOrderKey,
} from '@/lib/tags';

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

/** What View › Group By groups the items by: Finder's Kind, Date Modified and Tags, or nothing. */
export type Grouping = 'none' | 'kind' | 'date' | 'tags';

/**
 * Finder's periods of a date, newest first: today, yesterday, the 7 days and
 * the 30 days before, each earlier month of this year, then each year. An item
 * without a date is in none of them, after them all.
 */
export type DatePeriod =
  | { span: 'today' | 'yesterday' | 'previous-7-days' | 'previous-30-days' | 'undated' }
  /** A month of this year, 0 for January. */
  | { span: 'month'; month: number }
  | { span: 'year'; year: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The period a date is in, counted in the calendar days of where the person is. */
export function datePeriod(time: number | null, now: number): DatePeriod {
  if (time === null) return { span: 'undated' };
  const date = new Date(time);
  const today = new Date(now);
  // Rounded: a day a clock change shortens or lengthens is still one day.
  const days = Math.round((startOfDay(today) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return { span: 'today' };
  if (days === 1) return { span: 'yesterday' };
  if (days <= 7) return { span: 'previous-7-days' };
  if (days <= 30) return { span: 'previous-30-days' };
  if (date.getFullYear() === today.getFullYear()) return { span: 'month', month: date.getMonth() };
  return { span: 'year', year: date.getFullYear() };
}

/** Where a period comes among the others: the newest first. */
function periodRank(period: DatePeriod, now: number): number {
  switch (period.span) {
    case 'today':
      return 0;
    case 'yesterday':
      return 1;
    case 'previous-7-days':
      return 2;
    case 'previous-30-days':
      return 3;
    case 'month':
      return 4 + (11 - period.month);
    case 'year':
      return 16 + (new Date(now).getFullYear() - period.year);
    case 'undated':
      return Number.POSITIVE_INFINITY;
  }
}

/** What a group's header says: a kind's name, a period, or a tag (null: the items with none). */
export type GroupHeading =
  | { by: 'kind'; name: string }
  | { by: 'date'; period: DatePeriod }
  | { by: 'tags'; tag: ItemTag | null };

/** A group of the items: what identifies it while the items change, its header, and its items. */
export interface ItemGroup<T> {
  key: string;
  heading: GroupHeading;
  items: T[];
}

/** What grouping needs besides the items: their tags, the time now, and each kind's name. */
export interface GroupingContext {
  tags: TagLookup;
  now: number;
  /** The name the Kind column shows: kinds of one name are one group, as Finder groups them. */
  kindName: (kind: Kind) => string;
}

/** Items into groups by a key, each group's place its lowest rank, items in the order they came. */
function collect<T>(
  items: readonly T[],
  describe: (item: T) => { key: string; heading: GroupHeading; rank: number },
): ItemGroup<T>[] {
  const groups = new Map<string, ItemGroup<T> & { rank: number }>();
  for (const item of items) {
    const { key, heading, rank } = describe(item);
    const known = groups.get(key);
    if (known) {
      known.items.push(item);
      known.rank = Math.min(known.rank, rank);
    } else {
      groups.set(key, { key, heading, items: [item], rank });
    }
  }
  return [...groups.values()]
    .sort((first, second) => first.rank - second.rank)
    .map(({ key, heading, items: grouped }) => ({ key, heading, items: grouped }));
}

/**
 * The items in groups, as Finder's View › Group By: by kind (in the Kind
 * column's order), by date (newest first, `datePeriod`), by tag (the person's
 * order, the untagged last, `groupByTag`); null when not grouped. The items
 * keep the order they came in within each group: the window's sort applies
 * within each group, as Finder's does.
 */
export function groupItems<T extends Item>(
  items: readonly T[],
  grouping: Grouping,
  context: GroupingContext,
): ItemGroup<T>[] | null {
  switch (grouping) {
    case 'none':
      return null;
    case 'kind':
      return collect(items, (item) => {
        const kind = itemKind(item);
        const name = context.kindName(kind);
        return {
          key: `kind:${name}`,
          heading: { by: 'kind', name },
          rank: KIND_ORDER.indexOf(kind),
        };
      });
    case 'date':
      return collect(items, (item) => {
        const period = datePeriod(itemDate(item), context.now);
        return {
          key: `date:${JSON.stringify(period)}`,
          heading: { by: 'date', period },
          rank: periodRank(period, context.now),
        };
      });
    case 'tags':
      return groupByTag(items, context.tags.tagsOf, context.tags.order).map(
        ({ tag, items: grouped }) => ({
          key: `tags:${tag ? tagKey(tag.name) : ''}`,
          heading: { by: 'tags', tag },
          items: grouped,
        }),
      );
  }
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
