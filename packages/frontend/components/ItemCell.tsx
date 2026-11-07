/**
 * An item in a grid: Finder's icon over its name, or Photos' picture filling
 * its square. It draws itself where the grid places it (a column's share of
 * the width, so a resize moves it with no drawing; a picture's square in its
 * row) and again only when something it shows changes.
 *
 * A name runs to two lines, its last cut short where it is longer (a platform
 * cuts the middle of one line only); selected, it is shown whole, over the
 * row below if it must be, as Finder shows it. Its coloured tags are dots
 * before its name, and said after its name.
 */
import { useTheme } from '@oxy.so/bloom/theme';
import { Text } from '@oxy.so/bloom/typography';
import { type ComponentRef, memo } from 'react';
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type DimensionValue,
  View,
} from 'react-native';
import { ItemIcon } from '@/components/ItemIcon';
import type { RenameHandlers } from '@/components/ItemRow';
import { RenameField } from '@/components/RenameField';
import { TagDots, tagDots } from '@/components/TagDots';
import { useLocale } from '@/hooks/use-locale';
import { type Item, itemKind } from '@/lib/items';
import { type ItemTag, orderedTags, type TagStyle, tagColorOf } from '@/lib/tags';
import { ICON_CELL, type ItemsLayout } from '@/lib/items-layout';

export interface ItemCellProps {
  item: Item;
  layout: ItemsLayout;
  /** An icon's cell: its column's start and share of the grid's width, its row's top. A picture fills its square in its row. */
  left: DimensionValue;
  top: number;
  width: DimensionValue;
  height: number;
  /**
   * Where it is stacked: a row above the rows after it, so a selected name
   * shown whole runs over the row below. Fixed by its place, never by the
   * selection, so selecting redraws only the two items it moved between.
   */
  layer: number;
  isSelected: boolean;
  /** There, but not selectable now (the file chooser's, that the request cannot take). */
  isDimmed: boolean;
  isWindowActive: boolean;
  isDropTarget: boolean;
  /** The name's field, while the name is being edited. */
  rename: RenameHandlers | null;
  thumbnailUrl: string | null;
  /** Its tags, as they were read; drawn in the person's order. */
  tags: readonly ItemTag[];
  tagStyle: TagStyle;
  accessibilityActions: readonly AccessibilityActionInfo[];
  onAccessibilityAction: (item: Item, action: string) => void;
  /** Its view as it is drawn (null as it goes): what screen-reader focus and a menu opened from the keyboard go to. */
  onView: (key: string, view: ComponentRef<typeof View> | null) => void;
  /** What a drag of it shows (null as it goes): the whole of it, its icon over its name. */
  onImageView: (key: string, view: ComponentRef<typeof View> | null) => void;
}

export const ItemCell = memo(function ItemCell({
  item,
  layout,
  left,
  top,
  width,
  height,
  layer,
  isSelected,
  isDimmed,
  isWindowActive,
  isDropTarget,
  rename,
  thumbnailUrl,
  tags,
  tagStyle,
  accessibilityActions,
  onAccessibilityAction,
  onView,
  onImageView,
}: ItemCellProps) {
  const { strings } = useLocale();
  const theme = useTheme();
  const kind = itemKind(item);
  const shownTags = orderedTags(tags, tagStyle.order);
  const dots = tagDots(shownTags, (tag) => tagColorOf(tag, tagStyle.known));
  const tagsText =
    shownTags.length > 0 ? strings.tags.spoken(shownTags.map((tag) => tag.name)) : undefined;
  const accessibility = {
    ref: (view: ComponentRef<typeof View> | null) => {
      onView(item.key, view);
      onImageView(item.key, view);
    },
    testID: `item-${item.name}`,
    // One element for assistive technology, its icon and name read as it.
    accessible: true,
    accessibilityRole: 'listitem' as const,
    accessibilityLabel: item.name,
    accessibilityValue: tagsText === undefined ? undefined : { text: tagsText },
    'aria-selected': isSelected,
    'aria-disabled': isDimmed,
    accessibilityActions,
    onAccessibilityAction: (event: AccessibilityActionEvent) =>
      onAccessibilityAction(item, event.nativeEvent.actionName),
  };
  if (layout === 'photos') {
    return (
      <View
        {...accessibility}
        className={`bg-muted ${isDimmed ? 'opacity-50' : ''}`}
        style={{ flex: 1, aspectRatio: 1 }}
      >
        <ItemIcon
          kind={kind}
          size={ICON_CELL.icon}
          thumbnailUrl={thumbnailUrl}
          isCropped
          isFilling
          testID={`thumbnail-${item.name}`}
        />
        {isSelected || isDropTarget ? (
          <View
            pointerEvents="none"
            className={
              isSelected && isWindowActive
                ? 'absolute inset-0 border-[3px] border-primary'
                : 'absolute inset-0 border-[3px] border-text-tertiary'
            }
          />
        ) : null}
      </View>
    );
  }
  // Selected: the accent in the active window, grey in an inactive one, as Finder's.
  const labelClass = isSelected ? (isWindowActive ? 'bg-primary' : 'bg-fill-secondary') : '';
  const textClass = isSelected && isWindowActive ? 'text-primary-foreground' : 'text-foreground';
  return (
    <View
      {...accessibility}
      className={`absolute select-none items-center gap-1 pt-1.5 ${isDimmed ? 'opacity-50' : ''}`}
      style={{ left, top, width, height, zIndex: layer }}
    >
      <View
        className={
          isSelected
            ? 'rounded-[8px] bg-fill-secondary p-1'
            : isDropTarget
              ? 'rounded-[8px] bg-primary-subtle p-1'
              : 'rounded-[8px] p-1'
        }
      >
        <ItemIcon
          kind={kind}
          size={ICON_CELL.icon}
          thumbnailUrl={thumbnailUrl}
          testID={`thumbnail-${item.name}`}
        />
      </View>
      {rename && item.source === 'local' ? (
        <RenameField
          name={item.name}
          isFolder={item.isFolder}
          isCentred
          onText={rename.onText}
          onDone={rename.onDone}
        />
      ) : (
        <View className="max-w-24 flex-row items-start gap-1">
          {dots.length > 0 ? (
            <View className="pt-[5px]">
              <TagDots dots={dots} size={7} edge={theme.colors.background} />
            </View>
          ) : null}
          <View className={`min-w-0 shrink rounded-[5px] px-1.5 py-px ${labelClass}`}>
            <Text
              variant="caption-1-regular"
              numberOfLines={isSelected ? undefined : 2}
              ellipsizeMode="tail"
              selectable={false}
              className={`text-center ${textClass}`}
            >
              {item.name}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});
