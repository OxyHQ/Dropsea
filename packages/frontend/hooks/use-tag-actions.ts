/**
 * What changes tags, wherever they live: the items' own (a file on this device
 * through the platform, an Oxy Files asset through Dropsea's backend) and the
 * person's tags themselves. Renaming or deleting one of the person's tags
 * renames or removes it on every item that has it, on this device (found by the
 * platform's index) and in Oxy Files, as Finder's Tags settings do.
 *
 * A name the person types that is none of their tags becomes one, as Finder
 * adds it to its list.
 */
import { usePlatformFiles } from '@oxy.so/bloom/platform-surface';
import { toast } from '@oxy.so/bloom/toast';
import { useQueryClient } from '@tanstack/react-query';
import { cloudTagsKey, LOCAL_TAGS_KEY } from '@/hooks/use-item-tags';
import { useLocale } from '@/hooks/use-locale';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import { useViewer } from '@/hooks/use-viewer';
import {
  changeFileTags,
  HAS_DROPSEA_BACKEND,
  removeFileTag,
  renameFileTag,
} from '@/lib/dropsea-api';
import { assetIdOf, type Item } from '@/lib/items';
import {
  type ItemTag,
  isSameTag,
  renamedDefinitions,
  type TagDefinition,
  tagColorOf,
  definitionsByKey,
  withDefinition,
  withoutDefinition,
} from '@/lib/tags';

/**
 * Whether an item's tags can change: a file on this device, or an Oxy Files
 * asset where this build has Dropsea's backend (which keeps an asset's tags);
 * not an album, nor what is in a Trash.
 */
export function canTag(item: Item): boolean {
  if (item.source === 'local') return true;
  return HAS_DROPSEA_BACKEND && (item.source === 'cloud' || item.source === 'album-photo');
}

export interface TagChange {
  add?: readonly ItemTag[];
  remove?: readonly string[];
}

export function useTagActions() {
  const files = usePlatformFiles();
  const tags = files?.tags;
  const queryClient = useQueryClient();
  const { strings } = useLocale();
  const { userId, isSignedIn } = useViewer();
  const { definitions, save } = useTagDefinitions();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: LOCAL_TAGS_KEY });
    queryClient.invalidateQueries({ queryKey: cloudTagsKey(userId) });
  };

  /** The person's tags with every added name among them (a new one with no colour, out of the sidebar). */
  const remember = async (added: readonly ItemTag[]) => {
    let next: readonly TagDefinition[] = definitions;
    for (const tag of added) {
      next = withDefinition(next, { name: tag.name, color: tag.color, isFavourite: false });
    }
    if (next.length !== definitions.length) await save(next);
  };

  /** Changes the tags of `items`; a toast says how many could not change. */
  const change = async (items: readonly Item[], tagChange: TagChange): Promise<void> => {
    const known = definitionsByKey(definitions);
    // A tag goes on an item with its colour, so a file going to a Mac shows it there too.
    const add = (tagChange.add ?? []).map((tag) => ({
      name: tag.name.trim(),
      color: tagColorOf(tag, known),
    }));
    const remove = tagChange.remove ?? [];
    const local = items.flatMap((item) => (item.source === 'local' ? [item.uri] : []));
    const assets = [
      ...new Set(
        items.flatMap((item) =>
          item.source === 'cloud' || item.source === 'album-photo' ? [assetIdOf(item) ?? ''] : [],
        ),
      ),
    ].filter((id) => id !== '');
    let failed = 0;
    try {
      await remember(add);
    } catch (error) {
      console.warn('Dropsea could not keep a new tag among the person’s tags', { add, error });
    }
    if (local.length > 0) {
      if (tags) {
        const outcomes = await tags.change(local, { add, remove });
        for (const outcome of outcomes) {
          if (!outcome.ok) {
            failed++;
            console.warn('The platform could not change a file’s tags', outcome);
          }
        }
      } else {
        failed += local.length;
      }
    }
    if (assets.length > 0) {
      try {
        if (!isSignedIn) throw new Error('Oxy Files needs the person signed in');
        await changeFileTags(
          assets,
          add.map((tag) => tag.name),
          remove,
        );
      } catch (error) {
        failed += assets.length;
        console.warn('Dropsea could not change the tags of Oxy Files assets', { assets, error });
      }
    }
    refresh();
    if (failed > 0) toast.error(strings.tags.couldNotChange(failed));
  };

  /** Every item tagged `name` on this device, from the platform's index. */
  const localTagged = async (name: string): Promise<string[]> =>
    tags ? (await tags.tagged(name)).map((found) => found.uri) : [];

  /** Renames one of the person's tags, and the tag on every item that has it. */
  const rename = async (from: string, to: string): Promise<void> => {
    if (isSameTag(from, to) && from.trim() === to.trim()) return;
    const definition = definitions.find((each) => isSameTag(each.name, from));
    await save(renamedDefinitions(definitions, from, to));
    let failed = 0;
    const uris = await localTagged(from);
    if (tags && uris.length > 0) {
      const outcomes = await tags.change(uris, {
        // A change of case alone is the same tag: removing it first, then adding, renames it.
        remove: [from],
        add: [{ name: to.trim(), color: definition?.color ?? null }],
      });
      failed += outcomes.filter((outcome) => !outcome.ok).length;
    }
    if (isSignedIn && HAS_DROPSEA_BACKEND) {
      try {
        await renameFileTag(from, to.trim());
      } catch (error) {
        failed++;
        console.warn('Dropsea could not rename a tag in Oxy Files', { from, to, error });
      }
    }
    refresh();
    if (failed > 0) toast.error(strings.tags.couldNotChange(failed));
  };

  /** Deletes one of the person's tags, and takes it off every item that has it. */
  const remove = async (name: string): Promise<void> => {
    await save(withoutDefinition(definitions, name));
    let failed = 0;
    const uris = await localTagged(name);
    if (tags && uris.length > 0) {
      const outcomes = await tags.change(uris, { remove: [name] });
      failed += outcomes.filter((outcome) => !outcome.ok).length;
    }
    if (isSignedIn && HAS_DROPSEA_BACKEND) {
      try {
        await removeFileTag(name);
      } catch (error) {
        failed++;
        console.warn('Dropsea could not delete a tag in Oxy Files', { name, error });
      }
    }
    refresh();
    if (failed > 0) toast.error(strings.tags.couldNotChange(failed));
  };

  return { change, rename, remove, definitions, save };
}
