/**
 * Where a location's items sit, worked out from the view's width alone, as
 * Finder lays them out: a list of rows, a grid of icons spread evenly across
 * the width, or Photos' grid of square pictures. Every item's place is known
 * without drawing it, so the view draws only the items that can be seen, and a
 * press, a rubber band or a drag finds the item under it by arithmetic.
 *
 * The view draws the same places as flex (`gridPlacement`): a column's share
 * of the width, a picture's square, so a window resizing moves the items in
 * the layout pass, with no JavaScript. Only what changes at a threshold of the
 * width redraws: a grid's columns, the list's columns, its rows' height
 * (`layoutWidthThresholds`).
 */
import { type Box, intersects } from '@/lib/selection';

export type ItemsLayout = 'files' | 'photos';

/** Finder's icon grid: its cell, the icon in it, and the padding around the grid. */
export const ICON_CELL = { width: 104, height: 112, icon: 64 };
/** The icon's square with the padding its selection draws in, from the top of the cell. */
const ICON_BOX = { top: 6, size: ICON_CELL.icon + 8 };
/** The name under the icon: the most it can be across, and two lines' height. */
const ICON_LABEL = { gap: 4, width: 96, height: 34 };
const GRID_PADDING = 12;
/** Photos' grid: square pictures at least this wide, this far apart. */
const PHOTO_MIN_SIZE = 110;
const PHOTO_GAP = 2;
/**
 * The list's rows: a desktop's compact rows, a phone's touch-sized ones below
 * this width. A platform a pointer drives (a desktop window, or the file
 * chooser's sheet) is a desktop at any width.
 */
const COMPACT_ROW_HEIGHT = 28;
const TOUCH_ROW_HEIGHT = 44;
const TOUCH_LIST_BELOW = 600;

/** How the items are arranged, and everything needed to place any one of them. */
export interface ItemsGeometry {
  arrangement: 'list' | 'icons' | 'photos';
  columns: number;
  /** The distance from one column (or row) to the next. */
  pitchX: number;
  pitchY: number;
  /** An item's box: a row, an icon's cell, a picture's square. */
  cellWidth: number;
  cellHeight: number;
  /** Where the first item's box begins. */
  originX: number;
  originY: number;
}

/** How many columns a grid has at a width, for the arrows' steps down it. */
export function gridColumns(width: number, layout: ItemsLayout): number {
  const usable = width - GRID_PADDING * 2;
  if (layout === 'photos') return Math.max(1, Math.floor((usable + PHOTO_GAP) / PHOTO_MIN_SIZE));
  return Math.max(1, Math.floor(usable / ICON_CELL.width));
}

export function itemsGeometry(
  mode: 'icons' | 'list',
  layout: ItemsLayout,
  width: number,
  isPointerDriven = false,
): ItemsGeometry {
  if (mode === 'list') {
    const rowHeight =
      !isPointerDriven && width < TOUCH_LIST_BELOW ? TOUCH_ROW_HEIGHT : COMPACT_ROW_HEIGHT;
    return {
      arrangement: 'list',
      columns: 1,
      pitchX: 0,
      pitchY: rowHeight,
      cellWidth: Math.max(width, 1),
      cellHeight: rowHeight,
      originX: 0,
      originY: 0,
    };
  }
  const columns = gridColumns(width, layout);
  const usable = Math.max(width - GRID_PADDING * 2, 0);
  if (layout === 'photos') {
    const size = Math.max(1, (usable - PHOTO_GAP * (columns - 1)) / columns);
    return {
      arrangement: 'photos',
      columns,
      pitchX: size + PHOTO_GAP,
      pitchY: size + PHOTO_GAP,
      cellWidth: size,
      cellHeight: size,
      originX: GRID_PADDING,
      originY: GRID_PADDING,
    };
  }
  // The room left over is shared between the columns, as Finder spreads its
  // icons: each column an equal share, as the view draws it (`gridPlacement`).
  const pitch = Math.max(ICON_CELL.width, usable / columns);
  return {
    arrangement: 'icons',
    columns,
    pitchX: pitch,
    pitchY: ICON_CELL.height,
    cellWidth: pitch,
    cellHeight: ICON_CELL.height,
    originX: GRID_PADDING,
    originY: GRID_PADDING,
  };
}

/** The box the item at `index` is drawn in. */
export function itemFrame(geometry: ItemsGeometry, index: number): Box {
  const column = index % geometry.columns;
  const row = Math.floor(index / geometry.columns);
  return {
    x: geometry.originX + column * geometry.pitchX,
    y: geometry.originY + row * geometry.pitchY,
    width: geometry.cellWidth,
    height: geometry.cellHeight,
  };
}

/**
 * What of the item at `index` a press or a rubber band touches: a whole row or
 * picture, but only an icon and its name in Finder's grid, whose cells' empty
 * corners are the background.
 */
