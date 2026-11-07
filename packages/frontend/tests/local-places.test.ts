import { describe, expect, test } from 'bun:test';
import {
  isSameUri,
  isWithinUri,
  type LocalPlace,
  parentUri,
  pathParts,
  placeOf,
  uriName,
} from '@/lib/local-places';

const PLACES: LocalPlace[] = [
  { kind: 'home', name: 'ada', uri: 'file:///home/ada' },
  { kind: 'documents', name: 'Documentos', uri: 'file:///home/ada/Documents/' },
  { kind: 'volume', name: 'USB Stick', uri: 'file:///media/ada/USB%20Stick' },
];

describe('local URIs', () => {
  test('have parents and names, a trailing slash and escapes aside', () => {
    expect(parentUri('file:///home/ada/Documents/')).toBe('file:///home/ada');
    expect(parentUri('file:///home')).toBe('file:///');
    expect(uriName('file:///media/ada/USB%20Stick/')).toBe('USB Stick');
    expect(isSameUri('file:///home/ada/My%20Folder/', 'file:///home/ada/My Folder')).toBe(true);
  });

  test('are within a folder by whole names', () => {
    expect(isWithinUri('file:///home/ada/Documents', 'file:///home/ada')).toBe(true);
    expect(isWithinUri('file:///home/adam', 'file:///home/ada')).toBe(false);
  });

  test('are in the deepest place that holds them, or none', () => {
    expect(placeOf('file:///home/ada/Documents/Taxes', PLACES)?.kind).toBe('documents');
    expect(placeOf('file:///media/ada/USB Stick/DCIM', PLACES)?.kind).toBe('volume');
    expect(placeOf('file:///etc', PLACES)).toBeNull();
  });

  test('read in the path bar from the root of their place, keeping their escapes', () => {
    expect(pathParts('file:///home/ada/Documents/Taxes%202026/', PLACES, 'Computer')).toEqual([
      { name: 'ada', uri: 'file:///home/ada' },
      { name: 'Documentos', uri: 'file:///home/ada/Documents' },
      { name: 'Taxes 2026', uri: 'file:///home/ada/Documents/Taxes%202026' },
    ]);
    expect(
      pathParts('file:///media/ada/USB%20Stick/DCIM', PLACES, 'Computer').map((part) => part.name),
    ).toEqual(['USB Stick', 'DCIM']);
    expect(pathParts('file:///srv/shared/', PLACES, 'Computer')).toEqual([
      { name: 'Computer', uri: 'file:///' },
      { name: 'srv', uri: 'file:///srv' },
      { name: 'shared', uri: 'file:///srv/shared' },
    ]);
    expect(pathParts('file:///home/ada', PLACES, 'Computer')).toEqual([
      { name: 'ada', uri: 'file:///home/ada' },
    ]);
  });
});
