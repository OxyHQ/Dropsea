/**
 * Where a location's items sit, worked out from the view's width alone, as
 * Finder lays them out: a list of rows, a grid of icons spread evenly across
 * the width, or Photos' grid of square pictures. Every item's place is known
 * without drawing it, so the view draws only the items that can be seen, and a
 * press, a rubber band or a drag finds the item under it by arithmetic.
 *
 * Grouped (View › Group By), the items run in groups, each under a header row
 * of its own and each starting a row of its own, as Finder's grid and list
 * show them. Ungrouped, they are one run with no header: one model places
 * both (`placeItems`, `placeGroups`), and every question about a place (an
 * item's box, what lies between two heights, the item under a point, the
 * item below another) is answered through it. A header is never an item: a
 * press on one is a press on the background.
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
/** A group's header: a row a little taller than the list's, and a band over a grid's icons. */
const COMPACT_HEADER_HEIGHT = 32;
const TOUCH_HEADER_HEIGHT = 44;
const GRID_HEADER_HEIGHT = 36;

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
  /** A group's header's height, above its items. */
  headerHeight: number;
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
      headerHeight: rowHeight === TOUCH_ROW_HEIGHT ? TOUCH_HEADER_HEIGHT : COMPACT_HEADER_HEIGHT,
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
      headerHeight: GRID_HEADER_HEIGHT,
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
    headerHeight: GRID_HEADER_HEIGHT,
  };
}

/**
 * A run of items: a group under its header, or (ungrouped) all of them under
 * none. Its rows begin at its own first column.
 */
export interface ItemsSection {
  /** Which of the groups it is, in the order they were given (0, ungrouped). */
  group: number;
  /** Its first item's index among all the items, and how many it holds. */
  start: number;
  count: number;
  /** Its header's top, or null where the items are not grouped. */
  headerTop: number | null;
  /** Where its first row begins, and that row's number among all the rows. */
  top: number;
  firstRow: number;
  rows: number;
}

/** Where every item and header is: the geometry, and the items' runs in order. */
export interface ItemsPlacement {
  geometry: ItemsGeometry;
  sections: readonly ItemsSection[];
  count: number;
  /** All the rows, every run's together. */
  rows: number;
  /** How tall the items and headers are altogether. */
  height: number;
}

function placeSections(
  geometry: ItemsGeometry,
  counts: readonly number[],
  hasHeaders: boolean,
): ItemsPlacement {
  const sections: ItemsSection[] = [];
  let start = 0;
  let firstRow = 0;
  let y = geometry.originY;
  for (const [group, count] of counts.entries()) {
    // A group with nothing in it is not shown, as Finder shows none.
    if (count <= 0) continue;
    const rows = Math.ceil(count / geometry.columns);
    const top = hasHeaders ? y + geometry.headerHeight : y;
    sections.push({ group, start, count, headerTop: hasHeaders ? y : null, top, firstRow, rows });
    start += count;
    firstRow += rows;
    y = top + rows * geometry.pitchY;
  }
  const last = sections.at(-1);
  // The last row is as tall as an item, and the grid's padding closes it (the list has none).
  const height = last
    ? last.top + (last.rows - 1) * geometry.pitchY + geometry.cellHeight + geometry.originY
    : 0;
  return { geometry, sections, count: start, rows: firstRow, height };
}

/** The items in one run, ungrouped. */
export function placeItems(geometry: ItemsGeometry, count: number): ItemsPlacement {
  return placeSections(geometry, [count], false);
}

/** The items in groups of these sizes, in order, each under its header. */
export function placeGroups(geometry: ItemsGeometry, sizes: readonly number[]): ItemsPlacement {
  return placeSections(geometry, sizes, true);
}

/** Where the item at `index` is: its run, its row among all the rows, its column. */
export function itemPlace(
  placement: ItemsPlacement,
  index: number,
): { section: ItemsSection; row: number; column: number } | null {
  const { sections, geometry } = placement;
  // The last run starting at or before the index.
  let low = 0;
  let high = sections.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const section = sections[middle];
    if (section && section.start <= index) low = middle;
    else high = middle - 1;
  }
  const section = sections[low];
  if (!section || index < section.start || index >= section.start + section.count) return null;
  const local = index - section.start;
  return {
    section,
    row: section.firstRow + Math.floor(local / geometry.columns),
    column: local % geometry.columns,
  };
}

