import { describe, expect, test } from 'bun:test';
import {
  columnWidthRange,
  gridColumns,
  ICON_CELL,
  itemAt,
  itemFrame,
  itemPlace,
  itemsBetween,
  itemsGeometry,
  itemsTouching,
  layoutWidthThresholds,
  listColumns,
  placeGroups,
  placeItems,
  rowStep,
} from '@/lib/items-layout';

describe('the list', () => {
  const list = placeItems(itemsGeometry('list', 'files', 1000), 27);

  test('stacks compact rows on a desktop, touch-sized ones on a phone', () => {
    expect(itemFrame(list, 3)).toEqual({ x: 0, y: 84, width: 1000, height: 28 });
    expect(itemFrame(placeItems(itemsGeometry('list', 'files', 390), 27), 3).height).toBe(44);
    // A desktop window is driven by a pointer however narrow it is.
    expect(itemFrame(placeItems(itemsGeometry('list', 'files', 390, true), 27), 3).height).toBe(28);
    expect(list.height).toBe(27 * 28);
  });

  test('finds the row under a press anywhere across it, and none below the last', () => {
    expect(itemAt(list, { x: 5, y: 85 })).toBe(3);
    expect(itemAt(list, { x: 990, y: 85 })).toBe(3);
    expect(itemAt(list, { x: 500, y: 27 * 28 + 2 })).toBeNull();
  });
});

describe('the icon grid', () => {
  const width = 1042;
  const geometry = itemsGeometry('icons', 'files', width);
  const grid = placeItems(geometry, 100);

  test('spreads its columns across the width, as Finder does', () => {
    expect(geometry.columns).toBe(gridColumns(width, 'files'));
    const last = itemFrame(grid, geometry.columns - 1);
    expect(geometry.pitchX).toBeGreaterThanOrEqual(ICON_CELL.width);
    expect(last.x + last.width).toBeLessThanOrEqual(width - 12);
    expect(width - 12 - (last.x + last.width)).toBeLessThan(geometry.columns);
  });

  test('takes a press on an icon or its name, and the cell around them as the background', () => {
    const frame = itemFrame(grid, geometry.columns + 2);
    const centre = frame.x + frame.width / 2;
    expect(itemAt(grid, { x: centre, y: frame.y + 40 })).toBe(geometry.columns + 2);
    expect(itemAt(grid, { x: centre, y: frame.y + 90 })).toBe(geometry.columns + 2);
    // The cell's corner, beside the icon, is the background (a rubber band starts there).
    expect(itemAt(grid, { x: frame.x + 2, y: frame.y + 20 })).toBeNull();
    // Past the last item there is nothing.
    const fewer = placeItems(geometry, geometry.columns + 1);
    expect(itemAt(fewer, { x: centre, y: frame.y + 40 })).toBeNull();
  });

  test('a rubber band touches the icons and names it crosses, in order', () => {
    const second = itemFrame(grid, 1);
    const band = { x: second.x + second.width / 2, y: 30, width: 2 * geometry.pitchX, height: 140 };
    expect(itemsTouching(grid, band)).toEqual([
      1,
      2,
      3,
      geometry.columns + 1,
      geometry.columns + 2,
      geometry.columns + 3,
    ]);
  });
});

describe('a folder of thousands', () => {
  test('draws only the rows near what can be seen', () => {
    const list = placeItems(itemsGeometry('list', 'files', 1000), 10_000);
    const range = itemsBetween(list, 28_000 - 600, 28_000 + 1_200);
    expect(range).toEqual({ start: 978, end: 1043 });
    expect(range.end - range.start).toBeLessThan(100);
  });

  test('draws whole rows of a grid', () => {
    const geometry = itemsGeometry('icons', 'files', 1042);
    const range = itemsBetween(placeItems(geometry, 10_000), 0, 600);
    expect(range.start).toBe(0);
    expect(range.end % geometry.columns).toBe(0);
    expect(range.end).toBe(Math.ceil((600 - 12) / ICON_CELL.height) * geometry.columns);
  });
});

