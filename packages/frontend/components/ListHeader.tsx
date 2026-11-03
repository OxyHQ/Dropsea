/**
 * The list's column headers: a press sorts by that column, again reverses it.
 *
 * They are no stops of the keyboard's Tab, as Finder's column headers are not
 * in the window's key view loop: Tab goes from the items to the toolbar. A
 * pointer and a screen reader still press them (each is a button named by its
 * column and its order), and the keyboard sorts from View > Sort By.
 */
import { Button } from '@oxy.so/bloom/button';
import { RiArrowDownSLine, RiArrowUpSLine } from '@oxy.so/bloom/icons';
import { Text } from '@oxy.so/bloom/typography';
import { View } from 'react-native';
import { useLocale } from '@/hooks/use-locale';
import type { SortColumn, SortOrder } from '@/lib/sorting';

/** Which columns beside the name fit the width. */
export interface ListColumns {
  date: boolean;
  size: boolean;
  kind: boolean;
}

/** Each column's width, shared by the header and the rows. */
export const COLUMN_WIDTHS = { date: 190, size: 90, kind: 140, origin: 160 };

export function ListHeader({
  order,
  onSort,
  columns,
  dateColumn,
  hasOriginColumn,
}: {
  order: SortOrder;
  onSort: (column: SortColumn) => void;
  columns: ListColumns;
  dateColumn: 'date' | 'deleted' | 'taken';
  hasOriginColumn: boolean;
}) {
  const { strings } = useLocale();
  const header = (column: SortColumn, label: string, width: number | null) => {
    const isSorted = order.column === column;
    return (
      <View
        key={column}
        style={width === null ? undefined : { width }}
        className={width === null ? 'min-w-0 flex-1' : ''}
      >
        <Button
          size="xs"
          tone="neutral"
          appearance="plain"
          trailingIcon={
            isSorted
              ? order.direction === 'ascending'
                ? RiArrowUpSLine
                : RiArrowDownSLine
              : undefined
          }
          onPress={() => onSort(column)}
          accessibilityLabel={
            isSorted
              ? `${label}, ${order.direction === 'ascending' ? strings.ascending : strings.descending}`
              : label
          }
          testID={`column-${column}`}
          tabIndex={-1}
          className="self-start"
        >
          {label}
        </Button>
      </View>
    );
  };
  return (
    <View className="mx-2.5 h-7 flex-row items-center border-b border-border px-2">
      {header('name', strings.columns.name, null)}
      {hasOriginColumn ? (
        <Text
          variant="caption-1-medium"
          numberOfLines={1}
          className="ps-2 text-text-secondary"
          style={{ width: COLUMN_WIDTHS.origin }}
        >
          {strings.columns.origin}
        </Text>
      ) : null}
      {columns.date ? header('date', strings.columns[dateColumn], COLUMN_WIDTHS.date) : null}
      {columns.size ? header('size', strings.columns.size, COLUMN_WIDTHS.size) : null}
      {columns.kind ? header('kind', strings.columns.kind, COLUMN_WIDTHS.kind) : null}
    </View>
  );
}