/** The box the item at `index` is drawn in. */
export function itemFrame(placement: ItemsPlacement, index: number): Box {
  const { geometry } = placement;
  const place = itemPlace(placement, index);
  const row = place ? place.row - place.section.firstRow : 0;
  return {
    x: geometry.originX + (place?.column ?? 0) * geometry.pitchX,
    y: (place?.section.top ?? geometry.originY) + row * geometry.pitchY,
    width: geometry.cellWidth,
    height: geometry.cellHeight,
  };
}

/**
 * What of the item at `index` a press or a rubber band touches: a whole row or
 * picture, but only an icon and its name in Finder's grid, whose cells' empty
 * corners are the background.
 */
export function itemTargets(placement: ItemsPlacement, index: number): Box[] {
  const frame = itemFrame(placement, index);
  if (placement.geometry.arrangement !== 'icons') return [frame];
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

/** The items from `start` up to (not including) `end`. */
export interface IndexRange {
  start: number;
  end: number;
}

/** The items any part of which lies between `top` and `bottom`: whole rows of each run. */
export function itemsBetween(placement: ItemsPlacement, top: number, bottom: number): IndexRange {
  const { geometry, sections } = placement;
  const rowsBottom = (section: ItemsSection) =>
    section.top + (section.rows - 1) * geometry.pitchY + geometry.cellHeight;
  // The first run reaching below the top, from the row the top is in.
  const first = sections.find((section) => rowsBottom(section) > top);
  let start = placement.count;
  if (first) {
    const row = Math.max(0, Math.floor((top - first.top) / geometry.pitchY));
    start = first.start + Math.min(first.count, row * geometry.columns);
  }
  // The last run starting above the bottom, to the row the bottom is in.
  const last = sections.findLast((section) => section.top < bottom);
  let end = 0;
  if (last) {
    const rows = Math.max(0, Math.ceil((bottom - last.top) / geometry.pitchY));
    end = last.start + Math.min(last.count, rows * geometry.columns);
  }
  return { start, end: Math.max(start, end) };
}

/** The item a point is on, or null on the background between them (a header among it). */
export function itemAt(placement: ItemsPlacement, point: { x: number; y: number }): number | null {
  const { geometry } = placement;
  const column =
    geometry.columns === 1 ? 0 : Math.floor((point.x - geometry.originX) / geometry.pitchX);
  if (column < 0 || column >= geometry.columns) return null;
  const section = placement.sections.find(
    (each) => point.y >= each.top && point.y < each.top + each.rows * geometry.pitchY,
  );
  if (!section) return null;
  const local = Math.floor((point.y - section.top) / geometry.pitchY) * geometry.columns + column;
  if (local >= section.count) return null;
  const index = section.start + local;
  const isOn = itemTargets(placement, index).some(
    (box) =>
      point.x >= box.x &&
      point.x < box.x + box.width &&
      point.y >= box.y &&
      point.y < box.y + box.height,
  );
  return isOn ? index : null;
}

/** The items a rubber band touches, in the order they are shown. */
export function itemsTouching(placement: ItemsPlacement, band: Box): number[] {
  const { start, end } = itemsBetween(placement, band.y, band.y + band.height);
  const touched: number[] = [];
  for (let index = start; index < end; index += 1) {
    if (itemTargets(placement, index).some((box) => intersects(box, band))) touched.push(index);
  }
  return touched;
}

/**
 * Where the up or down arrow goes from the item at `index`, in groups of these
 * sizes laid out `columns` across (one, a list): the same column a row up or
 * down, into the next group's first row or the previous group's last, as
 * Finder moves; a row shorter than the column, its last item. Past the last
 * row the last item, and past the first the first, as Finder holds there.
 */
export function rowStep(
  sizes: readonly number[],
  columns: number,
  index: number,
  direction: 1 | -1,
): number {
  const groups = sizes.filter((size) => size > 0);
  let start = 0;
  let group = 0;
  for (; group < groups.length; group += 1) {
    const size = groups[group] ?? 0;
    if (index < start + size) break;
    start += size;
  }
  const size = groups[group];
  if (size === undefined) return index;
  const local = index - start;
  const column = local % columns;
  const row = Math.floor(local / columns);
  if (direction > 0) {
    if (row < Math.floor((size - 1) / columns)) {
      return start + Math.min(size - 1, (row + 1) * columns + column);
    }
    const next = groups[group + 1];
    if (next === undefined) return start + size - 1;
    return start + size + Math.min(next - 1, column);
  }
  if (row > 0) return start + (row - 1) * columns + column;
  const previous = groups[group - 1];
  if (previous === undefined) return start;
  const lastRow = Math.floor((previous - 1) / columns);
  return start - previous + Math.min(previous - 1, lastRow * columns + column);
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
