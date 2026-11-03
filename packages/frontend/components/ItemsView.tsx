/**
 * A location's items, as Finder shows them: a grid of icons (or of pictures,
 * as Photos shows them) or a list whose columns sort, with the pointer's ways
 * of choosing them. A click selects, Shift extends, ⌘ or Ctrl adds or
 * removes, a double click opens; a rubber band from the background selects
 * what it touches; selected items dragged onto a folder or an album go there.
 * A touch opens what it taps and scrolls as a phone's lists do; a long press
 * (or the secondary button) opens the menu for what it is on.
 *
 * Every item's place comes from the width alone (`lib/items-layout`), so the
 * view draws only the items near what can be seen, however many the folder
 * holds, and one handler on the items' area finds the item under a press by
 * arithmetic: an item carries no handler, menu or responder of its own. One
 * context menu serves the area: it opens for the item pressed (with the
 * selection it is in), or for the place where the press found none.
 *
 * The places are drawn as flex: a column is a share of the width, a picture a
 * square, so a window resizing moves them in the layout pass and runs no
 * JavaScript. The view redraws only when the width crosses a threshold (a
 * grid's columns, the list's), and reads the exact width when a press, a band
 * or a key acts on the places.
 *
 * Items the window cannot select now (the file chooser's, that the request
 * cannot take) are drawn dimmed.
 */
