/**
 * The tags of the items a place shows, wherever each item's tags live: a file
 * on this device in the file itself, read through the platform (`files.tags`);
 * an Oxy Files asset (in Oxy Files, Photos, an album or its trash) in Dropsea's
 * backend; an item in this device's Trash as the platform listed it.
 *
 * The platform says when any file's tags change (its index of tags follows the
 * person's places), so what is shown follows a change made anywhere: here, in
 * another window, by another application.
 */
import { type PlatformFileTag, usePlatformFiles } from '@oxy.so/bloom/platform-surface';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import { useViewer } from '@/hooks/use-viewer';
import { listFileTagNames, lookupFileTags } from '@/lib/dropsea-api';
import { assetIdOf, type Item } from '@/lib/items';
import { normalizeUri } from '@/lib/local-places';
import type { TagLookup } from '@/lib/sorting';
import { type ItemTag, isTagColor, tagOrder } from '@/lib/tags';

/** Every query of this device's files' tags, which a change to any file's tags invalidates. */
export const LOCAL_TAGS_KEY = ['local-tags'] as const;

/** The query key of Oxy Files' tags, which a change to any asset's tags invalidates. */
export function cloudTagsKey(userId: string | null) {
  return ['cloud-tags', userId] as const;
}

/** The most asset ids one lookup asks for, as the backend takes them. */
const LOOKUP_BATCH = 500;

const NONE: readonly ItemTag[] = [];

/** A platform's tag as Dropsea's: a colour it does not know is none. */
export function itemTagOf(tag: PlatformFileTag): ItemTag {
  return { name: tag.name, color: isTagColor(tag.color) ? tag.color : null };
}

function itemTagsOf(tags: readonly PlatformFileTag[]): ItemTag[] {
  return tags.map(itemTagOf);
}

/**
 * Follows the platform's tags while Dropsea runs: whatever changes a file's
 * tags, what shows them reads them again. One per window.
 */
export function useLocalTagsFollowed(): void {
  const tags = usePlatformFiles()?.tags;
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!tags) return undefined;
    return tags.watch(() => {
      queryClient.invalidateQueries({ queryKey: LOCAL_TAGS_KEY });
    });
  }, [tags, queryClient]);
}

async function lookupAll(assetIds: readonly string[]): Promise<Map<string, ItemTag[]>> {
  const found = new Map<string, ItemTag[]>();
  for (let start = 0; start < assetIds.length; start += LOOKUP_BATCH) {
    const answer = await lookupFileTags(assetIds.slice(start, start + LOOKUP_BATCH));
    for (const [assetId, names] of Object.entries(answer)) {
      found.set(
        assetId,
        names.map((name) => ({ name, color: null })),
      );
    }
  }
  return found;
}

/**
 * The tags of `items`: what a place sorts, finds, groups and draws them by.
 * `folderUri` is the folder the place is, when it is one: its files' tags are
 * read in one look at the folder.
 */
export function useItemTags(items: readonly Item[], folderUri: string | null): TagLookup {
  const tags = usePlatformFiles()?.tags;
  const { userId, isSignedIn } = useViewer();
  const { definitions } = useTagDefinitions();

  const localUris = folderUri
    ? []
    : items.flatMap((item) => (item.source === 'local' ? [item.uri] : []));
  const folder = useQuery({
    queryKey: [...LOCAL_TAGS_KEY, 'folder', folderUri === null ? '' : normalizeUri(folderUri)],
    queryFn: async () => {
      const found = tags && folderUri ? await tags.inFolder(folderUri) : {};
      return new Map(
        Object.entries(found).map(([uri, each]) => [normalizeUri(uri), itemTagsOf(each)]),
      );
    },
    enabled: tags !== undefined && folderUri !== null,
  });
  const scattered = useQuery({
    queryKey: [...LOCAL_TAGS_KEY, 'items', ...localUris.map(normalizeUri).sort()],
    queryFn: async () => {
      const found = tags ? await tags.ofItems(localUris) : [];
      return new Map(
        localUris.map((uri, index) => [normalizeUri(uri), itemTagsOf(found[index] ?? [])]),
      );
    },
    enabled: tags !== undefined && localUris.length > 0,
  });

  const assetIds = [
    ...new Set(items.flatMap((item) => (item.source === 'album' ? [] : [assetIdOf(item)]))),
  ]
    .filter((id): id is string => id !== null)
    .sort();
  const cloud = useQuery({
    queryKey: [...cloudTagsKey(userId), ...assetIds],
    queryFn: () => lookupAll(assetIds),
    enabled: isSignedIn && assetIds.length > 0,
  });

  const order = tagOrder(definitions);
  const tagsOf = (item: Item): readonly ItemTag[] => {
    switch (item.source) {
      case 'local': {
        const key = normalizeUri(item.uri);
        return folder.data?.get(key) ?? scattered.data?.get(key) ?? NONE;
      }
      case 'local-trash':
        return item.tags;
      case 'album':
        return NONE;
      default:
        return cloud.data?.get(item.assetId) ?? NONE;
    }
  };
  return { tagsOf, order };
}

/**
 * Every tag name found on the person's items (on this device's files, from the
 * platform's index; on Oxy Files, from Dropsea's backend): what a tags field
 * offers besides the person's own tags.
 */
export function useFoundTagNames(isEnabled: boolean): string[] {
  const { userId, isSignedIn } = useViewer();
  const local = useLocalTagNames(isEnabled);
  const cloud = useQuery({
    queryKey: [...cloudTagsKey(userId), 'names'],
    queryFn: async () => (await listFileTagNames()).map((found) => found.name),
    enabled: isEnabled && isSignedIn,
  });
  return [...local, ...(cloud.data ?? [])];
}

/** Every tag name the platform's index found on this device's files: what a search of them offers. */
export function useLocalTagNames(isEnabled: boolean): string[] {
  const tags = usePlatformFiles()?.tags;
  const local = useQuery({
    queryKey: [...LOCAL_TAGS_KEY, 'names'],
    queryFn: async () => (tags ? (await tags.names()).map((found) => found.name) : []),
    enabled: isEnabled && tags !== undefined,
  });
  return local.data ?? [];
}
