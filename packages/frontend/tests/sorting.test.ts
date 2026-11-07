import { describe, expect, test } from 'bun:test';
import type { Item } from '@/lib/items';
import type { Kind } from '@/lib/kinds';
import {
  datePeriod,
  type GroupingContext,
  groupItems,
  NAME_ORDER,
  type SortColumn,
  type SortDirection,
  sortBy,
  sortItems,
  visibleItems,
} from '@/lib/sorting';
import type { ItemTag } from '@/lib/tags';
import { local } from './fixtures';

describe('sorting', () => {
  const items = [
    local('b.txt', { size: 10, modifiedAt: 3 }),
    local('Pictures', { isFolder: true, size: null, modifiedAt: 1 }),
    local('a.png', { size: 300, modifiedAt: 2 }),
    local('c.txt', { size: 10, modifiedAt: 3 }),
  ];
  const names = (column: SortColumn, direction: SortDirection) =>
    sortItems(items, { column, direction }).map((item) => item.name);

  test('orders by each column, ties by name', () => {
    expect(names('name', 'ascending')).toEqual(['a.png', 'b.txt', 'c.txt', 'Pictures']);
    expect(names('name', 'descending')).toEqual(['Pictures', 'c.txt', 'b.txt', 'a.png']);
    expect(names('date', 'descending')).toEqual(['c.txt', 'b.txt', 'a.png', 'Pictures']);
    expect(names('size', 'ascending')).toEqual(['Pictures', 'b.txt', 'c.txt', 'a.png']);
    expect(names('kind', 'ascending')).toEqual(['Pictures', 'a.png', 'b.txt', 'c.txt']);
  });

  test('puts folders before even an empty file by size', () => {
    const withEmpty = [local('a.txt', { size: 0 }), local('Zed', { isFolder: true, size: null })];
    expect(
      sortItems(withEmpty, { column: 'size', direction: 'ascending' }).map((item) => item.name),
    ).toEqual(['Zed', 'a.txt']);
  });

  test('never changes the items it was given', () => {
    sortItems(items, NAME_ORDER);
    expect(items[0]?.name).toBe('b.txt');
  });

  test('a header pressed again reverses; dates and sizes start newest and largest', () => {
    expect(sortBy(NAME_ORDER, 'name')).toEqual({ column: 'name', direction: 'descending' });
    expect(sortBy(NAME_ORDER, 'date')).toEqual({ column: 'date', direction: 'descending' });
    expect(sortBy({ column: 'size', direction: 'descending' }, 'kind')).toEqual({
      column: 'kind',
      direction: 'ascending',
    });
  });
});

describe('what is shown', () => {
  const items = [local('.bashrc'), local('Año nuevo.txt'), local('notes.md')];

  test('hidden items only when asked for', () => {
    expect(visibleItems(items, '', false).map((item) => item.name)).toEqual([
      'Año nuevo.txt',
      'notes.md',
    ]);
    expect(visibleItems(items, '', true)).toHaveLength(3);
  });

  test('the search finds names case and accents aside, and blank finds everything', () => {
    expect(visibleItems(items, 'ANO', false).map((item) => item.name)).toEqual(['Año nuevo.txt']);
    expect(visibleItems(items, '  ', false)).toHaveLength(2);
    expect(visibleItems(items, 'bash', false)).toHaveLength(0);
  });
});

