import { RiFolderLine } from '@oxy.so/bloom/icons';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Browser } from '@/components/Browser';
import { useLocale } from '@/hooks/use-locale';
import { useLocalFolder } from '@/hooks/use-local-folder';
import { useLocalPlaces } from '@/hooks/use-local-places';
import { hasLocalFiles } from '@/lib/local-files';
import { isSameUri, parentUri, placeOf, uriName } from '@/lib/local-places';
import { hrefFor } from '@/lib/routes';

/** A folder on this device, by its URI, and the item in it a reveal selects. */
export default function FolderScreen() {
  const { uri, select } = useLocalSearchParams<{ uri: string; select?: string }>();
  if (!hasLocalFiles() || !uri?.startsWith('file://')) return <Redirect href="/" />;
  return <Folder uri={uri} select={select?.startsWith('file://') ? select : null} />;
}

function Folder({ uri, select }: { uri: string; select: string | null }) {
  const { strings } = useLocale();
  const { places } = useLocalPlaces();
  const state = useLocalFolder(uri);
  const place = places.find((each) => isSameUri(each.uri, uri));
  // A folder that went leaves the window on its parent, as Finder does,
  // while the parent is still in one of the person's places.
  if (state.status === 'missing') {
    const parent = parentUri(uri);
    return (
      <Redirect href={placeOf(parent, places) ? hrefFor({ kind: 'folder', uri: parent }) : '/'} />
    );
  }
  // Each folder is its own pane, as Finder's: what was selected, searched or
  // scrolled to in one does not carry into the next. A reveal of an item in the
  // folder shown arrives as a pane of its own too, with that item selected.
  return (
    <Browser
      key={`${uri}\n${select ?? ''}`}
      listing={{
        location: select ? { kind: 'folder', uri, select } : { kind: 'folder', uri },
        title: place?.name ?? uriName(uri),
        items: state.status === 'ready' ? state.items : [],
        status: state.status === 'ready' ? 'ready' : 'error',
        layout: 'files',
        empty: { icon: RiFolderLine, title: strings.empty.folder },
      }}
    />
  );
}
