import { describe, expect, test } from 'bun:test';
import type { Item } from '@/lib/items';
import { sortItems, type TagLookup, visibleItems } from '@/lib/sorting';
import {
  changedTags,
  commonTags,
  defaultTagDefinitions,
  type ItemTag,
  movedDefinition,
  orderedTags,
  parseSearch,
  readDefinitions,
  renamedDefinitions,
  storedDefinitions,
  type TagDefinition,
  tagColorOf,
  tagNameProblem,
  tagOrder,
  tagState,
  tagStyleOf,
  tagSuggestions,
  toggledTag,
  withDefinition,
} from '@/lib/tags';
import { cloud, local } from './fixtures';

const COLORS = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  grey: 'Grey',
} as const;

const tag = (name: string, color: ItemTag['color'] = null): ItemTag => ({ name, color });

describe('the person’s tags', () => {
  test('start as the seven colours, in Finder’s order, all in the sidebar', () => {
    const defaults = defaultTagDefinitions(COLORS);
    expect(defaults.map((each) => each.name)).toEqual([
      'Red',
      'Orange',
      'Yellow',
      'Green',
      'Blue',
      'Purple',
      'Grey',
    ]);
    expect(defaults.every((each) => each.isFavourite && each.color !== null)).toBe(true);
  });

  test('refuse a name that is empty, has a separator, is too long or is taken, case aside', () => {
    expect(tagNameProblem('  ', [])).toBe('empty');
    expect(tagNameProblem('a,b', [])).toBe('separator');
    expect(tagNameProblem('a\nb', [])).toBe('separator');
    expect(tagNameProblem('x'.repeat(61), [])).toBe('too-long');
    expect(tagNameProblem('🙂'.repeat(60), [])).toBeNull();
    expect(tagNameProblem(' work ', ['Work'])).toBe('taken');
    expect(tagNameProblem('Work', ['Home'])).toBeNull();
  });

  test('are read back from what was stored, each well-formed one once, in order', () => {
    const stored = storedDefinitions([
      { name: 'Work', color: 'blue', isFavourite: true },
      { name: 'Later', color: null, isFavourite: false },
    ]);
    expect(readDefinitions(JSON.parse(JSON.stringify(stored)))).toEqual(stored.tags);
    expect(
      readDefinitions({
        tags: [
          { name: 'A', color: 'teal', isFavourite: 'yes' },
          { name: 'a' },
          { name: 'b,c' },
          42,
          { name: ' B ', color: 'red', isFavourite: true },
        ],
      }),
    ).toEqual([
      { name: 'A', color: null, isFavourite: false },
      { name: 'B', color: 'red', isFavourite: true },
    ]);
    expect(readDefinitions(null)).toBeNull();
    expect(readDefinitions({ tags: 'no' })).toBeNull();
  });

  test('rename in place, add once, move', () => {
    const start: TagDefinition[] = [
      { name: 'Red', color: 'red', isFavourite: true },
      { name: 'Work', color: null, isFavourite: false },
    ];
    expect(renamedDefinitions(start, 'red', 'Urgent')[0]).toEqual({
      name: 'Urgent',
      color: 'red',
      isFavourite: true,
    });
    expect(withDefinition(start, { name: 'WORK', color: 'blue', isFavourite: true })).toEqual(
      start,
    );
    expect(movedDefinition(start, 1, 0).map((each) => each.name)).toEqual(['Work', 'Red']);
  });
});