describe('groups', () => {
  // Noon on Saturday 7 November 2026, where the person is.
  const now = new Date(2026, 10, 7, 12).getTime();
  const at = (month: number, day: number, year = 2026) => new Date(year, month, day, 9).getTime();
  const kindNames: Record<Kind, string> = {
    folder: 'Folder',
    album: 'Album',
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
    pdf: 'PDF document',
    text: 'Plain text',
    code: 'Source code',
    document: 'Document',
    spreadsheet: 'Spreadsheet',
    presentation: 'Presentation',
    archive: 'Archive',
    'disk-image': 'Disk image',
    font: 'Font',
    file: 'Document',
  };
  const tagsByName: Record<string, ItemTag[]> = {
    'a.txt': [
      { name: 'Work', color: null },
      { name: 'Red', color: null },
    ],
    'b.png': [{ name: 'Red', color: null }],
  };
  const context: GroupingContext = {
    tags: {
      tagsOf: (item: Item) => tagsByName[item.name] ?? [],
      order: new Map([
        ['red', 0],
        ['work', 1],
      ]),
    },
    now,
    kindName: (kind) => kindNames[kind],
  };
  const headings = (groups: ReturnType<typeof groupItems<Item>>) =>
    groups?.map((group) => ({
      heading: group.heading,
      names: group.items.map((item) => item.name),
    }));

  test('none: the items are not grouped', () => {
    expect(groupItems([local('a.txt')], 'none', context)).toBeNull();
  });

  test('by date: Finder’s periods, newest first, the undated last', () => {
    expect(datePeriod(now - 60_000, now)).toEqual({ span: 'today' });
    expect(datePeriod(at(10, 6), now)).toEqual({ span: 'yesterday' });
    expect(datePeriod(at(10, 5), now)).toEqual({ span: 'previous-7-days' });
    expect(datePeriod(at(9, 31), now)).toEqual({ span: 'previous-7-days' });
    expect(datePeriod(at(9, 30), now)).toEqual({ span: 'previous-30-days' });
    expect(datePeriod(at(9, 8), now)).toEqual({ span: 'previous-30-days' });
    expect(datePeriod(at(9, 7), now)).toEqual({ span: 'month', month: 9 });
    expect(datePeriod(at(0, 1), now)).toEqual({ span: 'month', month: 0 });
    expect(datePeriod(at(11, 31, 2025), now)).toEqual({ span: 'year', year: 2025 });
    expect(datePeriod(null, now)).toEqual({ span: 'undated' });
    const items = [
      local('old', { modifiedAt: at(3, 1, 2019) }),
      local('march', { modifiedAt: at(2, 3) }),
      local('none', { modifiedAt: null }),
      local('today', { modifiedAt: now }),
      local('august', { modifiedAt: at(7, 9) }),
      local('last year', { modifiedAt: at(5, 1, 2025) }),
      local('yesterday', { modifiedAt: at(10, 6) }),
      local('also today', { modifiedAt: now - 1000 }),
    ];
    expect(headings(groupItems(items, 'date', context))).toEqual([
      { heading: { by: 'date', period: { span: 'today' } }, names: ['today', 'also today'] },
      { heading: { by: 'date', period: { span: 'yesterday' } }, names: ['yesterday'] },
      { heading: { by: 'date', period: { span: 'month', month: 7 } }, names: ['august'] },
      { heading: { by: 'date', period: { span: 'month', month: 2 } }, names: ['march'] },
      { heading: { by: 'date', period: { span: 'year', year: 2025 } }, names: ['last year'] },
      { heading: { by: 'date', period: { span: 'year', year: 2019 } }, names: ['old'] },
      { heading: { by: 'date', period: { span: 'undated' } }, names: ['none'] },
    ]);
  });

  test('by kind: in the Kind column’s order, kinds of one name together', () => {
    const items = [
      local('notes.txt'),
      local('Pictures', { isFolder: true, size: null }),
      local('letter.docx'),
      local('photo.png'),
      local('blob.xyz'),
    ];
    const groups = headings(groupItems(items, 'kind', context));
    expect(groups?.map((group) => group.heading)).toEqual([
      { by: 'kind', name: 'Folder' },
      { by: 'kind', name: 'Image' },
      { by: 'kind', name: 'Document' },
      { by: 'kind', name: 'Plain text' },
    ]);
    // A document and a file of no known kind are both a “Document”: one group.
    expect(groups?.[2]?.names).toEqual(['letter.docx', 'blob.xyz']);
  });

  test('by tag: under the first tag in the person’s order, the untagged last', () => {
    const items = [local('c.md'), local('a.txt'), local('b.png')];
    expect(headings(groupItems(items, 'tags', context))).toEqual([
      { heading: { by: 'tags', tag: { name: 'Red', color: null } }, names: ['a.txt', 'b.png'] },
      { heading: { by: 'tags', tag: null }, names: ['c.md'] },
    ]);
  });

  test('the sort applies within each group, and the groups keep their own order', () => {
    const items = [
      local('b.txt', { modifiedAt: now }),
      local('a.txt', { modifiedAt: at(10, 6) }),
      local('c.txt', { modifiedAt: now - 5000 }),
    ];
    const descending = sortItems(items, { column: 'name', direction: 'descending' });
    expect(headings(groupItems(descending, 'date', context))?.map((group) => group.names)).toEqual([
      ['c.txt', 'b.txt'],
      ['a.txt'],
    ]);
  });
});
