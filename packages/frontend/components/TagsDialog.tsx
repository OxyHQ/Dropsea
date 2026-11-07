/**
 * Tags…, Finder's: the selection's tags in a panel, from the File menu, the
 * context menu, the toolbar's Tags button or the keyboard. Its field adds and
 * removes by name; under it every one of the person's tags, ticked where the
 * whole selection has it and half ticked where some of it does, a press
 * putting it on all of them or taking it off all.
 */
import { Checkbox } from '@oxy.so/bloom/checkbox';
import { Dialog } from '@oxy.so/bloom/dialog';
import { Text } from '@oxy.so/bloom/typography';
import { ScrollView, View } from 'react-native';
import { TagMark } from '@/components/TagMark';
import { TagsField } from '@/components/TagsField';
import { useLocale } from '@/hooks/use-locale';
import type { TagChange } from '@/hooks/use-tag-actions';
import { useTagDefinitions } from '@/hooks/use-tag-definitions';
import type { Item } from '@/lib/items';
import { type ItemTag, tagState, toggledTag } from '@/lib/tags';

/** The most rows of tags drawn before the list scrolls. */
const LIST_MAX_HEIGHT = 280;

export function TagsDialog({
  items,
  tagsOf,
  onChange,
  onClose,
}: {
  items: readonly Item[];
  tagsOf: (item: Item) => readonly ItemTag[];
  onChange: (change: TagChange) => void;
  onClose: () => void;
}) {
  const { strings } = useLocale();
  const { definitions } = useTagDefinitions();
  const itemsTags = items.map(tagsOf);
  return (
    <Dialog
      open
      onClose={onClose}
      title={strings.tags.editTitle(items.length, items[0]?.name ?? '')}
      testID="tags-dialog"
      actions={[{ label: strings.ok, color: 'cancel' }]}
    >
      <View className="gap-3 pt-2 pb-1">
        <TagsField itemsTags={itemsTags} onChange={onChange} testID="tags-field" />
        <ScrollView style={{ maxHeight: LIST_MAX_HEIGHT }}>
          {definitions.map((definition) => {
            const state = tagState(itemsTags, definition.name);
            return (
              <View key={definition.name} className="py-1">
                <Checkbox
                  checked={state === 'on'}
                  indeterminate={state === 'mixed'}
                  onCheckedChange={() =>
                    onChange(
                      toggledTag(itemsTags, { name: definition.name, color: definition.color }),
                    )
                  }
                  accessibilityLabel={definition.name}
                  labelContent={
                    <View className="flex-row items-center gap-2">
                      <TagMark color={definition.color} />
                      <Text variant="body-2-regular" className="text-foreground">
                        {definition.name}
                      </Text>
                    </View>
                  }
                  testID={`tag-choice-${definition.name}`}
                />
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Dialog>
  );
}
