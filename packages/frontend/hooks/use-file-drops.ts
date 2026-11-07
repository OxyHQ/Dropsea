import { toast } from '@oxy.so/bloom/toast';
import { useFileActions } from '@/hooks/use-file-actions';
import { useLocale } from '@/hooks/use-locale';
import { filesDrop, placeAmong } from '@/lib/drop';
import type { Relocation } from '@/lib/local-files';
import { folderName, type LocalPlace } from '@/lib/local-places';

/**
 * Runs an action whose parts tell the person what failed themselves; logs anything that escaped
 * them, with what was being done.
 */
function runAsync(action: string, work: () => Promise<unknown>): void {
  work().catch((error: unknown) => console.warn(`Dropsea could not ${action}`, error));
}

/**
 * What files dropped on Dropsea do, from any application, Dropsea among them (OxyOS ADR 0035 and
 * ADR 0047), wherever they are dropped: a folder among the items, a sidebar place, a path bar
 * segment, the sidebar's Trash.
 */
export function useFileDrops(places: readonly LocalPlace[]) {
  const fileActions = useFileActions();
  const { strings } = useLocale();
  return {
    /**
     * Into a folder, moved or copied as the drop's action says. Never into one of them or inside
     * one: dropped there, they stay where they are. A move holding one of the platform's places
     * moves nothing, and says why.
     */
    dropFiles: (uris: readonly string[], folderUri: string, relocation: Relocation) => {
      const drop = filesDrop(uris, folderUri, relocation, places);
      if (drop.kind === 'into-itself') return;
      if (drop.kind === 'place') {
        toast.error(strings.placeStays(drop.place.name));
        return;
      }
      runAsync(relocation === 'copy' ? 'copy items' : 'move items', () =>
        fileActions.dropInto(
          uris,
          { uri: folderUri, name: folderName(folderUri, places) },
          relocation,
        ),
      );
    },
    /**
     * Into the Trash, as Move to Trash, with its sound. A drop holding one of the platform's places
     * puts nothing there, and says why.
     */
    trashDropped: (uris: readonly string[]) => {
      const place = placeAmong(uris, places);
      if (place) {
        toast.error(strings.placeStays(place.name));
        return;
      }
      runAsync('move items to the Trash', () => fileActions.trashDropped(uris));
    },
  };
}
