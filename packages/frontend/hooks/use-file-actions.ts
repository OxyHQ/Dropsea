import {
  type PlatformFileOutcome,
  usePlatformFiles,
  usePlatformSounds,
} from '@oxy.so/bloom/platform-surface';
import { toast } from '@oxy.so/bloom/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useBrowser } from '@/components/BrowserProvider';
import { cloudFilesKey } from '@/hooks/use-cloud-files';
import { cloudTagsKey, LOCAL_TAGS_KEY } from '@/hooks/use-item-tags';
import { useLocale } from '@/hooks/use-locale';
import { PLATFORM_TRASH_KEY } from '@/hooks/use-trash';
import { useViewer } from '@/hooks/use-viewer';
import { refreshFolder } from '@/lib/folder-store';
import type { CloudItem, Item, LocalItem, TrashItem } from '@/lib/items';
import {
  type ChangeProblem,
  createFolder,
  deleteItems,
  itemsAtUris,
  type LocalOutcome,
  namesIn,
  type Relocation,
  relocateItem,
  renameItem,
} from '@/lib/local-files';
import { isSameUri, parentUri, uriName } from '@/lib/local-places';
import { copyName, freeName } from '@/lib/names';
import {
  changeFileTags,
  forgetFileTags,
  HAS_DROPSEA_BACKEND,
  lookupFileTags,
} from '@/lib/dropsea-api';
import { inTurn, transferFiles } from '@/lib/operations';
import { oxyServices } from '@/lib/oxy';
import type { Replayed, UndoEntry, UndoPlatform } from '@/lib/undo';

/** Assets Oxy Files' trash is emptied in, a page at a time. */
const EMPTY_PAGE_SIZE = 100;

function isLocal(item: Item): item is LocalItem {
  return item.source === 'local';
}

function isCloud(item: Item): item is CloudItem {
  return item.source === 'cloud';
}

/**
 * What Dropsea does to items: new folders, renames, moves, copies and
 * duplicates on this device; the Trash (the platform's for this device's
 * files, Oxy Files' for the cloud's), putting back and deleting for good. Each
 * says what failed, shows what changed at once, and is a step of the window's
 * Undo history (ADR 0002), but deleting for good, which cannot be undone.
 */
