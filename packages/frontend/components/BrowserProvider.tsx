/**
 * The window's own state, kept across the places it shows: where it is (the
 * route) and was (back and forward), how it shows items (icons or a list,
 * per kind of place), their order, whether hidden files show, and the album
 * name dialog the sidebar and the menus open, its preview pane and path bar;
 * as the file chooser's save panel, the name being typed, kept as it goes from
 * folder to folder. And where it goes back to when a folder sprang open under
 * a drag that then exits the window without a drop in it (OxyOS ADR 0047,
 * decision 14). And its Undo history, kept as long as the window is open.
 */
import { useWindowDrag } from '@oxy.so/bloom/drop-zone';
import { usePlatformFiles } from '@oxy.so/bloom/platform-surface';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { createContext, type ReactNode, use, useLayoutEffect, useRef, useState } from 'react';
import {
  arrive,
  canGoBack,
  canGoForward,
  currentLocation,
  type History,
  historyAt,
  nextLocation,
} from '@/lib/history';
import { type Location, sameLocation } from '@/lib/items';
import { hrefFor, locationFromRoute } from '@/lib/routes';
import { type Grouping, NAME_ORDER, type SortOrder } from '@/lib/sorting';
import { SpringBack } from '@/lib/spring-loading';
import { UndoHistory } from '@/lib/undo';

export type ViewMode = 'icons' | 'list';

/** Photos and albums are a grid of pictures by default; files are Finder's icons or list. */
type ViewFamily = 'files' | 'media';

function familyOf(location: Location): ViewFamily {
  return location.kind === 'photos' || location.kind === 'albums' || location.kind === 'album'
    ? 'media'
    : 'files';
}

interface BrowserValue {
  location: Location | null;
  /** Where the window was before it came here: what it selects as it arrives. */
  cameFrom: Location | null;
  history: History | null;
  navigate: (location: Location) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  viewModeFor: (location: Location) => ViewMode;
  setViewMode: (location: Location, mode: ViewMode) => void;
  orderFor: (location: Location) => SortOrder;
  setOrder: (location: Location, order: SortOrder) => void;
  /**
   * What a place's items are grouped by (View › Group By), the sort applying
   * within each group; null where they never are: Photos and the albums, as
   * Photos has no Group By.
   */
  groupingFor: (location: Location) => Grouping | null;
  setGrouping: (grouping: Grouping) => void;
  isShowingHidden: boolean;
  setShowingHidden: (isShowing: boolean) => void;
  isNewAlbumOpen: boolean;
  setNewAlbumOpen: (isOpen: boolean) => void;
  /** Dropsea's settings (its Tags), open over the window. */
  isSettingsOpen: boolean;
  setSettingsOpen: (isOpen: boolean) => void;
  /** Whether the window shows its preview pane (View > Show Preview), in every place. */
  isPreviewShown: boolean;
  setPreviewShown: (isShown: boolean) => void;
  /** The preview pane's width, as the person last dragged it, in every place. */
  previewWidth: number;
  setPreviewWidth: (width: number) => void;
  /** Whether a folder's window shows its path bar (View > Show Path Bar), in every place. */
  isPathBarShown: boolean;
  setPathBarShown: (isShown: boolean) => void;
  /** A folder held under a drag opens (spring-loading): the window goes there, for the drag. */
  springOpen: (location: Location) => void;
  /** The save panel's name, from the asking application's suggestion until the person types. */
  saveName: string;
  setSaveName: (name: string) => void;
  /** What Edit › Undo and Redo take back and do again in this window (ADR 0002). */
  undoHistory: UndoHistory;
}

/** The preview pane's width until the person drags it, Finder's. */
const PREVIEW_WIDTH = 280;

const BrowserContext = createContext<BrowserValue | null>(null);

