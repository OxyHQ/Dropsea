/**
 * Where each location lives in Dropsea's routes, both ways, so a link opens the
 * place it names and every place has a link: `/files?uri=…` (a folder on this
 * device, by its URI), `/cloud`, `/photos`, `/albums`, `/albums/[id]` and
 * `/trash`.
 */
import type { Href } from 'expo-router';
import type { Location } from '@/lib/items';

export function hrefFor(location: Location): Href {
  switch (location.kind) {
    case 'folder':
      return { pathname: '/files', params: { uri: location.uri } };
    case 'cloud':
      return '/cloud';
    case 'photos':
      return '/photos';
    case 'albums':
      return '/albums';
    case 'album':
      return { pathname: '/albums/[id]', params: { id: location.albumId } };
    case 'trash':
      return '/trash';
  }
}

function firstParam(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first ? first : null;
}

/** The location a route shows, or null for a route that names none (the start, a bad link). */
export function locationFromRoute(
  pathname: string,
  params: Record<string, string | string[] | undefined>,
): Location | null {
  const segments = pathname.split('/').filter(Boolean);
  const [section, id] = segments;
  switch (section) {
    case 'files': {
      const uri = firstParam(params.uri);
      return uri?.startsWith('file://') ? { kind: 'folder', uri } : null;
    }
    case 'cloud':
      return { kind: 'cloud' };
    case 'photos':
      return { kind: 'photos' };
    case 'albums':
      return id ? { kind: 'album', albumId: decodeURIComponent(id) } : { kind: 'albums' };
    case 'trash':
      return { kind: 'trash' };
    default:
      return null;
  }
}
