/**
 * Every item with a tag, as a Mac's sidebar tag shows them: this device's
 * files from the platform's index of tags (never a walk of the disk), and the
 * person's Oxy Files from Dropsea's backend, each asset read with the person's
 * own session.
 */
import type { AssetRecord } from '@oxy.so/core';
import { usePlatformFiles } from '@oxy.so/bloom/platform-surface';
import { useQuery } from '@tanstack/react-query';
import { cloudTagsKey, LOCAL_TAGS_KEY } from '@/hooks/use-item-tags';
import { useViewer } from '@/hooks/use-viewer';
import { listTaggedAssets } from '@/lib/dropsea-api';
import { cloudItem, type Item, localItem } from '@/lib/items';
import { oxyServices } from '@/lib/oxy';
import { tagKey } from '@/lib/tags';

/** The most assets read at once. */
const READ_BATCH = 20;

async function readAssets(assetIds: readonly string[]): Promise<AssetRecord[]> {
  const records: AssetRecord[] = [];
  for (let start = 0; start < assetIds.length; start += READ_BATCH) {
    const batch = await Promise.allSettled(
      assetIds.slice(start, start + READ_BATCH).map((id) => oxyServices.assets.get(id)),
    );
    for (const [index, result] of batch.entries()) {
      if (result.status === 'fulfilled') {
        // A trashed asset keeps its tags, but is not shown with them until it is put back, as Finder's.
        if (result.value.file.status === 'active') records.push(result.value.file);
      } else {
        console.warn('Dropsea could not read a tagged Oxy Files asset; it is left out', {
          assetId: assetIds[start + index],
          error: result.reason,
        });
      }
    }
  }
  return records;
}

async function allTaggedAssets(name: string): Promise<string[]> {
  const assetIds: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await listTaggedAssets(name, cursor);
    assetIds.push(...page.assetIds);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return assetIds;
}

export function useTaggedItems(name: string): {
  items: Item[];
  status: 'ready' | 'loading' | 'error';
  retry: () => void;
} {
  const tags = usePlatformFiles()?.tags;
  const { userId, isSignedIn } = useViewer();
  const key = tagKey(name);
  const local = useQuery({
    queryKey: [...LOCAL_TAGS_KEY, 'tagged', key],
    queryFn: async () =>
      (tags ? await tags.tagged(name) : []).map((found) =>
        localItem({
          uri: found.uri,
          name: found.name,
          isDirectory: found.isDirectory,
          size: found.size,
          modifiedAt: found.lastModified,
        }),
      ),
    enabled: tags !== undefined,
  });
  const cloud = useQuery({
    queryKey: [...cloudTagsKey(userId), 'tagged', key],
    queryFn: async () => (await readAssets(await allTaggedAssets(name))).map(cloudItem),
    enabled: isSignedIn,
  });
  const parts = [...(tags ? [local] : []), ...(isSignedIn ? [cloud] : [])];
  const items = [...(local.data ?? []), ...(cloud.data ?? [])];
  const status = parts.some((part) => part.isPending)
    ? 'loading'
    : parts.length > 0 && parts.every((part) => part.isError)
      ? 'error'
      : 'ready';
  for (const part of parts) {
    if (part.isError)
      console.warn('Dropsea could not list items with a tag', { name, error: part.error });
  }
  return {
    items,
    status,
    retry: () => {
      for (const part of parts) part.refetch();
    },
  };
}
