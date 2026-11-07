/**
 * The preview pane, Finder's: the one item selected, large (a picture as
 * itself, anything else as its kind's icon), its name, its tags as a field
 * (where it takes tags) and its facts. The browser shows it beside the items
 * while exactly one is selected.
 */
import { Text } from '@oxy.so/bloom/typography';
import { View } from 'react-native';
import { ItemFacts } from '@/components/ItemFacts';
import { ItemIcon } from '@/components/ItemIcon';
import { TagsField } from '@/components/TagsField';
import type { TagChange } from '@/hooks/use-tag-actions';
import { type Item, itemKind } from '@/lib/items';
import type { ItemTag } from '@/lib/tags';

/** The preview's square: room for a picture, and a page's glyph read at a glance. */
const PREVIEW_SIZE = 160;

export function PreviewPane({
  item,
  thumbnailUrl,
  origin,
  tags,
  onTagsChange,
}: {
  item: Item;
  thumbnailUrl: string | null;
  origin: string | null;
  tags: readonly ItemTag[];
  /** Changes its tags; null where it takes none (an album, an item in a Trash). */
  onTagsChange: ((change: TagChange) => void) | null;
}) {
  return (
    <View
      className="items-center gap-3 px-4 py-5"
      accessibilityRole="summary"
      accessibilityLabel={item.name}
      testID="preview-pane"
    >
      <ItemIcon
        kind={itemKind(item)}
        size={PREVIEW_SIZE}
        thumbnailUrl={thumbnailUrl}
        testID={`preview-${item.name}`}
      />
      <Text
        variant="headline-semibold"
        numberOfLines={3}
        ellipsizeMode="middle"
        className="text-center text-foreground"
        testID="preview-name"
      >
        {item.name}
      </Text>
      {onTagsChange ? (
        <View className="w-full">
          <TagsField itemsTags={[tags]} onChange={onTagsChange} testID="preview-tags" />
        </View>
      ) : null}
      <ItemFacts item={item} origin={origin} />
    </View>
  );
}
