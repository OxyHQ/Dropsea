import {
  type PlatformFileOutcome,
  usePlatformFiles,
  usePlatformSounds,
} from '@oxy.so/bloom/platform-surface';
import { toast } from '@oxy.so/bloom/toast';
import { useQueryClient } from '@tanstack/react-query';
import { cloudFilesKey } from '@/hooks/use-cloud-files';
import { useLocale } from '@/hooks/use-locale';
import { PLATFORM_TRASH_KEY } from '@/hooks/use-trash';
import { useViewer } from '@/hooks/use-viewer';
import { getFolderState, refreshFolder } from '@/lib/folder-store';
import type { CloudItem, Item, LocalItem, TrashItem } from '@/lib/items';
import {
  type ChangeProblem,
  createFolder,
  deleteItems,
  type LocalOutcome,
  copyItems,
  itemsAtUris,
  type Moved,
  moveItems,
  movesDone,
  renameItem,
} from '@/lib/local-files';
import { isSameUri, parentUri } from '@/lib/local-places';
import { freeName } from '@/lib/names';
import { oxyServices } from '@/lib/oxy';
import { type Replayed, recordMove, redoMove, undoMove } from '@/lib/undo';

/** Assets Oxy Files' trash is emptied in, a page at a time. */
const EMPTY_PAGE_SIZE = 100;

function isLocal(item: Item): item is LocalItem {
  return item.source === 'local';
}

function isCloud(item: Item): item is CloudItem {
  return item.source === 'cloud';
}

/** The names a folder holds now, for a new item's free name. */
function namesIn(folderUri: string): string[] {
  const state = getFolderState(folderUri);
  return state.status === 'ready' ? state.items.map((item) => item.name) : [];
}

/**
 * What Dropsea does to items: new folders, renames and moves on this device;
 * the Trash (the platform's for this device's files, Oxy Files' for the
 * cloud's), putting back and deleting for good. Each says what failed, and
 * shows what changed at once.
 */