import {
  ContextMenu,
  type ContextMenuAnchor,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@oxy.so/bloom/context-menu';
import {
  DropZone,
  type DropTargetDragEvent,
  type DropTargetDropEvent,
} from '@oxy.so/bloom/drop-zone';
import { isCommandKey } from '@oxy.so/bloom/kbd';
import { usePlatformDrag, usePlatformSurfaces } from '@oxy.so/bloom/platform-surface';
import { useTheme } from '@oxy.so/bloom/theme';
import { Text } from '@oxy.so/bloom/typography';
import { useMeasuredSizeClass } from '@oxy.so/bloom/hooks';
import { useWindow } from '@oxy.so/bloom/window';
import {
  type ComponentRef,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type AccessibilityActionInfo,
  type GestureResponderEvent,
  Keyboard,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PointerEvent,
  ScrollView,
  View,
} from 'react-native';
import type { ViewMode } from '@/components/BrowserProvider';
import { ItemCell } from '@/components/ItemCell';
import { ItemRow, type RenameHandlers } from '@/components/ItemRow';
import { ListHeader } from '@/components/ListHeader';
import type { Item } from '@/lib/items';
import {
  columnWidthRange,
  contentHeight,
  GRID_INSET,
  gridColumns,
  type ItemsLayout,
  itemAt,
  itemFrame,
  itemsBetween,
  itemsGeometry,
  itemsTouching,
  layoutWidthThresholds,
  listColumns,
  PHOTO_SPACING,
} from '@/lib/items-layout';
import {
  type Box,
  bandSelect,
  boxBetween,
  clickSelect,
  isSecondClick,
  isSelected,
  type LastPress,
  NO_PRESS,
  NO_SELECTION,
  pressTime,
  type Selection,
  selectOnly,
} from '@/lib/selection';
import type { SortColumn, SortOrder } from '@/lib/sorting';

/** What the items take dropped from any application: files, moved or (with Option) copied. */
const DROP_ACCEPT = ['files'] as const;
const DROP_ACTIONS = ['move', 'copy'] as const;
const FILL = { flex: 1 } as const;

/** A press moved this far is a drag (a mouse) or a scroll (a touch). */
const DRAG_SLOP = 4;
const TOUCH_SLOP = 10;
/** A touch held this long opens the menu. */
const LONG_PRESS_MS = 500;
/** How far past what can be seen the items are drawn, in screens, so a scroll finds them drawn. */
const OVERSCAN_SCREENS = 1;
/**
 * The viewport's height is read in steps of this much: what is drawn covers
 * the step's top, so a window resizing taller redraws once a step, not on
 * every pixel.
 */
const VIEWPORT_STEP = 256;
const VIEWPORT_STEPS = Array.from({ length: 64 }, (_, index) => (index + 1) * VIEWPORT_STEP);
const NO_WIDTHS: number[] = [];

interface Drag {
  keys: readonly string[];
  x: number;
  y: number;
  over: string | null;
}

/** The press in progress, from its start. */
interface Gesture {
  isTouch: boolean;
  start: { x: number; y: number };
  /** The item it began on, or null on the background. */
  key: string | null;
  hasMoved: boolean;
  /** A touch held long enough to open the menu: its release is not a tap. */
  isLongPressed: boolean;
  /** A rubber band's selection when it began, and whether it adds to it. */
  before: Selection;
  isAdding: boolean;
}

/** The menu open over the items: where, and for which item (null: for the place). */
interface OpenMenu {
  anchor: ContextMenuAnchor;
  key: string | null;
}

export interface ItemsViewProps {
  items: readonly Item[];
  mode: ViewMode;
  layout: ItemsLayout;
  label: string;
  selection: Selection;
  onSelectionChange: (change: (selection: Selection) => Selection) => void;
  isWindowActive: boolean;
  thumbnails: ReadonlyMap<string, string>;
  renamingKey: string | null;
  onRenameText: (text: string) => void;
  /** Ends a rename in progress, keeping the name typed: Return, leaving the field, a press elsewhere. */
  onRenameDone: () => void;
  order: SortOrder;
  onSort: (column: SortColumn) => void;
  dateColumn: 'date' | 'deleted' | 'taken';
  hasOriginColumn: boolean;
  originOf: (item: Item) => string;
  onOpen: (item: Item) => void;
  /** Whether dragged items may be dropped on an item (a folder, an album). */
  canDrop: (dragged: readonly Item[], target: Item) => boolean;
  onDrop: (dragged: readonly Item[], target: Item) => void;
  /**
   * Files dropped on the items from any application, Dropsea among them: the folder an item (or
   * the place, null) takes them into, or null where nothing does; and the drop.
   */
  dropFolderFor?: (target: Item | null) => string | null;
  onDropFiles?: (uris: readonly string[], folderUri: string, action: 'copy' | 'move') => void;
  onAction: (item: Item, action: string) => void;
  /** An item's actions for assistive technology; the same list for items alike. */
  itemActions: (item: Item) => readonly AccessibilityActionInfo[];
  /** The context menu's rows for an item and for the place; null: the view has no context menu. */
  menus: { item: (item: Item) => ReactNode; background: ReactNode } | null;
  /** Items drawn dimmed: there, but not selectable now. */
  dimmedKeys: ReadonlySet<string>;
  emptyState: ReactNode;
  /**
   * The grid's columns at the width it was laid out at, for the arrows' steps
   * down it. Told without drawing anything again: a window resized live lays
   * the items out once per size, not their place's whole pane too.
   */
  onColumnsChange: (columns: number) => void;
  onEndReached?: () => void;
}

export function ItemsView({
  items,
  mode,
  layout,
  label,
  selection,
  onSelectionChange,
  isWindowActive,
  thumbnails,
  renamingKey,
  onRenameText,
  onRenameDone,
  order,
  onSort,
  dateColumn,
  hasOriginColumn,
  originOf,
  onOpen,
  canDrop,
  onDrop,
  dropFolderFor,
  onDropFiles,
  onAction,
  itemActions,
  menus,
  dimmedKeys,
  emptyState,
  onColumnsChange,
  onEndReached,
}: ItemsViewProps) {
  const theme = useTheme();
  // A pointer drives a desktop window, and a platform's sheet that reports the pointer.
  const surfaces = usePlatformSurfaces();
  const isPointerDriven = useWindow() !== null || (surfaces?.capabilities.has('pointer') ?? false);
  // The items' width and the viewport's height, at the thresholds the view
  // draws differently at; the exact values are read when something acts.
  const area = useMeasuredSizeClass(layoutWidthThresholds(mode, layout, isPointerDriven));
  const viewport = useMeasuredSizeClass(NO_WIDTHS, VIEWPORT_STEPS);
  const width = area.width;
  // Which stretch of the items is drawn: it moves in steps of half a screen,
  // so scrolling draws again only as it nears what is not drawn yet.
  const [scrollStep, setScrollStep] = useState(0);
  const [band, setBand] = useState<Box | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // A drag of files from any application over the items (the platform's, or the browser's): the
  // folder item it would go into, highlighted as Dropsea's own drag highlights it.
  const [dropOver, setDropOver] = useState<string | null>(null);
  // Where a drag of the items goes once it leaves Dropsea's own handling: the platform's drag,
  // between applications (OxyOS ADR 0035), where there is one.
  const platformDrag = usePlatformDrag();
  const dragPreview = useRef<ComponentRef<typeof View> | null>(null);
  const [preview, setPreview] = useState<{ name: string; count: number } | null>(null);
  const [menu, setMenu] = useState<OpenMenu | null>(null);

  // What is drawn: the columns and rows at the width's threshold (a column's
  // place is its share of the width, `renderItem`). A picture's square follows
  // the width, so the rows drawn are those either end of the columns' widths
  // could show.
  const geometry = itemsGeometry(mode, layout, width, isPointerDriven);
  const columnsShown = listColumns(width);
  const screen = viewport.height + VIEWPORT_STEP;
  const stepHeight = Math.max(1, Math.floor(screen / 2));
  const drawnTop = scrollStep * stepHeight - screen * OVERSCAN_SCREENS;
  const drawnBottom = scrollStep * stepHeight + screen * (1 + OVERSCAN_SCREENS);
  const widths = columnWidthRange(geometry.columns, layout);
  const drawn =
    geometry.arrangement === 'photos'
      ? {
          start: itemsBetween(
            itemsGeometry(mode, layout, widths.most - 1, isPointerDriven),
            items.length,
            drawnTop,
            drawnBottom,
          ).start,
          end: itemsBetween(
            itemsGeometry(mode, layout, widths.least, isPointerDriven),
            items.length,
            drawnTop,
            drawnBottom,
          ).end,
        }
      : itemsBetween(geometry, items.length, drawnTop, drawnBottom);
  const height = contentHeight(geometry, items.length);
  const rowCount = Math.ceil(items.length / geometry.columns);
  /** The places at the exact width, for what acts on them (a press, a band, a key). */
  const exactGeometry = () =>
    itemsGeometry(mode, layout, area.read()?.width ?? width, isPointerDriven);

  const rename: RenameHandlers = { onText: onRenameText, onDone: onRenameDone };

  // An item's accessibility action calls whatever the browser does now; the
  // items keep one handler, so they need not draw again when it changes.
  const latestAction = useRef(onAction);
  useLayoutEffect(() => {
    latestAction.current = onAction;
  });
  const [handleAccessibilityAction] = useState(
    () => (item: Item, action: string) => latestAction.current(item, action),
  );

  // How the press now in progress came: a mouse selects, drags and bands; a
  // touch taps and scrolls. Read from the W3C pointer event that precedes the
  // responder's (`pointerdown`), so a platform without pointer events is touch.
  const pointerType = useRef<string | null>(null);
  const pointerButton = useRef(0);
  const lastPress = useRef<LastPress>(NO_PRESS);
  const collapseOnRelease = useRef<string | null>(null);
  /** A rubber band adds to the selection when Shift, ⌘ or Ctrl was held as it began. */
  const isBandAdding = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const dragging = useRef<Drag | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The item the next menu opens for, set by the press that opens it. */
  const menuTarget = useRef<string | null>(null);

  // Where the items' area is in the window, measured as it is laid out (and
  // as a press begins) at the scroll offset then, and moved by how far it has
  // scrolled since.
  const content = useRef<ComponentRef<typeof View> | null>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const scrollTop = useRef(0);
  const origin = useRef({ x: 0, y: 0, scrolled: 0 });
  const measureContent = () => {
    const at = scrollTop.current;
    content.current?.measureInWindow((x, y) => {
      origin.current = { x, y, scrolled: at };
    });
  };
  const contentPoint = (windowX: number, windowY: number) => ({
    x: windowX - origin.current.x,
    y: windowY - (origin.current.y - (scrollTop.current - origin.current.scrolled)),
  });

  const itemAtPoint = (point: { x: number; y: number }): Item | null => {
    const index = itemAt(exactGeometry(), items.length, point);
    return index === null ? null : (items[index] ?? null);
  };
  const draggedItems = (keys: readonly string[]) => items.filter((item) => keys.includes(item.key));
  const dropTargetAt = (
    point: { x: number; y: number },
    keys: readonly string[],
  ): string | null => {
    const target = itemAtPoint(point);
    if (!target || keys.includes(target.key)) return null;
    return canDrop(draggedItems(keys), target) ? target.key : null;
  };

  const cancelLongPress = () => {
    if (longPress.current !== null) clearTimeout(longPress.current);
    longPress.current = null;
  };
  // The timer is the one thing a press leaves running past the view.
  useEffect(
    () => () => {
      if (longPress.current !== null) clearTimeout(longPress.current);
    },
    [],
  );

  const showDrag = (next: Drag | null) => {
    dragging.current = next;
    setDrag(next);
  };

  const handlePointerDown = (event: PointerEvent) => {
    const { button, shiftKey, pointerType: type, clientX, clientY } = event.nativeEvent;
    pointerType.current = type;
    pointerButton.current = button;
    measureContent();
    const item = itemAtPoint(contentPoint(clientX, clientY));
    // The name being edited takes its own presses.
    if (item && item.key === renamingKey) return;
    if (renamingKey) onRenameDone();
    // A press among the items takes the keys from a field (the search), as
    // Finder's does, so the arrows and type-select act on the items again.
    Keyboard.dismiss();
    const isToggling = isCommandKey(event.nativeEvent);
    if (button === 2) {
      // A menu is for the selection, which the item joins if it is not in it;
      // on the background it is the place's, and nothing stays selected. The
      // press goes on to the menu's trigger, which opens it where it pressed.
      menuTarget.current = item?.key ?? null;
      if (!item) onSelectionChange(() => NO_SELECTION);
      else if (!isSelected(selection, item.key)) onSelectionChange(() => selectOnly(item.key));
      return;
    }
    if (button !== 0 || type !== 'mouse') return;
    if (!item) {
      isBandAdding.current = shiftKey || isToggling;
      if (!isBandAdding.current) onSelectionChange(() => NO_SELECTION);
      return;
    }
    // The press's own time, not when it was handled: a first click that was
    // slow to draw still makes a double click with the second.
    const at = pressTime(event);
    const isSecond = isSecondClick(lastPress.current, item.key, at);
    lastPress.current = isSecond ? NO_PRESS : { key: item.key, at };
    if (isSecond && !shiftKey && !isToggling) {
      onOpen(item);
      return;
    }
    // A plain click on an item selected among others keeps them while it may
    // become a drag; released where it was, it selects that item alone.
    collapseOnRelease.current =
      !shiftKey && !isToggling && isSelected(selection, item.key) && selection.keys.length > 1
        ? item.key
        : null;
    const keys = items.map((each) => each.key);
    onSelectionChange((current) =>
      clickSelect(current, keys, item.key, { isExtending: shiftKey, isToggling }),
    );
  };

  // Whether there are menus at all, not the menus themselves (new at every
  // selection, as the commands in them are): the context menu keeps what it
  // publishes while the selection changes.
  const hasMenus = menus !== null;
  const openMenu = (anchor: ContextMenuAnchor | null) => {
    setMenu(anchor && hasMenus ? { anchor, key: menuTarget.current } : null);
  };

  const handleGrant = (event: GestureResponderEvent) => {
    const isTouch = pointerType.current !== 'mouse';
    const point = contentPoint(event.nativeEvent.pageX, event.nativeEvent.pageY);
    const item = itemAtPoint(point);
    gesture.current = {
      isTouch,
      start: point,
      key: item?.key ?? null,
      hasMoved: false,
      isLongPressed: false,
      before: selection,
      isAdding: isBandAdding.current,
    };
    if (!isTouch) return;
    const { pageX, pageY } = event.nativeEvent;
    cancelLongPress();
    longPress.current = setTimeout(() => {
      longPress.current = null;
      const held = gesture.current;
      if (!held || held.hasMoved) return;
      held.isLongPressed = true;
      menuTarget.current = held.key;
      const key = held.key;
      if (key && !isSelected(selection, key)) onSelectionChange(() => selectOnly(key));
      openMenu({ x: pageX, y: pageY });
    }, LONG_PRESS_MS);
  };

  const handleMove = (event: GestureResponderEvent) => {
    const now = gesture.current;
    if (!now) return;
    const point = contentPoint(event.nativeEvent.pageX, event.nativeEvent.pageY);
    const distance = Math.hypot(point.x - now.start.x, point.y - now.start.y);
    if (now.isTouch) {
      if (distance >= TOUCH_SLOP) {
        now.hasMoved = true;
        cancelLongPress();
      }
      return;
    }
    if (!now.hasMoved && distance < DRAG_SLOP) return;
    const isFirstMove = !now.hasMoved;
    now.hasMoved = true;
    const key = now.key;
    if (key && isFirstMove && platformDrag) {
      // The platform takes the drag from here (OxyOS ADR 0035): to a folder of this window or of
      // another, the dock's Trash, any application. The selected items of this device go as
      // their files; the platform ends the press, and nothing of Dropsea's own drag shows.
      const keys = isSelected(selection, key) ? selection.keys : [key];
      const files = draggedItems(keys).flatMap((item) =>
        item.source === 'local' ? [item.uri] : [],
      );
      if (files.length > 0) {
        const first = draggedItems(keys)[0];
        setPreview({ name: first?.name ?? '', count: files.length });
        void platformDrag.start({
          data: { files },
          actions: ['copy', 'move', 'link'],
          previewRef: dragPreview,
        });
        return;
      }
    }
    if (key) {
      const keys = dragging.current?.keys ?? (isSelected(selection, key) ? selection.keys : [key]);
      showDrag({ keys, x: point.x, y: point.y, over: dropTargetAt(point, keys) });
      return;
    }
    const box = boxBetween(now.start, point);
    setBand(box);
    const touched = itemsTouching(exactGeometry(), items.length, box).flatMap((index) => {
      const item = items[index];
      return item ? [item.key] : [];
    });
    onSelectionChange(() => bandSelect(now.before, touched, now.isAdding));
  };

  const handleRelease = (event: GestureResponderEvent) => {
    const ended = gesture.current;
    gesture.current = null;
    cancelLongPress();
    setBand(null);
    if (!ended) return;
    if (ended.isTouch) {
      if (ended.hasMoved || ended.isLongPressed) return;
      const key = ended.key;
      const item = key ? items.find((each) => each.key === key) : undefined;
      if (!item) {
        onSelectionChange(() => NO_SELECTION);
        return;
      }
      onSelectionChange(() => selectOnly(item.key));
      onOpen(item);
      return;
    }
    const dragged = dragging.current;
    showDrag(null);
    if (dragged) {
      const over = dropTargetAt(
        contentPoint(event.nativeEvent.pageX, event.nativeEvent.pageY),
        dragged.keys,
      );
      const target = over ? items.find((item) => item.key === over) : undefined;
      if (target) onDrop(draggedItems(dragged.keys), target);
    } else if (ended.key && collapseOnRelease.current === ended.key) {
      const key = ended.key;
      onSelectionChange(() => selectOnly(key));
    }
    collapseOnRelease.current = null;
  };

  const handleTerminate = () => {
    gesture.current = null;
    cancelLongPress();
    setBand(null);
    showDrag(null);
    collapseOnRelease.current = null;
  };

  // Files dropped from any application: the folder item under the point takes them, else the
  // place shown. The point is in the drop zone, which holds the scroll view at the window's place
  // for the items.
  const dropZone = useRef<ComponentRef<typeof View> | null>(null);
  const dropOrigin = useRef({ x: 0, y: 0 });
  const measureDropZone = () => {
    dropZone.current?.measureInWindow((x, y) => {
      dropOrigin.current = { x, y };
    });
  };
  const dropTargetOf = (event: DropTargetDragEvent): Item | null => {
    measureContent();
    const point = contentPoint(dropOrigin.current.x + event.x, dropOrigin.current.y + event.y);
    const target = itemAtPoint(point);
    return target && dropFolderFor?.(target) && target.source === 'local' && target.isFolder
      ? target
      : null;
  };
  const canTakeDrops =
    !!onDropFiles &&
    !!dropFolderFor &&
    (dropFolderFor(null) !== null ||
      items.some((item) => item.source === 'local' && item.isFolder));
  const handleDropOver = (event: DropTargetDragEvent) => {
    setDropOver(dropTargetOf(event)?.key ?? null);
  };
  const handleDropLeave = () => setDropOver(null);
  const handleDropFiles = ({ action, data, ...at }: DropTargetDropEvent) => {
    setDropOver(null);
    const folder = dropFolderFor?.(dropTargetOf({ ...at, action, kinds: at.kinds }));
    const uris = data.files.flatMap((file) => (file.uri ? [file.uri] : []));
    if (!folder || uris.length === 0 || action === 'link') return;
    onDropFiles?.(uris, folder, action);
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    area.onLayout(event);
    onColumnsChange(gridColumns(event.nativeEvent.layout.width, layout));
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    scrollTop.current = contentOffset.y;
    setScrollStep(Math.max(0, Math.floor(contentOffset.y / stepHeight)));
    const distanceToEnd = contentSize.height - (layoutMeasurement.height + contentOffset.y);
    if (onEndReached && distanceToEnd < layoutMeasurement.height) onEndReached();
  };

  // The item the keys moved to is brought into view, as Finder scrolls to it.
  // Where it is, at the exact width and height when the focus moves.
  const focusIndex = selection.focus ? items.findIndex((item) => item.key === selection.focus) : -1;
  const latestGeometry = useRef(exactGeometry);
  useLayoutEffect(() => {
    latestGeometry.current = exactGeometry;
  });
  useEffect(() => {
    const visibleHeight = viewport.read()?.height ?? 0;
    if (focusIndex < 0 || visibleHeight === 0) return;
    const frame = itemFrame(latestGeometry.current(), focusIndex);
    const top = scrollTop.current;
    if (frame.y < top) {
      scroller.current?.scrollTo({ y: frame.y, animated: false });
    } else if (frame.y + frame.height > top + visibleHeight) {
      scroller.current?.scrollTo({ y: frame.y + frame.height - visibleHeight, animated: false });
    }
  }, [focusIndex, viewport]);

  const menuItem = menu?.key ? items.find((item) => item.key === menu.key) : undefined;

  const renderItem = (item: Item, index: number) => {
    const frame = itemFrame(geometry, index);
    const isItemSelected = isSelected(selection, item.key);
    const thumbnailUrl = thumbnails.get(item.key) ?? null;
    const isDropTarget = drag?.over === item.key || dropOver === item.key;
    const itemRename = renamingKey === item.key ? rename : null;
    if (mode === 'list') {
      return (
        <ItemRow
          key={item.key}
          item={item}
          top={frame.y}
          height={frame.height}
          isStriped={index % 2 === 1}
          isSelected={isItemSelected}
          isDimmed={dimmedKeys.has(item.key)}
          isWindowActive={isWindowActive}
          isDropTarget={isDropTarget}
          rename={itemRename}
          columns={columnsShown}
          hasOriginColumn={hasOriginColumn}
          origin={hasOriginColumn ? originOf(item) : ''}
          thumbnailUrl={thumbnailUrl}
          accessibilityActions={itemActions(item)}
          onAccessibilityAction={handleAccessibilityAction}
        />
      );
    }
    // A column's start and its share of the grid's width (inside its inset):
    // Yoga places it as the width changes.
    const column = index % geometry.columns;
    return (
      <ItemCell
        key={item.key}
        item={item}
        layout={layout}
        left={`${(column * 100) / geometry.columns}%`}
        top={frame.y}
        width={`${100 / geometry.columns}%`}
        height={frame.height}
        layer={rowCount - Math.floor(index / geometry.columns)}
        isSelected={isItemSelected}
        isDimmed={dimmedKeys.has(item.key)}
        isWindowActive={isWindowActive}
        isDropTarget={isDropTarget}
        rename={itemRename}
        thumbnailUrl={thumbnailUrl}
        accessibilityActions={itemActions(item)}
        onAccessibilityAction={handleAccessibilityAction}
      />
    );
  };

  /**
   * Photos' grid, as rows of squares in the flow: each square a column's share
   * of the width, so its size follows the window in the layout pass. The rows
   * not drawn are a space as tall as they are, which is a share of the width
   * too (each row is the width over the columns, less a gap): an aspect ratio,
   * corrected by the gaps in a margin.
   */
  const renderPhotoRows = () => {
    const columns = geometry.columns;
    const rowsBefore = Math.floor(drawn.start / columns);
    const rowsAfter = Math.max(0, rowCount - Math.ceil(drawn.end / columns));
    const space = (rows: number, side: 'before' | 'after') =>
      rows > 0 ? (
        <View
          key={side}
          pointerEvents="none"
          style={{
            width: '100%',
            aspectRatio: columns / rows,
            marginBottom: PHOTO_SPACING * (rows / columns - 1),
          }}
        />
      ) : null;
    const rows: ReactNode[] = [];
    for (let start = drawn.start; start < drawn.end; start += columns) {
      const cells: ReactNode[] = [];
      for (let index = start; index < start + columns; index += 1) {
        const item = items[index];
        cells.push(
          item ? (
            renderItem(item, index)
          ) : (
            <View key={`empty-${index}`} pointerEvents="none" style={{ flex: 1 }} />
          ),
        );
      }
      rows.push(
        <View
          key={start}
          pointerEvents="box-none"
          style={{ flexDirection: 'row', gap: PHOTO_SPACING }}
        >
          {cells}
        </View>,
      );
    }
    return (
      <View pointerEvents="box-none" style={{ padding: GRID_INSET, gap: PHOTO_SPACING }}>
        {space(rowsBefore, 'before')}
        {rows}
        {space(rowsAfter, 'after')}
      </View>
    );
  };

  return (
    <ContextMenu anchor={menu?.anchor ?? null} onAnchorChange={openMenu}>
      <ContextMenuTrigger asChild label={label} style={{ flex: 1, alignSelf: 'stretch' }}>
        <View
          className="flex-1 select-none"
          // The items are one control of the keyboard's, as Finder's list is one
          // stop of the window's key view loop: Tab reaches the list, and its
          // keys (the arrows, Space, Return, type-select) act within it.
          accessible
          focusable
          accessibilityRole="list"
          accessibilityLabel={label}
          onLayout={handleLayout}
        >
          {mode === 'list' ? (
            <ListHeader
              order={order}
              onSort={onSort}
              columns={columnsShown}
              dateColumn={dateColumn}
              hasOriginColumn={hasOriginColumn}
            />
          ) : null}
          <DropZone
            accept={DROP_ACCEPT}
            actions={DROP_ACTIONS}
            disabled={!canTakeDrops}
            onDragEnter={handleDropOver}
            onDragOver={handleDropOver}
            onDragLeave={handleDropLeave}
            onDrop={handleDropFiles}
            style={FILL}
          >
            <View ref={dropZone} className="flex-1" onLayout={measureDropZone}>
              <ScrollView
                ref={scroller}
                className="flex-1"
                contentContainerClassName="grow"
                scrollEventThrottle={16}
                onLayout={viewport.onLayout}
                onScroll={handleScroll}
              >
                <View
                  ref={content}
                  testID="items"
                  className="grow"
                  style={geometry.arrangement === 'photos' ? undefined : { minHeight: height }}
                  onLayout={measureContent}
                  onPointerDown={handlePointerDown}
                  onStartShouldSetResponder={() =>
                    pointerType.current !== 'mouse' || pointerButton.current === 0
                  }
                  onResponderGrant={handleGrant}
                  onResponderMove={handleMove}
                  onResponderRelease={handleRelease}
                  onResponderTerminate={handleTerminate}
                  onResponderTerminationRequest={() => gesture.current?.isTouch ?? true}
                >
                  {geometry.arrangement === 'photos' ? (
                    renderPhotoRows()
                  ) : geometry.arrangement === 'icons' ? (
                    <View
                      pointerEvents="box-none"
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: GRID_INSET,
                        right: GRID_INSET,
                      }}
                    >
                      {items
                        .slice(drawn.start, drawn.end)
                        .map((item, offset) => renderItem(item, drawn.start + offset))}
                    </View>
                  ) : (
                    items
                      .slice(drawn.start, drawn.end)
                      .map((item, offset) => renderItem(item, drawn.start + offset))
                  )}
                  {items.length === 0 ? (
                    <View
                      pointerEvents="box-none"
                      className="absolute inset-x-0 top-20 items-center"
                    >
                      {emptyState}
                    </View>
                  ) : null}
                  {band ? (
                    <View
                      pointerEvents="none"
                      className="absolute border border-primary bg-primary/10"
                      style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
                    />
                  ) : null}
                  {drag ? (
                    <View
                      pointerEvents="none"
                      className="absolute h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2"
                      style={{ left: drag.x + 8, top: drag.y + 8 }}
                    >
                      <Text
                        variant="caption-1-semibold"
                        style={{ color: theme.colors.primaryForeground }}
                      >
                        {String(drag.keys.length)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            </View>
          </DropZone>
          {preview ? (
            <View
              ref={dragPreview}
              pointerEvents="none"
              className="absolute flex-row items-center gap-2 rounded-xl bg-primary px-3 py-2"
              style={{ left: -10000, top: 0 }}
            >
              <Text
                variant="body-2-regular"
                style={{ color: theme.colors.primaryForeground }}
                numberOfLines={1}
              >
                {preview.name}
              </Text>
              {preview.count > 1 ? (
                <Text
                  variant="caption-1-semibold"
                  style={{ color: theme.colors.primaryForeground }}
                >
                  {String(preview.count)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {menus ? (menuItem ? menus.item(menuItem) : menus.background) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