describe('groups', () => {
  // Three groups: 3 items, 5 items, 2 items.
  const sizes = [3, 5, 2];

  test('the list puts a header above each group, and its rows under it', () => {
    const geometry = itemsGeometry('list', 'files', 1000, true);
    const list = placeGroups(geometry, sizes);
    const header = geometry.headerHeight;
    expect(header).toBeGreaterThan(geometry.cellHeight);
    expect(list.sections.map((section) => section.headerTop)).toEqual([
      0,
      header + 3 * 28,
      2 * header + 8 * 28,
    ]);
    expect(itemFrame(list, 0).y).toBe(header);
    expect(itemFrame(list, 2).y).toBe(header + 2 * 28);
    // The second group's first row is under its own header.
    expect(itemFrame(list, 3).y).toBe(2 * header + 3 * 28);
    expect(itemFrame(list, 9).y).toBe(3 * header + 9 * 28);
    expect(list.height).toBe(3 * header + 10 * 28);
  });

  test('a press on a header is on no item; on the row under it, that row', () => {
    const list = placeGroups(itemsGeometry('list', 'files', 1000, true), sizes);
    const header = list.geometry.headerHeight;
    const second = list.sections[1]?.headerTop ?? -1;
    expect(itemAt(list, { x: 50, y: 2 })).toBeNull();
    expect(itemAt(list, { x: 50, y: second + header / 2 })).toBeNull();
    expect(itemAt(list, { x: 50, y: second + header + 1 })).toBe(3);
    expect(itemAt(list, { x: 50, y: header + 1 })).toBe(0);
    expect(itemAt(list, { x: 50, y: list.height + 1 })).toBeNull();
  });

  test('each group starts a row of its own in the grid', () => {
    const geometry = itemsGeometry('icons', 'files', 1042);
    expect(geometry.columns).toBeGreaterThan(5);
    const grid = placeGroups(geometry, sizes);
    const first = itemFrame(grid, 0);
    expect(first.y).toBe(12 + geometry.headerHeight);
    // The second group starts at the first column, a header below the first group's row.
    const second = itemFrame(grid, 3);
    expect(second.x).toBe(first.x);
    expect(second.y).toBe(first.y + ICON_CELL.height + geometry.headerHeight);
    expect(itemFrame(grid, 7).x).toBe(first.x + 4 * geometry.pitchX);
    expect(itemFrame(grid, 8).y).toBe(second.y + ICON_CELL.height + geometry.headerHeight);
    expect(grid.rows).toBe(3);
    expect(itemPlace(grid, 8)).toMatchObject({ row: 2, column: 0 });
    expect(grid.height).toBe(12 + 3 * (geometry.headerHeight + ICON_CELL.height) + 12);
  });

  test('a group longer than a row wraps within itself', () => {
    const geometry = itemsGeometry('icons', 'files', 1042);
    const columns = geometry.columns;
    const grid = placeGroups(geometry, [columns + 1, 2]);
    expect(itemFrame(grid, columns).x).toBe(itemFrame(grid, 0).x);
    expect(itemFrame(grid, columns).y).toBe(itemFrame(grid, 0).y + ICON_CELL.height);
    expect(itemFrame(grid, columns + 1).y).toBe(
      itemFrame(grid, columns).y + ICON_CELL.height + geometry.headerHeight,
    );
  });

  test('draws the rows of every group near what can be seen, and only those', () => {
    const geometry = itemsGeometry('list', 'files', 1000, true);
    const list = placeGroups(geometry, [100, 100, 100]);
    const secondHeader = list.sections[1]?.headerTop ?? -1;
    // Only the second group's header: no item lies there.
    const onHeader = itemsBetween(list, secondHeader + 1, secondHeader + 2);
    expect(onHeader.end - onHeader.start).toBe(0);
    // Across the second header: the first group's last rows and the second's first.
    const across = itemsBetween(list, secondHeader - 56, secondHeader + geometry.headerHeight + 56);
    expect(across).toEqual({ start: 98, end: 102 });
    // Below everything, nothing.
    const below = itemsBetween(list, list.height + 10, list.height + 100);
    expect(below.end - below.start).toBe(0);
  });

  test('a rubber band across a header selects the items of both groups it crosses', () => {
    const geometry = itemsGeometry('icons', 'files', 1042);
    const grid = placeGroups(geometry, sizes);
    const first = itemFrame(grid, 0);
    const band = { x: first.x + first.width / 2, y: first.y + 50, width: 1, height: 200 };
    expect(itemsTouching(grid, band)).toEqual([0, 3]);
  });

  test('an empty group takes no room', () => {
    const geometry = itemsGeometry('list', 'files', 1000, true);
    const list = placeGroups(geometry, [2, 0, 1]);
    expect(list.sections.map((section) => section.group)).toEqual([0, 2]);
    expect(itemFrame(list, 2).y).toBe(2 * geometry.headerHeight + 2 * 28);
  });

  test('ungrouped, the items are one run with no header', () => {
    const geometry = itemsGeometry('list', 'files', 1000, true);
    expect(placeItems(geometry, 10).sections).toEqual([
      { group: 0, start: 0, count: 10, headerTop: null, top: 0, firstRow: 0, rows: 10 },
    ]);
    expect(placeItems(geometry, 0).height).toBe(0);
  });
});