export function useFileActions() {
  const files = usePlatformFiles();
  // The platform's own Trash sounds (OxyOS's, docs/adr/0044-system-sounds.mdx there): Dropsea
  // ships no sound of its own.
  const sounds = usePlatformSounds();
  const queryClient = useQueryClient();
  const { strings } = useLocale();
  const { userId } = useViewer();

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
  /** Shows moves done where the items were and where they went. */
  const refreshMoved = (moves: readonly Moved[]) => {
    for (const { from, to } of moves) {
      refreshFolder(parentUri(from));
      refreshFolder(parentUri(to));
    }
  };
  /** Shows what an Undo or a Redo moved, and says what it could not. */
  const showReplayed = (done: Replayed | null) => {
    if (!done) return;
    refreshMoved(done.moved);
    reportLocal(done.outcomes);
  };
  /** Runs a change on each cloud item, saying which failed. */
  const eachCloud = async (
    items: readonly { assetId: string; name: string }[],
    change: (assetId: string) => Promise<unknown>,
    action: string,
  ) => {
    const results = await Promise.allSettled(items.map((item) => change(item.assetId)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      const item = items[index];
      console.warn(`Dropsea could not ${action} in Oxy Files`, {
        assetId: item?.assetId,
        error: result.reason,
      });
      if (item) toast.error(strings.cloudProblem(item.name));
    });
    await refreshCloud();
    return results.some((result) => result.status === 'fulfilled');
  };

  return {
    /** Whether the platform has a Trash for this device's files; without one, deleting is for good. */
    hasPlatformTrash: files !== null,

    /** A new folder, named the first free "untitled folder", to be renamed in place. */
    newFolder(folderUri: string): LocalItem | null {
      const change = createFolder(folderUri, freeName(strings.untitledFolder, namesIn(folderUri)));
      refreshFolder(folderUri);
      if (change.ok) return change.item;
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
      return change.ok ? { item: change.item } : { why: change.why };
    },

    async moveInto(items: readonly LocalItem[], folderUri: string): Promise<void> {
      const outcomes = await moveItems(items, folderUri);
      for (const item of items) refreshFolder(parentUri(item.uri));
      refreshFolder(folderUri);
      recordMove(movesDone(items, outcomes));
      reportLocal(outcomes);
    },

    /**
     * Files dropped on a folder (OxyOS ADR 0035): moved, or copied when the drop's action is
     * a copy (Option held), as Finder does; the items the URIs name now, refreshed where they were
     * and where they go. Its own items dropped on the folder they are in already stay.
     */
    async dropInto(
      uris: readonly string[],
      folderUri: string,
      action: 'copy' | 'move',
    ): Promise<void> {
      const items = itemsAtUris(uris).filter(
        (item) => action === 'copy' || !isSameUri(parentUri(item.uri), folderUri),
      );
      if (items.length === 0) return;
      const outcomes =
        action === 'copy' ? await copyItems(items, folderUri) : await moveItems(items, folderUri);
      if (action === 'move') {
        for (const item of items) refreshFolder(parentUri(item.uri));
        recordMove(movesDone(items, outcomes));
      }
      refreshFolder(folderUri);
      reportLocal(outcomes);
    },

    /** Edit › Undo: the latest move taken back, each item into the folder it came from. */
    async undo(): Promise<void> {
      showReplayed(await undoMove());
    },

    /** Edit › Redo: the latest move undone made again. */
    async redo(): Promise<void> {
      showReplayed(await redoMove());
    },

    /**
     * This device's items into the platform's Trash, Oxy Files' into its own; the platform's
     * move-to-trash sound once, as soon as any went, as Finder sounds a Move to Trash.
     */
    async moveToTrash(items: readonly Item[]): Promise<void> {
      const local = items.filter(isLocal);
      const cloud = items.filter(isCloud);
      let hasSounded = false;
      if (local.length > 0 && files) {
        const outcomes = await files.trash(local.map((item) => item.uri));
        if (outcomes.some((outcome) => outcome.ok)) {
          sounds?.play('move-to-trash');
          hasSounded = true;
        }
        reportPlatform(outcomes);
        for (const item of local) refreshFolder(parentUri(item.uri));
        await refreshPlatformTrash();
      }
      if (cloud.length > 0) {
        const hasTrashed = await eachCloud(
          cloud,
          (assetId) => oxyServices.assets.trash(assetId),
          'move a file to the trash',
        );
        if (hasTrashed && !hasSounded) sounds?.play('move-to-trash');
      }
    },

    /** Deletes this device's items for good, where the platform has no Trash (the person confirmed). */
    deleteForGood(items: readonly LocalItem[]): void {
      const outcomes = deleteItems(items);
      for (const item of items) refreshFolder(parentUri(item.uri));
      reportLocal(outcomes);
    },

    async putBack(items: readonly TrashItem[]): Promise<void> {
      const local = items.flatMap((item) => (item.source === 'local-trash' ? [item] : []));
      const cloud = items.flatMap((item) => (item.source === 'cloud-trash' ? [item] : []));
      if (local.length > 0 && files) {
        const outcomes = await files.restore(local.map((item) => item.uri));
        for (const outcome of outcomes) if (outcome.ok) refreshFolder(parentUri(outcome.result));
        reportPlatform(outcomes);
        await refreshPlatformTrash();
      }
      if (cloud.length > 0) {
        await eachCloud(cloud, (assetId) => oxyServices.assets.restore(assetId), 'put a file back');
      }
    },

    async eraseNow(items: readonly TrashItem[]): Promise<void> {
      const local = items.flatMap((item) => (item.source === 'local-trash' ? [item] : []));
      const cloud = items.flatMap((item) => (item.source === 'cloud-trash' ? [item] : []));
      if (local.length > 0 && files) {
        reportPlatform(await files.erase(local.map((item) => item.uri)));
        await refreshPlatformTrash();
      }
      if (cloud.length > 0) {
        await eachCloud(cloud, (assetId) => oxyServices.assets.delete(assetId), 'delete a file');
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
      await eachCloud(trashed, (assetId) => oxyServices.assets.delete(assetId), 'delete a file');
    },
  };
}
