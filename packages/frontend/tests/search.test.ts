import { describe, expect, test } from 'bun:test';
import type { PlatformSearchToken } from '@oxy.so/bloom/platform-surface';
import {
  platformSearchQuery,
  type SearchSuggestion,
  searchResults,
  searchSuggestions,
  textAfterChoosing,
  tokenKey,
  tokenLabel,
  withoutToken,
  withToken,
} from '@/lib/search';
import { stringsFor } from '@/lib/strings';

const en = stringsFor('en').searching;
const es = stringsFor('es').searching;
const TAGS = ['Red', 'Work', 'Weekend plans', 'Receipts'];

function offered(
  text: string,
  {
    words = en,
    tagNames = TAGS,
    chosen = [],
  }: {
    words?: typeof en;
    tagNames?: readonly string[];
    chosen?: readonly PlatformSearchToken[];
  } = {},
): SearchSuggestion[] {
  return searchSuggestions(text, { words, tagNames, chosen });
}

function tokensOf(suggestions: readonly SearchSuggestion[]): PlatformSearchToken[] {
  return suggestions.map((suggestion) => suggestion.token);
}

describe('search suggestions', () => {
  test('offer the kinds whose English names start with the word typed, case aside', () => {
    expect(tokensOf(offered('pd'))).toEqual([
      { kind: 'category', value: 'pdf' },
      { kind: 'name', value: 'pd' },
    ]);
    expect(tokensOf(offered('PRES')).at(0)).toEqual({ kind: 'category', value: 'presentation' });
    expect(offered('pres').at(0)?.label).toBe('Presentation');
  });

  test('find a kind by its other words too: Developer by "source", Movie by "video"', () => {
    expect(tokensOf(offered('sour'))).toContainEqual({ kind: 'category', value: 'source' });
    expect(tokensOf(offered('vid'))).toContainEqual({ kind: 'category', value: 'movie' });
    expect(offered('sour').find((each) => each.section === 'kinds')?.label).toBe('Developer');
  });

  test('match the kinds in Spanish by their Spanish names, accents aside', () => {
    expect(tokensOf(offered('pel', { words: es }))).toContainEqual({
      kind: 'category',
      value: 'movie',
    });
    expect(tokensOf(offered('musica', { words: es }))).toContainEqual({
      kind: 'category',
      value: 'music',
    });
    // A word of the name, not only its start: "cálculo" of "Hoja de cálculo".
    expect(tokensOf(offered('calc', { words: es }))).toContainEqual({
      kind: 'category',
      value: 'spreadsheet',
    });
    expect(offered('hoja', { words: es }).at(0)?.label).toBe('Hoja de cálculo');
    // The English name is not the Spanish one.
    expect(tokensOf(offered('movie', { words: es }))).not.toContainEqual({
      kind: 'category',
      value: 'movie',
    });
  });

  test('offer the tags whose names, or a word of them, start with the word, each once', () => {
    expect(tokensOf(offered('w')).filter((token) => token.kind === 'tag')).toEqual([
      { kind: 'tag', value: 'Work' },
      { kind: 'tag', value: 'Weekend plans' },
    ]);
    expect(tokensOf(offered('plan'))).toContainEqual({ kind: 'tag', value: 'Weekend plans' });
    expect(
      tokensOf(offered('re', { tagNames: ['Red', 'red', 'Receipts'] })).filter(
        (token) => token.kind === 'tag',
      ),
    ).toEqual([
      { kind: 'tag', value: 'Red' },
      { kind: 'tag', value: 'Receipts' },
    ]);
  });

  test('offer the dates by any word of their names, in the language', () => {
    expect(tokensOf(offered('tod'))).toContainEqual({ kind: 'date', value: 'today' });
    expect(tokensOf(offered('week'))).toContainEqual({ kind: 'date', value: 'week' });
    expect(tokensOf(offered('ayer', { words: es }))).toContainEqual({
      kind: 'date',
      value: 'yesterday',
    });
    expect(tokensOf(offered('año', { words: es }))).toContainEqual({ kind: 'date', value: 'year' });
  });

  test('end with "Name matches" for the whole text, in sections in Finder’s order', () => {
    const suggestions = offered('report wo');
    expect(suggestions.map((each) => each.section)).toEqual(['tags', 'name']);
    expect(suggestions.at(-1)).toEqual({
      token: { kind: 'name', value: 'report wo' },
      section: 'name',
      label: 'Name matches: “report wo”',
    });
    expect(offered('ye').map((each) => each.section)).toEqual(['dates', 'dates', 'name']);
  });

  test('offer filters for the word being typed only, and none once a space ends it', () => {
    expect(tokensOf(offered('pdf '))).toEqual([{ kind: 'name', value: 'pdf' }]);
    expect(offered('   ')).toEqual([]);
    expect(offered('')).toEqual([]);
  });

  test('offer a typed filter as a name only', () => {
    expect(tokensOf(offered('kind:pdf'))).toEqual([{ kind: 'name', value: 'kind:pdf' }]);
  });

  test('never offer a filter already chosen', () => {
    const chosen: PlatformSearchToken[] = [
      { kind: 'category', value: 'pdf' },
      { kind: 'tag', value: 'work' },
    ];
    expect(tokensOf(offered('p', { chosen }))).not.toContainEqual({
      kind: 'category',
      value: 'pdf',
    });
    expect(tokensOf(offered('wor', { chosen }))).not.toContainEqual({ kind: 'tag', value: 'Work' });
  });

  test('take the word offered for out of the text, or all of it for a name', () => {
    const [kind] = offered('invoice pd');
    if (!kind) throw new Error('expected a suggestion');
    expect(textAfterChoosing('invoice pd', kind)).toBe('invoice ');
    expect(textAfterChoosing('pd', kind)).toBe('');
    const name = offered('invoice pd').at(-1);
    if (!name) throw new Error('expected a suggestion');
    expect(textAfterChoosing('invoice pd', name)).toBe('');
  });
});

