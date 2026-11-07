/**
 * Get Info, Finder's: an item's icon, name and facts, and its tags as a field
 * to change; for several items at once, how many and the tags they all have,
 * as Finder's summary of a selection.
 */
import { Dialog } from '@oxy.so/bloom/dialog';
import { Text } from '@oxy.so/bloom/typography';
import { View } from 'react-native';
import { ItemFacts } from '@/components/ItemFacts';
import { ItemIcon } from '@/components/ItemIcon';
import { TagsField } from '@/components/TagsField';
import { useLocale } from '@/hooks/use-locale';
import { canTag, type TagChange } from '@/hooks/use-tag-actions';
import { type Item, itemKind } from '@/lib/items';
import type { ItemTag } from '@/lib/tags';

const ICON_SIZE = 64;

export function InfoDialog({
  items,
  tagsOf,
  thumbnailUrl,
  originOf,
  onChange,
  onClose,
}: {
  items: readonly Item[];
  tagsOf: (item: Item) => readonly ItemTag[];
  /** The picture of the one item, when it has one. */
  thumbnailUrl: string | null;
  originOf: (item: Item) => string;
  onChange: (change: TagChange) => void;
  onClose: () => void;
}) {
  const { strings } = useLocale();
  const [only] = items;
  const isOne = items.length === 1 && only !== undefined;
  return (
    <Dialog
      open
      onClose={onClose}
      title={isOne ? strings.info(only.name) : strings.infoOfItems(items.length)}
      testID="info-dialog"
      actions={[{ label: strings.ok, color: 'cancel' }]}
    >
      <View className="gap-4 pt-2 pb-1">
        {isOne ? (
          <View className="flex-row items-center gap-3">
            <ItemIcon kind={itemKind(only)} size={ICON_SIZE} thumbnailUrl={thumbnailUrl} />
            <Text
              variant="headline-semibold"
              numberOfLines={2}
              ellipsizeMode="middle"
              className="min-w-0 shrink text-foreground"
            >
              {only.name}
            </Text>
          </View>
        ) : null}
        {items.every(canTag) ? (
          <TagsField itemsTags={items.map(tagsOf)} onChange={onChange} testID="info-tags" />
        ) : null}
        {isOne ? <ItemFacts item={only} origin={originOf(only) || null} /> : null}
      </View>
    </Dialog>
  );
}