export function BrowserProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const routed = locationFromRoute(pathname, params);
  const [history, setHistory] = useState<History | null>(() => (routed ? historyAt(routed) : null));
  const [viewModes, setViewModes] = useState<Record<ViewFamily, ViewMode>>({
    files: 'icons',
    media: 'icons',
  });
  // Files by name, as Finder starts; photos newest first, as Photos does.
  const [orders, setOrders] = useState<Record<ViewFamily, SortOrder>>({
    files: NAME_ORDER,
    media: { column: 'date', direction: 'descending' },
  });
  // Ungrouped, as Finder starts.
  const [grouping, setGrouping] = useState<Grouping>('none');
  const [cameFrom, setCameFrom] = useState<Location | null>(null);
  const [isShowingHidden, setShowingHidden] = useState(false);
  const [isNewAlbumOpen, setNewAlbumOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isPreviewShown, setPreviewShown] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(PREVIEW_WIDTH);
  // Finder's windows show their path bar once the person has asked for it; Dropsea's from the start.
  const [isPathBarShown, setPathBarShown] = useState(true);
  const [springBack] = useState(() => new SpringBack<Location>());
  const [undoHistory] = useState(() => new UndoHistory());
  const suggestedName = usePlatformFiles()?.chooser?.request.suggestedName ?? '';
  const [saveName, setSaveName] = useState(suggestedName);

  // The route is where the window is; the history follows it however it got
  // there (a press here, the browser's own back, a phone's back gesture).
  const current = history ? currentLocation(history) : null;
  if (routed && (!current || !sameLocation(current, routed))) {
    setHistory(history ? arrive(history, routed) : historyAt(routed));
    setCameFrom(current);
  }
  // Where the window is, as the history holds it: the same object for as long
  // as the window stays there, so what shows it draws again only when it moves.
  const location = routed ? current : null;

  // Where the window is, read as a press or a drag asks to go somewhere: going and springing open
  // are the same functions wherever the window is, so the sidebar and what else holds them draw
  // nothing again as the window goes from place to place.
  const here = useRef(location);
  useLayoutEffect(() => {
    here.current = location;
  });
  const [navigate] = useState(() => (next: Location) => {
    if (here.current && sameLocation(here.current, next)) return;
    router.push(hrefFor(next));
  });
  const [springOpen] = useState(() => (next: Location) => {
    if (here.current) springBack.opened(here.current);
    navigate(next);
  });
  // A drag that sprang folders open and then exits the window without a drop in it (it left, was
  // dropped elsewhere, or Escape cancelled it) takes the window back to where it was.
  useWindowDrag({
    onExit: (isDropped) => {
      const back = springBack.exited(isDropped);
      if (back) navigate(back);
    },
  });

  const value: BrowserValue = {
    location,
    cameFrom,
    history,
    navigate,
    goBack: () => {
      if (history && canGoBack(history)) router.back();
    },
    goForward: () => {
      const next = history ? nextLocation(history) : null;
      if (next) router.push(hrefFor(next));
    },
    canGoBack: history !== null && canGoBack(history),
    canGoForward: history !== null && canGoForward(history),
    viewModeFor: (place) => viewModes[familyOf(place)],
    setViewMode: (place, mode) => {
      const family = familyOf(place);
      setViewModes((modes) => ({ ...modes, [family]: mode }));
    },
    orderFor: (place) => orders[familyOf(place)],
    setOrder: (place, next) => {
      const family = familyOf(place);
      setOrders((known) => ({ ...known, [family]: next }));
    },
    groupingFor: (place) => (familyOf(place) === 'files' ? grouping : null),
    setGrouping,
    isShowingHidden,
    setShowingHidden,
    isNewAlbumOpen,
    setNewAlbumOpen,
    isSettingsOpen,
    setSettingsOpen,
    isPreviewShown,
    setPreviewShown,
    previewWidth,
    setPreviewWidth,
    isPathBarShown,
    setPathBarShown,
    springOpen,
    saveName,
    setSaveName,
    undoHistory,
  };
  return <BrowserContext value={value}>{children}</BrowserContext>;
}

export function useBrowser(): BrowserValue {
  const value = use(BrowserContext);
  if (!value) throw new Error('useBrowser needs a BrowserProvider above it');
  return value;
}