describe('search tokens', () => {
  test('are labelled by their filter and value, in the language', () => {
    expect(tokenLabel({ kind: 'category', value: 'pdf' }, en)).toBe('Kind: PDF');
    expect(tokenLabel({ kind: 'category', value: 'source' }, en)).toBe('Kind: Developer');
    expect(tokenLabel({ kind: 'tag', value: 'Work' }, en)).toBe('Tag: Work');
    expect(tokenLabel({ kind: 'date', value: 'today' }, en)).toBe('Date: Today');
    expect(tokenLabel({ kind: 'name', value: 'report' }, en)).toBe('Name: report');
    expect(tokenLabel({ kind: 'category', value: 'movie' }, es)).toBe('Clase: Película');
    expect(tokenLabel({ kind: 'date', value: 'week' }, es)).toBe('Fecha: Esta semana');
  });

  test('are keyed by filter and value, case aside', () => {
    expect(tokenKey({ kind: 'tag', value: 'Work' })).toBe(tokenKey({ kind: 'tag', value: 'work' }));
    expect(tokenKey({ kind: 'tag', value: 'pdf' })).not.toBe(
      tokenKey({ kind: 'category', value: 'pdf' }),
    );
  });

  test('a kind or a date replaces its own, tags and names add up, one of each', () => {
    let tokens: PlatformSearchToken[] = [];
    tokens = withToken(tokens, { kind: 'category', value: 'pdf' });
    tokens = withToken(tokens, { kind: 'tag', value: 'Work' });
    tokens = withToken(tokens, { kind: 'tag', value: 'Red' });
    tokens = withToken(tokens, { kind: 'tag', value: 'work' });
    tokens = withToken(tokens, { kind: 'date', value: 'today' });
    tokens = withToken(tokens, { kind: 'category', value: 'image' });
    tokens = withToken(tokens, { kind: 'date', value: 'week' });
    expect(tokens).toEqual([
      { kind: 'tag', value: 'Work' },
      { kind: 'tag', value: 'Red' },
      { kind: 'category', value: 'image' },
      { kind: 'date', value: 'week' },
    ]);
    expect(withoutToken(tokens, 'tag:work')).toEqual([
      { kind: 'tag', value: 'Red' },
      { kind: 'category', value: 'image' },
      { kind: 'date', value: 'week' },
    ]);
  });
});

describe('the platform search query', () => {
  const tokens: PlatformSearchToken[] = [
    { kind: 'category', value: 'pdf' },
    { kind: 'tag', value: 'Work' },
  ];

  test('carries the text and the tokens as the platform takes them', () => {
    expect(
      platformSearchQuery({
        text: '  invoice ',
        tokens,
        scope: 'computer',
        folderUri: 'file:///home/ada/Documents',
        language: 'es',
      }),
    ).toEqual({ text: 'invoice', tokens, language: 'es' });
  });

  test('looks within the folder shown for its scope, and anywhere for the computer’s', () => {
    const asked = (scope: 'computer' | 'folder') =>
      platformSearchQuery({
        text: 'invoice',
        tokens: [],
        scope,
        folderUri: 'file:///home/ada/Documents',
        language: 'en',
      });
    expect(asked('folder')?.within).toEqual(['file:///home/ada/Documents']);
    expect(asked('computer')).not.toHaveProperty('within');
  });

  test('asks nothing while the field holds neither words nor tokens', () => {
    const query = (text: string, chosen: readonly PlatformSearchToken[]) =>
      platformSearchQuery({
        text,
        tokens: chosen,
        scope: 'computer',
        folderUri: 'file:///home/ada',
        language: 'en',
      });
    expect(query(' ', [])).toBeNull();
    expect(query('', tokens)).toEqual({ text: '', tokens, language: 'en' });
  });
});

describe('search results', () => {
  test('are the files and folders found, as local items, with where each is', () => {
    const found = searchResults({
      items: [
        {
          id: 'file:///home/ada/Documents/Work/',
          category: 'folder',
          title: 'Work',
          uri: 'file:///home/ada/Documents/Work/',
          modified: 10,
          location: 'Documents',
        },
        {
          id: 'file:///home/ada/Documents/Work/invoice.pdf',
          category: 'pdf',
          title: 'invoice.pdf',
          uri: 'file:///home/ada/Documents/Work/invoice.pdf',
          contentType: 'application/pdf',
          size: 2048,
          modified: 20,
          location: 'Documents › Work',
        },
        { id: 'settings:network', category: 'settings', title: 'Network', url: 'oxyos://x' },
      ],
      topHit: null,
      indexing: false,
    });
    expect(found).toHaveLength(2);
    expect(found[0]?.item).toMatchObject({
      source: 'local',
      key: 'file:///home/ada/Documents/Work/',
      name: 'Work',
      isFolder: true,
      size: null,
      modifiedAt: 10,
    });
    expect(found[1]).toMatchObject({
      id: 'file:///home/ada/Documents/Work/invoice.pdf',
      location: 'Documents › Work',
      item: { name: 'invoice.pdf', isFolder: false, size: 2048, mime: 'application/pdf' },
    });
  });
});
