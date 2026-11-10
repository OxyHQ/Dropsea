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
import { useBrowser } from '@/components/BrowserProvider';
import { cloudTagsKey, itemTagOf, LOCAL_TAGS_KEY } from '@/hooks/use-item-tags';
import { useLocale } from '@/hooks/use-locale';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import { useViewer } from '@/hooks/use-viewer';
import {
  changeFileTags,
  HAS_DROPSEA_BACKEND,
  lookupFileTags,
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
import type { TagTarget, UndoEntry } from '@/lib/undo';

type TaggedEntry = Extract<UndoEntry, { kind: 'tagged' }>;

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
  const { undoHistory } = useBrowser();

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

  /**
   * Changes the tags of `items`, a step of the window's Undo history (ADR 0002) with each item's
   * tags before and after; a toast says how many could not change.
   */
  const change = async (items: readonly Item[], tagChange: TagChange): Promise<void> => {
    const known = definitionsByKey(definitions);
    // A tag goes on an item with its colour, so a file going to a Mac shows it there too.
    const add = (tagChange.add ?? []).map((tag) => ({
      name: tag.name.trim(),
      color: tagColorOf(tag, known),
    }));
    const remove = tagChange.remove ?? [];
    const local = items.flatMap((item) =>
      item.source === 'local' ? [{ uri: item.uri, name: item.name }] : [],
    );
    const assetNames = new Map<string, string>();
    for (const item of items) {
      const assetId =
        item.source === 'cloud' || item.source === 'album-photo' ? assetIdOf(item) : null;
      if (assetId && !assetNames.has(assetId)) assetNames.set(assetId, item.name);
    }
    const assets = [...assetNames.keys()];
    const entries: TaggedEntry[] = [];
    const changed = (target: TagTarget, name: string, before: ItemTag[], after: ItemTag[]) => {
      const isSame =
        before.length === after.length &&
        before.every((tag) => after.some((other) => isSameTag(other.name, tag.name)));
      if (!isSame) entries.push({ kind: 'tagged', target, name, before, after });
    };
    let failed = 0;
    try {
      await remember(add);
    } catch (error) {
      console.warn('Dropsea could not keep a new tag among the person’s tags', { add, error });
    }
    if (local.length > 0) {
      if (tags) {
        const uris = local.map((item) => item.uri);
        const before = await tags.ofItems(uris);
        const outcomes = await tags.change(uris, { add, remove });
        const after = await tags.ofItems(uris);
        outcomes.forEach((outcome, index) => {
          const item = local[index];
          if (!outcome.ok) {
            failed++;
            console.warn('The platform could not change a file’s tags', outcome);
            return;
          }
          if (!item) return;
          changed(
            { kind: 'file', uri: item.uri },
            item.name,
            (before[index] ?? []).map(itemTagOf),
            (after[index] ?? []).map(itemTagOf),
          );
        });
      } else {
        failed += local.length;
      }
    }
    if (assets.length > 0) {
      try {
        if (!isSignedIn) throw new Error('Oxy Files needs the person signed in');
        const before = await lookupFileTags(assets, 'person');
        const after = await changeFileTags(
          assets,
          add.map((tag) => tag.name),
          remove,
        );
        const named = (names: readonly string[] | undefined): ItemTag[] =>
          (names ?? []).map((name) => ({ name, color: null }));
        for (const [assetId, name] of assetNames) {
          changed({ kind: 'asset', assetId }, name, named(before[assetId]), named(after[assetId]));
        }
      } catch (error) {
        failed += assets.length;
        console.warn('Dropsea could not change the tags of Oxy Files assets', { assets, error });
      }
    }
    undoHistory.record('tags', entries[0]?.name ?? '', entries);
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
