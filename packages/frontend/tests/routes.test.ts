import { describe, expect, test } from 'bun:test';
import type { Location } from '@/lib/items';
import { hrefFor, locationFromRoute } from '@/lib/routes';

describe('routes', () => {
  test('give every location a link that opens it again', () => {
    const locations: Location[] = [
      { kind: 'folder', uri: 'file:///home/ada/My%20Files/' },
      {
        kind: 'folder',
        uri: 'file:///home/ada/Documents',
        select: 'file:///home/ada/Documents/Work%20Notes/',
      },
      { kind: 'cloud' },
      { kind: 'photos' },
      { kind: 'albums' },
      { kind: 'album', albumId: 'al 1' },
      { kind: 'trash' },
    ];
    for (const location of locations) {
      const href = hrefFor(location);
      const pathname = typeof href === 'string' ? href : href.pathname;
      const params = typeof href === 'string' ? {} : (href.params ?? {});
      const filled = Object.entries(params).reduce(
        (path, [name, value]) => path.replace(`[${name}]`, encodeURIComponent(String(value))),
        pathname,
      );
      const query = Object.fromEntries(
        Object.entries(params).map(([name, value]) => [name, String(value)]),
      );
      expect(locationFromRoute(filled, query)).toEqual(location);
    }
  });

  test('name no location for the start or a link to something that is not a local file', () => {
    expect(locationFromRoute('/', {})).toBeNull();
    expect(locationFromRoute('/files', { uri: 'https://example.com/x' })).toBeNull();
    expect(locationFromRoute('/files', {})).toBeNull();
    expect(locationFromRoute('/files', { uri: ['file:///a', 'file:///b'] })).toEqual({
      kind: 'folder',
      uri: 'file:///a',
    });
  });

  test('name the item a reveal selects, as Spotlight links to it, and only a local one', () => {
    expect(
      locationFromRoute('/files', {
        uri: 'file:///home/ada/Documents',
        select: 'file:///home/ada/Documents/invoice.pdf',
      }),
    ).toEqual({
      kind: 'folder',
      uri: 'file:///home/ada/Documents',
      select: 'file:///home/ada/Documents/invoice.pdf',
    });
    expect(
      locationFromRoute('/files', { uri: 'file:///home/ada', select: 'https://example.com/x' }),
    ).toEqual({ kind: 'folder', uri: 'file:///home/ada' });
    expect(hrefFor({ kind: 'folder', uri: 'file:///home/ada' })).toEqual({
      pathname: '/files',
      params: { uri: 'file:///home/ada' },
    });
  });
});