export function useFileActions() {
  const files = usePlatformFiles();
  // The platform's own Trash sounds (OxyOS's, docs/adr/0044-system-sounds.mdx there): Dropsea
  // ships no sound of its own.
  const sounds = usePlatformSounds();
  const queryClient = useQueryClient();
  const { strings } = useLocale();
  const { userId, isSignedIn } = useViewer();
  const { undoHistory } = useBrowser();

  /** The platform's Trash, for what a Replace replaces. */
  const trash = files ? (uris: readonly string[]) => files.trash(uris) : null;
  /** What Undo and Redo act through. */
  const undoPlatform: UndoPlatform = {
    trash: files
      ? {
          trash: (uris) => files.trash(uris),
          trashed: () => files.trashed(),
          restore: (uris) => files.restore(uris),
        }
      : null,
    tags: files?.tags ?? null,
    cloud: isSignedIn
      ? {
          trash: (assetId) => oxyServices.assets.trash(assetId),
          restore: (assetId) => oxyServices.assets.restore(assetId),
          tags: HAS_DROPSEA_BACKEND
            ? {
                of: (assetIds) => lookupFileTags(assetIds, 'person'),
                change: changeFileTags,
              }
            : null,
        }
      : null,
  };
  const refreshCloud = () => queryClient.invalidateQueries({ queryKey: cloudFilesKey(userId) });
  const refreshPlatformTrash = () =>
    queryClient.invalidateQueries({ queryKey: PLATFORM_TRASH_KEY });

  const reportLocal = (outcomes: readonly LocalOutcome[]) => {
    const failed = outcomes.find((outcome) => !outcome.ok);
    if (failed && !failed.ok) toast.error(strings.fileProblems[failed.problem]);
  };
  const reportPlatform = (outcomes: readonly PlatformFileOutcome[]) => {
    const failed = outcomes.find((outcome) => !outcome.ok);
    if (failed && !failed.ok) toast.error(strings.fileProblems[failed.error]);
  };
  /**
   * Shows what an Undo or a Redo changed: the folders, both Trashes and the tags. `select` is
   * told what it placed first, so the folders show those items selected as they come, and the
   * selection is never seen empty between the two.
   */
  const showReplayed = async (
    done: Replayed | null,
    select: (uris: readonly string[]) => void,
  ): Promise<Replayed | null> => {
    if (!done) return null;
    if (done.ok) select(done.placed);
    for (const folder of done.folders) refreshFolder(folder);
    await Promise.all([
      refreshPlatformTrash(),
      refreshCloud(),
      queryClient.invalidateQueries({ queryKey: LOCAL_TAGS_KEY }),
      queryClient.invalidateQueries({ queryKey: cloudTagsKey(userId) }),
    ]);
    return done;
  };
  /**
   * Moves or copies items into a folder as Finder does (`lib/operations`): the clashes asked
   * about, the progress shown, and what was done undoable, shown where the items were and went.
   */
  const transfer = async (
    items: readonly LocalItem[],
    folder: { uri: string; name: string },
    relocation: Relocation,
  ) => {
    const result = await transferFiles({
      items,
      folderUri: folder.uri,
      folderName: folder.name,
      relocation,
      trash,
    });
    refreshFolder(folder.uri);
    if (!result) return;
    if (relocation === 'move') for (const item of items) refreshFolder(parentUri(item.uri));
    const [first] = result.relocated;
    if (first) {
      undoHistory.record(
        relocation,
        uriName(first.from),
        result.relocated.map(
          ({ from, to }): UndoEntry =>
            relocation === 'move' ? { kind: 'moved', from, to } : { kind: 'created', uri: to },
        ),
      );
    }
    reportLocal(result.outcomes);
    if (result.replaced.length > 0) await refreshPlatformTrash();
  };
  /**
   * Deletes an asset for good, and then the tags Dropsea kept for it: a tag outliving its file
   * would be found in no place. Their rows are only ever read by their owner, so one left behind
   * by a failure is said and does no harm.
   */
  const deleteAsset = async (assetId: string) => {
    await oxyServices.assets.delete(assetId);
    if (!HAS_DROPSEA_BACKEND) return;
    try {
      await forgetFileTags([assetId]);
    } catch (error) {
      console.warn('Dropsea deleted a file and could not forget its tags', { assetId, error });
    }
  };
  /** Runs a change on each cloud item, saying which failed; the items it changed. */
  const eachCloud = async <T extends { assetId: string; name: string }>(
    items: readonly T[],
    change: (assetId: string) => Promise<unknown>,
    action: string,
  ): Promise<T[]> => {
    const results = await Promise.allSettled(items.map((item) => change(item.assetId)));
    const changed: T[] = [];
    results.forEach((result, index) => {
      const item = items[index];
      if (!item) return;
      if (result.status === 'fulfilled') {
        changed.push(item);
        return;
      }
      console.warn(`Dropsea could not ${action} in Oxy Files`, {
        assetId: item.assetId,
        error: result.reason,
      });
      toast.error(strings.cloudProblem(item.name));
    });
    await refreshCloud();
    return changed;
  };

  /**
   * This device's items into the platform's Trash, Oxy Files' into its own; the platform's
   * move-to-trash sound once, as soon as any went, as Finder sounds a Move to Trash.
   */
  const moveToTrash = async (items: readonly Item[]): Promise<void> => {
    const local = items.filter(isLocal);
    const cloud = items.filter(isCloud);
    const entries: UndoEntry[] = [];
    const names: string[] = [];
    let hasSounded = false;
    if (local.length > 0 && files) {
      const outcomes = await files.trash(local.map((item) => item.uri));
      if (outcomes.some((outcome) => outcome.ok)) {
        sounds?.play('move-to-trash');
        hasSounded = true;
      }
      outcomes.forEach((outcome, index) => {
        const item = local[index];
        if (!outcome.ok || !item) return;
        entries.push({ kind: 'trashed', from: item.uri, trash: outcome.result });
        names.push(item.name);
      });
      reportPlatform(outcomes);
      for (const item of local) refreshFolder(parentUri(item.uri));
      await refreshPlatformTrash();
    }
    if (cloud.length > 0) {
      const trashed = await eachCloud(
        cloud,
        (assetId) => oxyServices.assets.trash(assetId),
        'move a file to the trash',
      );
      if (trashed.length > 0 && !hasSounded) sounds?.play('move-to-trash');
      for (const item of trashed) {
        entries.push({ kind: 'asset-trashed', assetId: item.assetId, name: item.name });
        names.push(item.name);
      }
    }
    undoHistory.record('trash', names[0] ?? '', entries);
  };

  return {
    /** Whether the platform has a Trash for this device's files; without one, deleting is for good. */
    hasPlatformTrash: files !== null,

    /** A new folder, named the first free "untitled folder", to be renamed in place. */
    newFolder(folderUri: string): LocalItem | null {
      const change = createFolder(folderUri, freeName(strings.untitledFolder, namesIn(folderUri)));
      refreshFolder(folderUri);
      if (change.ok) {
        undoHistory.record('new-folder', change.item.name, [
          { kind: 'created', uri: change.item.uri },
        ]);
        return change.item;
      }
      toast.error(
        change.why.kind === 'name'
          ? strings.nameProblems[change.why.problem]
          : strings.fileProblems[change.why.problem],
      );
      return null;
    },

    /** Renames an item where it is; the reason when it cannot be. */
    rename(item: LocalItem, name: string): { item: LocalItem } | { why: ChangeProblem } {
      const folderUri = parentUri(item.uri);
      const change = renameItem(item, folderUri, name);
      refreshFolder(folderUri);
      if (!change.ok) return { why: change.why };
      undoHistory.record('rename', item.name, [
        { kind: 'renamed', from: item.uri, to: change.item.uri },
      ]);
      return { item: change.item };
    },

    /**
     * File › Duplicate: a copy of each item beside it, named as Finder names one (`notes copy.txt`);
     * the copies made, which Finder selects.
     */
    async duplicate(items: readonly LocalItem[]): Promise<LocalItem[]> {
      const made = await inTurn(async () => {
        const copies: { item: LocalItem; uri: string }[] = [];
        for (const item of items) {
          const folderUri = parentUri(item.uri);
          const name = copyName(item.name, item.isFolder, strings.copyWord, namesIn(folderUri));
          const outcome = await relocateItem(item, folderUri, name, 'copy');
          refreshFolder(folderUri);
          if (!outcome.ok) {
            reportLocal([outcome]);
            continue;
          }
          copies.push({ item, uri: outcome.uri });
        }
        return copies;
      });
      const [first] = made;
      if (first) {
        undoHistory.record(
          'duplicate',
          first.item.name,
          made.map(({ uri }) => ({ kind: 'created', uri })),
        );
      }
      return itemsAtUris(made.map(({ uri }) => uri));
    },

    /** Dropsea's own items dragged onto a folder of the window, where there is no platform drag. */
    async moveInto(items: readonly LocalItem[], folder: { uri: string; name: string }) {
      await transfer(items, folder, 'move');
    },

    /**
     * Files dropped on a folder (OxyOS ADR 0035, ADR 0047): moved or copied as the drop's action
     * says, as Finder does; the items the URIs name now. Its own items dropped on the folder they
     * are in already stay.
     */
    async dropInto(
      uris: readonly string[],
      folder: { uri: string; name: string },
      relocation: Relocation,
    ): Promise<void> {
      const items = itemsAtUris(uris).filter(
        (item) => relocation === 'copy' || !isSameUri(parentUri(item.uri), folder.uri),
      );
      if (items.length === 0) return;
      await transfer(items, folder, relocation);
    },

    /** Edit › Undo: the window's latest step taken back (ADR 0002); what it came to. */
    async undo(select: (uris: readonly string[]) => void): Promise<Replayed | null> {
      return showReplayed(await inTurn(() => undoHistory.undo(undoPlatform)), select);
    },

    /** Edit › Redo: the latest step undone done again; what it came to. */
    async redo(select: (uris: readonly string[]) => void): Promise<Replayed | null> {
      return showReplayed(await inTurn(() => undoHistory.redo(undoPlatform)), select);
    },

    /** Files dropped on the sidebar's Trash: the items the URIs name now, as Move to Trash. */
    async trashDropped(uris: readonly string[]): Promise<void> {
      await moveToTrash(itemsAtUris(uris));
    },

    moveToTrash,

    /** Deletes this device's items for good, where the platform has no Trash (the person confirmed). */
    deleteForGood(items: readonly LocalItem[]): void {
      const outcomes = deleteItems(items);
      for (const item of items) refreshFolder(parentUri(item.uri));
      reportLocal(outcomes);
    },

    async putBack(items: readonly TrashItem[]): Promise<void> {
      const local = items.flatMap((item) => (item.source === 'local-trash' ? [item] : []));
      const cloud = items.flatMap((item) => (item.source === 'cloud-trash' ? [item] : []));
      const entries: UndoEntry[] = [];
      const names: string[] = [];
      if (local.length > 0 && files) {
        const outcomes = await files.restore(local.map((item) => item.uri));
        outcomes.forEach((outcome, index) => {
          const item = local[index];
          if (!outcome.ok || !item) return;
          refreshFolder(parentUri(outcome.result));
          entries.push({ kind: 'created', uri: outcome.result });
          names.push(item.name);
        });
        reportPlatform(outcomes);
        await refreshPlatformTrash();
      }
      if (cloud.length > 0) {
        const restored = await eachCloud(
          cloud,
          (assetId) => oxyServices.assets.restore(assetId),
          'put a file back',
        );
        for (const item of restored) {
          entries.push({ kind: 'asset-restored', assetId: item.assetId, name: item.name });
          names.push(item.name);
        }
      }
      undoHistory.record('put-back', names[0] ?? '', entries);
    },

    async eraseNow(items: readonly TrashItem[]): Promise<void> {
      const local = items.flatMap((item) => (item.source === 'local-trash' ? [item] : []));
      const cloud = items.flatMap((item) => (item.source === 'cloud-trash' ? [item] : []));
      if (local.length > 0 && files) {
        reportPlatform(await files.erase(local.map((item) => item.uri)));
        await refreshPlatformTrash();
      }
      if (cloud.length > 0) {
        await eachCloud(cloud, deleteAsset, 'delete a file');
      }
    },

    /** Empties both Trashes: everything in them, not only what has been loaded. */
    async emptyTrash(): Promise<void> {
      if (files) {
        try {
          await files.emptyTrash();
          sounds?.play('empty-trash');
        } catch (error) {
          console.warn('Dropsea could not empty the Trash', error);
          toast.error(strings.fileProblems.io);
        }
        await refreshPlatformTrash();
      }
      if (!userId) return;
      const trashed: { assetId: string; name: string }[] = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const page = await oxyServices.assets.list({
          status: 'trash',
          limit: EMPTY_PAGE_SIZE,
          offset,
        });
        trashed.push(
          ...page.files.map((asset) => ({
            assetId: asset.id,
            name: asset.originalName ?? asset.id,
          })),
        );
        hasMore = page.hasMore;
        offset += EMPTY_PAGE_SIZE;
      }
      await eachCloud(trashed, deleteAsset, 'delete a file');
    },
  };
}