describe('the up and down arrows', () => {
  test('in a list, one row, across the groups', () => {
    expect(rowStep([3, 5, 2], 1, 2, 1)).toBe(3);
    expect(rowStep([3, 5, 2], 1, 3, -1)).toBe(2);
    expect(rowStep([3, 5, 2], 1, 9, 1)).toBe(9);
    expect(rowStep([3, 5, 2], 1, 0, -1)).toBe(0);
  });

  test('in a grid, the same column of the next group’s first row, or its last item', () => {
    // Four across: group one is [0 1 2], group two [3 4 5 6 / 7], group three [8 9].
    expect(rowStep([3, 5, 2], 4, 1, 1)).toBe(4);
    expect(rowStep([3, 5, 2], 4, 2, 1)).toBe(5);
    // Down within a group, to the row below; that row shorter, its last item.
    expect(rowStep([3, 5, 2], 4, 3, 1)).toBe(7);
    expect(rowStep([3, 5, 2], 4, 6, 1)).toBe(7);
    // From a group's last row to the next group's first, the column held where it fits.
    expect(rowStep([3, 5, 2], 4, 7, 1)).toBe(8);
    expect(rowStep([3, 5, 2], 4, 4, 1)).toBe(7);
    // Past the last row, the last item.
    expect(rowStep([3, 5, 2], 4, 8, 1)).toBe(9);
    expect(rowStep([3, 5, 2], 4, 9, 1)).toBe(9);
  });

  test('up a grid: the previous group’s last row, the column held where it fits', () => {
    expect(rowStep([3, 5, 2], 4, 8, -1)).toBe(7);
    expect(rowStep([3, 5, 2], 4, 9, -1)).toBe(7);
    expect(rowStep([3, 5, 2], 4, 7, -1)).toBe(3);
    expect(rowStep([3, 5, 2], 4, 6, -1)).toBe(2);
    expect(rowStep([3, 5, 2], 4, 4, -1)).toBe(1);
    expect(rowStep([3, 5, 2], 4, 2, -1)).toBe(0);
  });

  test('ungrouped, a row of columns, held at the ends', () => {
    expect(rowStep([10], 4, 1, 1)).toBe(5);
    expect(rowStep([10], 4, 6, 1)).toBe(9);
    expect(rowStep([10], 4, 9, 1)).toBe(9);
    expect(rowStep([10], 4, 5, -1)).toBe(1);
    expect(rowStep([10], 4, 2, -1)).toBe(0);
  });
});

describe('what the view redraws for as the window resizes', () => {
  test("a grid's columns change only at its thresholds", () => {
    for (const layout of ['files', 'photos'] as const) {
      const thresholds = layoutWidthThresholds('icons', layout, true);
      for (let width = 200; width < 2000; width += 1) {
        const crossed = thresholds.includes(width);
        expect(gridColumns(width, layout) !== gridColumns(width - 1, layout)).toBe(crossed);
      }
    }
  });

  test("the list's columns change only at its thresholds, its rows' height too off a desktop", () => {
    const desktop = layoutWidthThresholds('list', 'files', true);
    const phone = layoutWidthThresholds('list', 'files', false);
    for (let width = 200; width < 1200; width += 1) {
      const columnsChange =
        JSON.stringify(listColumns(width)) !== JSON.stringify(listColumns(width - 1));
      expect(columnsChange).toBe(desktop.includes(width));
      const rows = (at: number) => itemsGeometry('list', 'files', at, false).pitchY;
      expect(columnsChange || rows(width) !== rows(width - 1)).toBe(phone.includes(width));
    }
  });

  test('the widths a grid keeps its columns at', () => {
    const { least, most } = columnWidthRange(gridColumns(1042, 'files'), 'files');
    expect(gridColumns(least, 'files')).toBe(gridColumns(1042, 'files'));
    expect(gridColumns(most - 1, 'files')).toBe(gridColumns(1042, 'files'));
    expect(gridColumns(most, 'files')).toBe(gridColumns(1042, 'files') + 1);
  });
});