describe('an item’s tags', () => {
  test('take the person’s colour for a tag of theirs, else the file’s own', () => {
    const style = tagStyleOf([{ name: 'Work', color: 'blue', isFavourite: false }]);
    expect(tagColorOf(tag('work', 'red'), style.known)).toBe('blue');
    expect(tagColorOf(tag('From a Mac', 'green'), style.known)).toBe('green');
    expect(tagColorOf(tag('Plain'), style.known)).toBeNull();
  });

  test('are drawn in the person’s order, the rest as the item has them', () => {
    const order = tagOrder(defaultTagDefinitions(COLORS));
    expect(
      orderedTags([tag('Zeta'), tag('Blue'), tag('alpha'), tag('red')], order).map((t) => t.name),
    ).toEqual(['red', 'Blue', 'Zeta', 'alpha']);
  });

  test('change as Finder’s do: removed first, then each added once at the end', () => {
    expect(changedTags([tag('Red'), tag('Work')], { add: [tag('work'), tag('Blue')] })).toEqual([
      tag('Red'),
      tag('Work'),
      tag('Blue'),
    ]);
    expect(changedTags([tag('Red'), tag('Work')], { remove: ['WORK'] })).toEqual([tag('Red')]);
    // A change of case alone, as a rename does it.
    expect(changedTags([tag('work')], { remove: ['work'], add: [tag('Work')] })).toEqual([
      tag('Work'),
    ]);
  });

  test('of a selection: on, off or mixed, and a press puts it on all or takes it off all', () => {
    const selection = [[tag('Red')], [tag('red'), tag('Blue')]];
    expect(tagState(selection, 'Red')).toBe('on');
    expect(tagState(selection, 'Blue')).toBe('mixed');
    expect(tagState(selection, 'Green')).toBe('off');
    expect(tagState([], 'Red')).toBe('off');
    expect(toggledTag(selection, tag('Red', 'red'))).toEqual({ add: [], remove: ['Red'] });
    expect(toggledTag(selection, tag('Blue', 'blue'))).toEqual({
      add: [tag('Blue', 'blue')],
      remove: [],
    });
    expect(commonTags(selection)).toEqual([tag('Red')]);
  });

  test('are offered as typed: the person’s first, then the others found, each once', () => {
    expect(
      tagSuggestions(defaultTagDefinitions(COLORS).slice(0, 2), ['zed', 'red', 'Alpha', 'ZED']),
    ).toEqual(['Red', 'Orange', 'Alpha', 'zed']);
  });
});

describe('a search', () => {
  test('takes tag: tokens, quoted or not, in English or the person’s language', () => {
    expect(parseSearch('report tag:Red', ['tag'])).toEqual({ text: 'report', tags: ['Red'] });
    expect(parseSearch('tag:"Two words" etiqueta:Rojo', ['tag', 'etiqueta'])).toEqual({
      text: '',
      tags: ['Two words', 'Rojo'],
    });
    expect(parseSearch('tag: Work año', ['tag'])).toEqual({ text: 'ano', tags: ['Work'] });
    expect(parseSearch('Tagline', ['tag'])).toEqual({ text: 'tagline', tags: [] });
  });

  test('and sorting find and order items by their tags', () => {
    const items: Item[] = [
      local('plain.txt'),
      local('urgent.txt'),
      cloud('budget.pdf'),
      local('both.txt'),
    ];
    const byName = new Map<string, readonly ItemTag[]>([
      ['urgent.txt', [tag('Red')]],
      ['budget.pdf', [tag('Blue'), tag('Work')]],
      ['both.txt', [tag('Work'), tag('Red')]],
    ]);
    const lookup: TagLookup = {
      tagsOf: (item) => byName.get(item.name) ?? [],
      order: tagOrder(defaultTagDefinitions(COLORS)),
    };
    const names = (list: readonly Item[]) => list.map((item) => item.name);
    expect(names(visibleItems(items, 'tag:red', false, ['tag'], lookup))).toEqual([
      'urgent.txt',
      'both.txt',
    ]);
    expect(names(visibleItems(items, 'tag:wo tag:re', false, ['tag'], lookup))).toEqual([
      'both.txt',
    ]);
    expect(names(visibleItems(items, 'b tag:Blue', false, ['tag'], lookup))).toEqual([
      'budget.pdf',
    ]);
    // By the first tag's place among the person's (a tag of nobody's list after), untagged last.
    expect(names(sortItems(items, { column: 'tags', direction: 'ascending' }, lookup))).toEqual([
      'urgent.txt',
      'budget.pdf',
      'both.txt',
      'plain.txt',
    ]);
  });
});