export function itemTargets(geometry: ItemsGeometry, index: number): Box[] {
  const frame = itemFrame(geometry, index);
  if (geometry.arrangement !== 'icons') return [frame];
  const centre = frame.x + frame.width / 2;
  const labelTop = frame.y + ICON_BOX.top + ICON_BOX.size + ICON_LABEL.gap;
  return [
    {
      x: centre - ICON_BOX.size / 2,
      y: frame.y + ICON_BOX.top,
      width: ICON_BOX.size,
      height: ICON_BOX.size,
    },
    {
      x: centre - ICON_LABEL.width / 2,
      y: labelTop,
      width: ICON_LABEL.width,
      height: ICON_LABEL.height,
    },
  ];
}

/** How tall the items are altogether. */
export function contentHeight(geometry: ItemsGeometry, count: number): number {
  if (count === 0) return 0;
  const rows = Math.ceil(count / geometry.columns);
  const padding = geometry.arrangement === 'list' ? 0 : geometry.originY * 2;
  return padding + (rows - 1) * geometry.pitchY + geometry.cellHeight;
}

/** The items from `start` up to (not including) `end`. */
export interface IndexRange {
  start: number;
  end: number;
}

/** The items any part of which lies between `top` and `bottom`. */
export function itemsBetween(
  geometry: ItemsGeometry,
  count: number,
  top: number,
  bottom: number,
): IndexRange {
  const firstRow = Math.max(0, Math.floor((top - geometry.originY) / geometry.pitchY));
  const endRow = Math.max(0, Math.ceil((bottom - geometry.originY) / geometry.pitchY));
  return {
    start: Math.min(count, firstRow * geometry.columns),
    end: Math.min(count, endRow * geometry.columns),
  };
}

/** The item a point is on, or null on the background between them. */
export function itemAt(
  geometry: ItemsGeometry,
  count: number,
  point: { x: number; y: number },
): number | null {
  const column =
    geometry.columns === 1 ? 0 : Math.floor((point.x - geometry.originX) / geometry.pitchX);
  const row = Math.floor((point.y - geometry.originY) / geometry.pitchY);
  if (row < 0 || column < 0 || column >= geometry.columns) return null;
  const index = row * geometry.columns + column;
  if (index >= count) return null;
  const isOn = itemTargets(geometry, index).some(
    (box) =>
      point.x >= box.x &&
      point.x < box.x + box.width &&
      point.y >= box.y &&
      point.y < box.y + box.height,
  );
  return isOn ? index : null;
}

/** The items a rubber band touches, in the order they are shown. */
export function itemsTouching(geometry: ItemsGeometry, count: number, band: Box): number[] {
  const { start, end } = itemsBetween(geometry, count, band.y, band.y + band.height);
  const touched: number[] = [];
  for (let index = start; index < end; index += 1) {
    if (itemTargets(geometry, index).some((box) => intersects(box, band))) touched.push(index);
  }
  return touched;
}

/** The widths at which what the view draws changes (`useMeasuredSizeClass` in the view). */
export function layoutWidthThresholds(
  mode: 'icons' | 'list',
  layout: ItemsLayout,
  isPointerDriven: boolean,
): number[] {
  if (mode === 'list')
    return [...LIST_COLUMN_WIDTHS, ...(isPointerDriven ? [] : [TOUCH_LIST_BELOW])];
  const thresholds: number[] = [];
  for (let columns = 2; columns <= MAX_COLUMNS; columns += 1) {
    thresholds.push(
      layout === 'photos'
        ? PHOTO_MIN_SIZE * columns - PHOTO_GAP + GRID_PADDING * 2
        : ICON_CELL.width * columns + GRID_PADDING * 2,
    );
  }
  return thresholds;
}

/** The list's columns that fit a width: the name always, then date, size and kind as room allows. */
export function listColumns(width: number): {
  date: boolean;
  size: boolean;
  kind: boolean;
  tags: boolean;
} {
  return { date: width >= 420, size: width >= 520, kind: width >= 700, tags: width >= 840 };
}
const LIST_COLUMN_WIDTHS = [420, 520, 700, 840];
/** The most columns a grid is laid out with: a window this wide is wider than any screen. */
const MAX_COLUMNS = 64;

/** The grid's padding, for the view's flex placement. */
export const GRID_INSET = GRID_PADDING;
export const PHOTO_SPACING = PHOTO_GAP;

/**
 * The widths a grid's places can have while it keeps `columns`: from the width
 * that first holds them to the one that holds one more. The view, drawing from
 * columns alone, draws every item either bound could show.
 */
export function columnWidthRange(
  columns: number,
  layout: ItemsLayout,
): { least: number; most: number } {
  const width = (count: number) =>
    layout === 'photos'
      ? PHOTO_MIN_SIZE * count - PHOTO_GAP + GRID_PADDING * 2
      : ICON_CELL.width * count + GRID_PADDING * 2;
  return { least: width(columns), most: width(columns + 1) };
}
